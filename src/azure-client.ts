import type { Response } from 'express';
import { STATIC_MODEL_ID } from './adapters';
import { logger } from './utils/logger';
import { cacheStreamResponse, clearStreamCache, generateRequestId } from './utils/redis-cache';
import { playChatCompletionSoundAsync } from './utils/sound-notification';
import { speakSummary } from './utils/voice-summary';
import { logPromptCacheUsage, toAnthropicInputUsage } from './utils/prompt-cache-usage';
import { withAzurePromptCacheKey } from './utils/azure-prompt-cache';

// ════════════════════════════════════════════════════════════════════════════
// Azure OpenAI Client Configuration
// ════════════════════════════════════════════════════════════════════════════

const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview';
const AZURE_MAX_RETRIES = Number(process.env.AZURE_MAX_RETRIES ?? '2');
const AZURE_RETRY_BASE_MS = Number(process.env.AZURE_RETRY_BASE_MS ?? '300');

if (!AZURE_OPENAI_API_KEY) {
  logger?.warn('AZURE_OPENAI_API_KEY is not set — Azure requests will fail with 401.');
}

if (!AZURE_OPENAI_ENDPOINT) {
  logger?.warn('AZURE_OPENAI_ENDPOINT is not set — Azure requests will fail.');
}

function azureHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-key': AZURE_OPENAI_API_KEY ?? '',
  };
}

function openaiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AZURE_OPENAI_API_KEY ?? ''}`,
  };
}

function normalizeAzurePayload(
  body: Record<string, unknown>,
  deployment: string,
): Record<string, unknown> {
  let payload = body;

  if (deployment.toLowerCase().includes('-sol') && payload['max_tokens'] !== undefined) {
    const { max_tokens: maxCompletionTokens, ...rest } = payload;
    payload = {
      ...rest,
      max_completion_tokens: rest['max_completion_tokens'] ?? maxCompletionTokens,
    };
  }

  return withAzurePromptCacheKey(payload, deployment);
}

// ════════════════════════════════════════════════════════════════════════════
// Request/Response Transformation
// ════════════════════════════════════════════════════════════════════════════

const OPENAI_TO_ANTHROPIC_STOP: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'end_turn',
};

/** Anthropic request body → OpenAI chat/completions request body */
function anthropicBodyToOpenAI(body: Record<string, unknown>): Record<string, unknown> {
  const messages: Record<string, unknown>[] = [];

  if (body['system']) {
    const sys = typeof body['system'] === 'string' ? body['system'] : JSON.stringify(body['system']);
    messages.push({ role: 'system', content: sys });
  }

  for (const m of (body['messages'] as Record<string, unknown>[] | undefined) ?? []) {
    const role = m['role'] as string;
    const content = m['content'];

    if (typeof content === 'string') {
      messages.push({ role, content });
      continue;
    }
    if (!Array.isArray(content)) continue;

    const textParts: string[] = [];
    const toolCalls: Record<string, unknown>[] = [];

    for (const block of content as Record<string, unknown>[]) {
      if (block['type'] === 'text') {
        textParts.push(String(block['text'] ?? ''));
      } else if (block['type'] === 'tool_use') {
        toolCalls.push({
          id: block['id'],
          type: 'function',
          function: { name: block['name'], arguments: JSON.stringify(block['input'] ?? {}) },
        });
      } else if (block['type'] === 'tool_result') {
        const raw = block['content'];
        const text =
          typeof raw === 'string'
            ? raw
            : Array.isArray(raw)
              ? (raw as Record<string, unknown>[]).map((c) => c['text'] ?? '').join('\n')
              : String(raw ?? '');
        messages.push({ role: 'tool', tool_call_id: block['tool_use_id'], content: text });
      }
    }

    if (textParts.length || toolCalls.length) {
      const msg: Record<string, unknown> = { role, content: textParts.join('\n') || null };
      if (toolCalls.length) msg['tool_calls'] = toolCalls;
      messages.push(msg);
    }
  }

  const tools = body['tools'] as Record<string, unknown>[] | undefined;
  const openaiTools = tools?.length
    ? tools
        .filter((t) => t['name'])
        .map((t) => ({
          type: 'function',
          function: {
            name: t['name'],
            ...(t['description'] ? { description: t['description'] } : {}),
            ...(t['input_schema'] ? { parameters: t['input_schema'] } : {}),
          },
        }))
    : undefined;

  return {
    model: STATIC_MODEL_ID,
    messages,
    max_tokens: body['max_tokens'],
    ...(body['temperature'] !== undefined ? { temperature: body['temperature'] } : {}),
    ...(body['top_p'] !== undefined ? { top_p: body['top_p'] } : {}),
    ...(openaiTools ? { tools: openaiTools } : {}),
  };
}

/** Non-streaming OpenAI ChatCompletion response → Anthropic Messages response */
function openAIResponseToAnthropic(json: Record<string, unknown>): Record<string, unknown> {
  const choice = (json['choices'] as Record<string, unknown>[] | undefined)?.[0];
  const message = choice?.['message'] as Record<string, unknown> | undefined;
  const content: Record<string, unknown>[] = [];

  const text = message?.['content'];
  if (typeof text === 'string' && text) content.push({ type: 'text', text });

  const toolCalls = message?.['tool_calls'] as Record<string, unknown>[] | undefined;
  for (const tc of toolCalls ?? []) {
    const fn = tc['function'] as Record<string, unknown>;
    let input: unknown = {};
    try {
      input = JSON.parse(String(fn['arguments'] ?? '{}'));
    } catch {
      // leave input as {}
    }
    content.push({ type: 'tool_use', id: tc['id'], name: fn['name'], input });
  }

  const usage = json['usage'] as Record<string, unknown> | undefined;
  return {
    id: json['id'] ?? `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: STATIC_MODEL_ID,
    stop_reason: OPENAI_TO_ANTHROPIC_STOP[choice?.['finish_reason'] as string] ?? 'end_turn',
    stop_sequence: null,
    usage: {
      ...toAnthropicInputUsage(usage),
      output_tokens: usage?.['completion_tokens'] ?? 0,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Streaming Helpers
// ════════════════════════════════════════════════════════════════════════════

async function readErrorBody(res: globalThis.Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<unreadable error body>';
  }
}

function parseRetryAfterMs(retryAfter: string | null): number | undefined {
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  return undefined;
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) return retryAfterMs;
  const base = AZURE_RETRY_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 120);
  return base + jitter;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAzureWithRetry(
  url: string,
  init: RequestInit,
  errorLabel: 'Azure error' | 'Azure stream error',
): Promise<globalThis.Response> {
  let lastErrorText = '<no response body>';
  let lastStatus = 500;

  for (let attempt = 0; attempt <= AZURE_MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    lastStatus = res.status;
    lastErrorText = await readErrorBody(res);
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
    const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < AZURE_MAX_RETRIES;

    logger?.error(errorLabel, { status: res.status, errText: lastErrorText, attempt });

    if (!shouldRetry) {
      throw new Error(`${errorLabel} ${res.status}: ${lastErrorText}`);
    }

    await wait(backoffMs(attempt, retryAfterMs));
  }

  throw new Error(`${errorLabel} ${lastStatus}: ${lastErrorText}`);
}

/** Reads an OpenAI-format SSE stream from Azure and re-emits it as Anthropic-format SSE events */
async function streamOpenAIAsAnthropicSSE(
  upstream: globalThis.Response,
  res: Response,
  requestId: string,
  responseText: string[],
  onTextDelta?: (text: string) => void,
): Promise<void> {
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const sseWrite = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sseWrite('message_start', {
    type: 'message_start',
    message: {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: STATIC_MODEL_ID,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });
  sseWrite('ping', { type: 'ping' });

  let textStarted = false;
  const toolStarted = new Set<number>();
  let stopReason = 'end_turn';
  let outputTokens = 0;

  const handleEvent = (json: Record<string, unknown>) => {
    const choice = (json['choices'] as Record<string, unknown>[] | undefined)?.[0];
    const delta = choice?.['delta'] as Record<string, unknown> | undefined;

    if (delta?.['content']) {
      const text = String(delta['content']);
      if (!textStarted) {
        textStarted = true;
        sseWrite('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        });
      }
      responseText.push(text);
      onTextDelta?.(text);
      cacheStreamResponse(requestId, text);
      sseWrite('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      });
    }

    const toolCalls = delta?.['tool_calls'] as Record<string, unknown>[] | undefined;
    for (const tc of toolCalls ?? []) {
      const idx = ((tc['index'] as number) ?? 0) + 1;
      const fn = tc['function'] as Record<string, unknown> | undefined;
      if (!toolStarted.has(idx)) {
        toolStarted.add(idx);
        sseWrite('content_block_start', {
          type: 'content_block_start',
          index: idx,
          content_block: { type: 'tool_use', id: tc['id'], name: fn?.['name'], input: {} },
        });
      }
      if (fn?.['arguments']) {
        sseWrite('content_block_delta', {
          type: 'content_block_delta',
          index: idx,
          delta: { type: 'input_json_delta', partial_json: fn['arguments'] },
        });
      }
    }

    const finish = choice?.['finish_reason'] as string | undefined;
    if (finish) stopReason = OPENAI_TO_ANTHROPIC_STOP[finish] ?? 'end_turn';

    const usage = json['usage'] as Record<string, unknown> | undefined;
    if (usage?.['completion_tokens'] !== undefined) outputTokens = usage['completion_tokens'] as number;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const raw = dataLine.slice(5).trim();
      if (raw === '[DONE]') continue;
      try {
        handleEvent(JSON.parse(raw));
      } catch {
        // partial JSON
      }
    }
  }

  if (textStarted) sseWrite('content_block_stop', { type: 'content_block_stop', index: 0 });
  for (const idx of toolStarted) sseWrite('content_block_stop', { type: 'content_block_stop', index: idx });

  sseWrite('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  });
  sseWrite('message_stop', { type: 'message_stop' });
  res.end();
  playChatCompletionSoundAsync();
}

/** Parse complete SSE blocks out of a buffer, calling onText for each OpenAI delta.content */
function extractOpenAIDeltas(buffer: string, onText: (text: string) => void): string {
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';
  for (const part of parts) {
    const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
    if (!dataLine) continue;
    const raw = dataLine.slice(5).trim();
    if (raw === '[DONE]') continue;
    try {
      const json = JSON.parse(raw);
      const text = json?.choices?.[0]?.delta?.content;
      if (text) onText(text);
    } catch {
      // Partial/malformed JSON
    }
  }
  return remainder;
}

// ════════════════════════════════════════════════════════════════════════════
// Main API Functions - Anthropic Format
// ════════════════════════════════════════════════════════════════════════════

/** Non-streaming: Convert Anthropic request to OpenAI, call Azure, convert response back */
export async function invokeModel(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-deployment';
  const payload = normalizeAzurePayload(anthropicBodyToOpenAI(body), deployment);

  const endpoint = AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  if (!endpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT is not configured');
  }
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

  const res = await fetchAzureWithRetry(url, {
    method: 'POST',
    headers: azureHeaders(),
    body: JSON.stringify(payload),
  }, 'Azure error');

  const result = openAIResponseToAnthropic((await res.json()) as Record<string, unknown>);
  logPromptCacheUsage(logger, 'azure-openai', String(payload['model'] ?? deployment), result['usage']);
  playChatCompletionSoundAsync();
  speakSummaryAsync(anthropicResponseText(result));
  return result;
}

/** Streaming: Convert Anthropic request to OpenAI, stream Azure response as Anthropic SSE */
export async function invokeModelStream(
  body: Record<string, unknown>,
  res: Response,
  onTextDelta?: (text: string) => void,
): Promise<string[]> {
  const requestId = generateRequestId();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-deployment';
  const payload = normalizeAzurePayload(anthropicBodyToOpenAI({ ...body, stream: true }), deployment);

  const endpoint = AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  if (!endpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT is not configured');
  }
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

  const upstream = await fetchAzureWithRetry(url, {
    method: 'POST',
    headers: azureHeaders(),
    body: JSON.stringify(payload),
  }, 'Azure stream error');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const responseText: string[] = [];
  await streamOpenAIAsAnthropicSSE(upstream, res, requestId, responseText, onTextDelta);
  return responseText;
}

// ════════════════════════════════════════════════════════════════════════════
// Main API Functions - OpenAI Format (Native support)
// ════════════════════════════════════════════════════════════════════════════

/** Non-streaming: Direct OpenAI-format request to Azure */
export async function invokeModelOpenAI(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const endpoint = AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-deployment';
  const payload = normalizeAzurePayload(body, deployment);

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

  if (!AZURE_OPENAI_ENDPOINT) {
    throw new Error('AZURE_OPENAI_ENDPOINT is not configured');
  }

  const res = await fetchAzureWithRetry(url, {
    method: 'POST',
    headers: azureHeaders(),
    body: JSON.stringify(payload),
  }, 'Azure error');

  const result = (await res.json()) as Record<string, unknown>;
  logPromptCacheUsage(logger, 'azure-openai', String(payload['model'] ?? deployment), result['usage']);
  playChatCompletionSoundAsync();
  speakSummaryAsync(openAIResponseText(result));
  return result;
}

/** Streaming: Direct OpenAI-format stream request to Azure */
export async function invokeModelStreamOpenAI(
  body: Record<string, unknown>,
  res: Response,
  onTextDelta?: (text: string) => void,
): Promise<string[]> {
  const requestId = generateRequestId();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-deployment';
  const payload = normalizeAzurePayload({ ...body, stream: true }, deployment);

  const endpoint = AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  if (!endpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT is not configured');
  }
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

  const upstream = await fetchAzureWithRetry(url, {
    method: 'POST',
    headers: azureHeaders(),
    body: JSON.stringify(payload),
  }, 'Azure stream error');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const responseText: string[] = [];
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    res.write(chunk);
    buffer = extractOpenAIDeltas(buffer + chunk, (text) => {
      responseText.push(text);
      onTextDelta?.(text);
      cacheStreamResponse(requestId, text);
    });
  }

  res.end();
  playChatCompletionSoundAsync();
  speakSummaryAsync(responseText.join(''));
  return responseText;
}

function speakSummaryAsync(text: string): void {
  if (text.trim()) void speakSummary(text);
}

function anthropicResponseText(result: Record<string, unknown>): string {
  const content = result['content'];
  if (!Array.isArray(content)) return '';

  return (content as Record<string, unknown>[])
    .filter((block) => block['type'] === 'text' && typeof block['text'] === 'string')
    .map((block) => String(block['text']))
    .join(' ');
}

function openAIResponseText(result: Record<string, unknown>): string {
  const choices = result['choices'];
  if (!Array.isArray(choices)) return '';
  const message = (choices[0] as Record<string, unknown> | undefined)?.['message'];
  if (!message || typeof message !== 'object') return '';
  const content = (message as Record<string, unknown>)['content'];
  return typeof content === 'string' ? content : '';
}
