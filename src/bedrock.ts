import type { Response } from 'express';
import { STATIC_MODEL_ID } from './adapters';
import { logger } from './utils/logger';
import { cacheStreamResponse, clearStreamCache, generateRequestId } from './utils/redis-cache';
import { playChatCompletionSoundAsync } from './utils/sound-notification';
import { speakSummary } from './utils/voice-summary';

// ════════════════════════════════════════════════════════════════════════════
// Mantle client config
//
// GLM-5 (and other open-weight/third-party models) live on the bedrock-mantle
// endpoint, not the classic bedrock-runtime Converse API. Mantle authenticates
// with a Bedrock API key (bearer token / x-api-key), not AWS SigV4 access
// keys — that mismatch was the root cause of the
// `UnrecognizedClientException: The security token included in the request
// is invalid` error you were seeing.
// ════════════════════════════════════════════════════════════════════════════

const MANTLE_REGION = process.env.AWS_REGION ?? 'ap-south-1';
const MANTLE_BASE_URL =
  process.env.ANTHROPIC_BEDROCK_MANTLE_BASE_URL ?? `https://bedrock-mantle.${MANTLE_REGION}.api.aws`;
const MANTLE_API_KEY = process.env.BEDROCK_MANTLE_API_KEY;

if (!MANTLE_API_KEY) {
  logger?.warn('BEDROCK_MANTLE_API_KEY is not set — Mantle requests will fail with 401/403.');
}

function anthropicHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': MANTLE_API_KEY ?? '',
    'anthropic-version': '2023-06-01',
  };
}

function openaiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${MANTLE_API_KEY ?? ''}`,
  };
}

// Native Claude models on Mantle (anthropic.*) support the real Anthropic Messages API.
// Everything else (zai.*, qwen.*, deepseek.*, ...) is OpenAI-surface-only on Mantle, so
// those requests need to be translated: Anthropic-in → OpenAI-shape-to-Mantle → Anthropic-out.
const IS_NATIVE_ANTHROPIC_MODEL = STATIC_MODEL_ID.startsWith('anthropic.');

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
        .filter((t) => t['name']) // Require name as minimum
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
      input_tokens: usage?.['prompt_tokens'] ?? 0,
      output_tokens: usage?.['completion_tokens'] ?? 0,
    },
  };
}

/** Reads an OpenAI-format SSE stream from Mantle and re-emits it as Anthropic-format SSE events,
 *  so a client expecting the native Messages API protocol (e.g. VS Code's customendpoint) still
 *  works against a model that only speaks the OpenAI surface on Mantle. */
async function streamOpenAIAsAnthropicSSE(
  upstream: globalThis.Response,
  res: Response,
  requestId: string,
  responseText: string[],
  onTextDelta?: (text: string) => void,
): Promise<[string, number]> { // returns [stopReason, toolCount]
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
      const idx = ((tc['index'] as number) ?? 0) + 1; // offset by 1: index 0 is reserved for text
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
        // partial JSON — wait for more data
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
  return [stopReason, toolStarted.size];
}

async function readErrorBody(res: globalThis.Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<unreadable error body>';
  }
}

/** Parse complete SSE blocks out of a buffer, calling onText for each Anthropic text_delta.
 *  Returns the leftover partial block so callers can carry it into the next chunk. */
function extractAnthropicTextDeltas(buffer: string, onText: (text: string) => void): string {
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';
  for (const part of parts) {
    const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
    if (!dataLine) continue;
    try {
      const json = JSON.parse(dataLine.slice(5).trim());
      if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta' && json.delta.text) {
        onText(json.delta.text);
      }
    } catch {
      // Partial/malformed JSON — wait for more data
    }
  }
  return remainder;
}

/** Same idea, for OpenAI-format `choices[0].delta.content` chunks. */
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
      // Partial/malformed JSON — wait for more data
    }
  }
  return remainder;
}

// ════════════════════════════════════════════════════════════════════════════
// Anthropic-format functions
// ════════════════════════════════════════════════════════════════════════════

/** Non-streaming: for native anthropic.* Mantle models, forward the Anthropic-shape request as-is.
 *  For everything else (GLM, Qwen, DeepSeek, ...), Mantle only exposes those over its OpenAI-compatible
 *  surface, so translate the request there and translate the response back to Anthropic shape. */
export async function invokeModel(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (IS_NATIVE_ANTHROPIC_MODEL) {
    const payload = { ...body, model: STATIC_MODEL_ID };
    const res = await fetch(`${MANTLE_BASE_URL}/anthropic/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await readErrorBody(res);
      logger?.error('Mantle error', { status: res.status, errText });
      throw new Error(`Mantle error ${res.status}: ${errText}`);
    }

    return (await res.json()) as Record<string, unknown>;
  }

  const payload = anthropicBodyToOpenAI(body);
  const res = await fetch(`${MANTLE_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await readErrorBody(res);
    logger?.error('Mantle error', { status: res.status, errText });
    throw new Error(`Mantle error ${res.status}: ${errText}`);
  }

  return openAIResponseToAnthropic((await res.json()) as Record<string, unknown>);
}

/** Streaming: for native anthropic.* Mantle models, pipe SSE bytes straight through unmodified.
 *  For everything else, call Mantle's OpenAI-compatible stream and translate each chunk into
 *  proper Anthropic SSE events on the fly. Either way, text deltas are skimmed off for Redis
 *  caching and the Telegram notification. */
export async function invokeModelStream(
  body: Record<string, unknown>,
  res: Response,
  onTextDelta?: (text: string) => void,
): Promise<string[]> {
  const requestId = generateRequestId();
  const responseText: string[] = [];
  let stopReason = 'end_turn';
  let toolCount = 0;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (IS_NATIVE_ANTHROPIC_MODEL) {
      const payload = { ...body, model: STATIC_MODEL_ID, stream: true };
      const upstream = await fetch(`${MANTLE_BASE_URL}/anthropic/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(),
        body: JSON.stringify(payload),
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await readErrorBody(upstream);
        logger?.error('Mantle stream error', { status: upstream.status, errText });
        throw new Error(`Mantle error ${upstream.status}: ${errText}`);
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = decoder.decode(value, { stream: true });
        buffer += chunkStr;
        res.write(chunkStr); // pass the SSE bytes straight through, unmodified

        buffer = extractAnthropicTextDeltas(buffer, (text) => {
          responseText.push(text);
          onTextDelta?.(text);
          cacheStreamResponse(requestId, text);
        });
      }

      res.end();
    } else {
      const payload = { ...anthropicBodyToOpenAI(body), stream: true };
      const upstream = await fetch(`${MANTLE_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(),
        body: JSON.stringify(payload),
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await readErrorBody(upstream);
        logger?.error('Mantle stream error', { status: upstream.status, errText });
        throw new Error(`Mantle error ${upstream.status}: ${errText}`);
      }

      [stopReason, toolCount] = await streamOpenAIAsAnthropicSSE(
        upstream,
        res,
        requestId,
        responseText,
        onTextDelta,
      );
    }
  } catch (error) {
    console.error('[Stream Error]', error);
    throw error;
  } finally {
    await clearStreamCache(requestId);
  }

  if (stopReason === 'end_turn') {
    playChatCompletionSoundAsync();
    await speakSummary(responseText.join(''), toolCount);
  }
  return responseText;
}

// ════════════════════════════════════════════════════════════════════════════
// OpenAI-format functions
// ════════════════════════════════════════════════════════════════════════════

/** Sanitize an OpenAI-format request body before forwarding to Mantle.
 *  - Ensures the model is set to the configured static model
 *  - Strips malformed tools (missing `function.name`) and omits `tools` entirely if the
 *    cleaned list is empty (Mantle rejects `tools: []`) */
function buildOpenAIPayload(body: Record<string, unknown>): Record<string, unknown> {
  const rawTools = body['tools'] as Record<string, unknown>[] | undefined;

  const cleanedTools = rawTools
    ?.filter((t) => {
      const fn = t['function'] as Record<string, unknown> | undefined;
      return fn && fn['name'];
    })
    .map((t) => {
      const fn = t['function'] as Record<string, unknown>;
      return {
        type: 'function',
        function: {
          name: fn['name'],
          ...(fn['description'] ? { description: fn['description'] } : {}),
          ...(fn['parameters'] ? { parameters: fn['parameters'] } : {}),
        },
      };
    });

  const payload: Record<string, unknown> = { ...body, model: STATIC_MODEL_ID };
  // Omit `tools` entirely when empty — Mantle rejects an empty tools array
  if (cleanedTools?.length) {
    payload['tools'] = cleanedTools;
  } else {
    delete payload['tools'];
  }
  return payload;
}

/** Non-streaming: forward OpenAI-shape request straight to Mantle's OpenAI-compatible endpoint. */
export async function invokeModelOpenAI(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload = buildOpenAIPayload(body);
  const res = await fetch(`${MANTLE_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await readErrorBody(res);
    logger?.error('Mantle error', { status: res.status, errText });
    throw new Error(`Mantle error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  logger?.debug('Mantle OpenAI response', { json });
  return json as Record<string, unknown>;
}

/** Streaming: pipe Mantle's OpenAI-format SSE chunks straight through. */
export async function invokeModelStreamOpenAI(
  body: Record<string, unknown>,
  res: Response,
  onTextDelta?: (text: string) => void,
): Promise<string[]> {
  const payload = { ...buildOpenAIPayload(body), stream: true };
  const requestId = generateRequestId();
  const responseText: string[] = [];
  let finishReason = 'stop';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const upstream = await fetch(`${MANTLE_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: openaiHeaders(),
      body: JSON.stringify(payload),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await readErrorBody(upstream);
      logger?.error('Mantle stream error', { status: upstream.status, errText });
      throw new Error(`Mantle error ${upstream.status}: ${errText}`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkStr = decoder.decode(value, { stream: true });
      buffer += chunkStr;
      res.write(chunkStr);

      buffer = extractOpenAIDeltas(buffer, (text) => {
        responseText.push(text);
        onTextDelta?.(text);
        cacheStreamResponse(requestId, text);
      });

      // track finish_reason to detect tool_calls vs stop
      const match = chunkStr.match(/"finish_reason"\s*:\s*"([^"]+)"/);
      if (match) finishReason = match[1];
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('[Stream Error]', error);
    throw error;
  } finally {
    await clearStreamCache(requestId);
  }

  if (finishReason !== 'tool_calls') {
    playChatCompletionSoundAsync();
    await speakSummary(responseText.join(''));
  }
  return responseText;
}

// import {
//   BedrockRuntimeClient,
//   ConverseCommand,
//   ConverseStreamCommand,
//   type ConverseCommandInput,
//   type ConverseStreamCommandInput,
// } from '@aws-sdk/client-bedrock-runtime';
// import type { Response } from 'express';
// import { toConverseInput, fromConverseResponse, STATIC_MODEL_ID, openaiToConverseInput, fromConverseResponseOpenAI } from './adapters';
// import { logger } from './utils/logger';
// import { cacheStreamResponse, clearStreamCache, generateRequestId } from './utils/redis-cache';

// function makeClient(): BedrockRuntimeClient {
//   const region = process.env.AWS_REGION ?? 'us-east-1';
//   if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
//     return new BedrockRuntimeClient({
//       region,
//       credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//         ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
//       },
//     });
//   }
//   return new BedrockRuntimeClient({ region });
// }

// const client = makeClient();

// function sseWrite(res: Response, event: string, data: unknown): void {
//   res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
// }

// /** Non-streaming: use Converse API and return Anthropic-format response */
// export async function invokeModel(
//   body: Record<string, unknown>,
// ): Promise<Record<string, unknown>> {
//   const input = toConverseInput(body) as unknown as ConverseCommandInput;
//   const response = await client.send(new ConverseCommand(input));
//   return fromConverseResponse(response as unknown as Record<string, unknown>);
// }

// /** Streaming: use ConverseStream and emit Anthropic SSE events */
// export async function invokeModelStream(
//   body: Record<string, unknown>,
//   res: Response,
// ): Promise<void> {
//   const input = toConverseInput(body);

//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');

//   // Generate unique request ID for caching
//   const requestId = generateRequestId();
//   const responseText: string[] = []; // Collect text chunks for Telegram
  
//   try {
//     const response = await client.send(new ConverseStreamCommand(input as unknown as ConverseStreamCommandInput));

//   // ── message_start ─────────────────────────────────────────────────────────
//   sseWrite(res, 'message_start', {
//     type: 'message_start',
//     message: {
//       id: `msg_${Date.now()}`,
//       type: 'message',
//       role: 'assistant',
//       content: [],
//       model: STATIC_MODEL_ID,
//       stop_reason: null,
//       stop_sequence: null,
//       usage: { input_tokens: 0, output_tokens: 0 },
//     },
//   });
//   sseWrite(res, 'ping', { type: 'ping' });

//   const STOP_MAP: Record<string, string> = {
//     end_turn: 'end_turn', tool_use: 'tool_use',
//     max_tokens: 'max_tokens', stop_sequence: 'stop_sequence',
//   };

//   let stopReason = 'end_turn';
//   let outputTokens = 0;
//   const started = new Set<number>();

//   for await (const event of (response.stream ?? [])) {
//     // content_block_start
//     if (event.contentBlockStart) {
//       const { contentBlockIndex, start } = event.contentBlockStart;
//       const idx = contentBlockIndex ?? 0;
//       started.add(idx);
//       if (start?.toolUse) {
//         sseWrite(res, 'content_block_start', {
//           type: 'content_block_start', index: idx,
//           content_block: { type: 'tool_use', id: start.toolUse.toolUseId, name: start.toolUse.name, input: {} },
//         });
//       } else {
//         sseWrite(res, 'content_block_start', {
//           type: 'content_block_start', index: idx,
//           content_block: { type: 'text', text: '' },
//         });
//       }
//     }

//     // content_block_delta
//     if (event.contentBlockDelta) {
//       const { contentBlockIndex, delta } = event.contentBlockDelta;
//       const idx = contentBlockIndex ?? 0;
//       if (!started.has(idx)) {
//         started.add(idx);
//         sseWrite(res, 'content_block_start', {
//           type: 'content_block_start', index: idx,
//           content_block: { type: 'text', text: '' },
//         });
//       }
//       if (delta?.text !== undefined) {
//         responseText.push(delta.text); // Collect for Telegram
        
//         // Cache chunk to Redis
//         cacheStreamResponse(requestId, delta.text);
        
//         sseWrite(res, 'content_block_delta', {
//           type: 'content_block_delta', index: idx,
//           delta: { type: 'text_delta', text: delta.text },
//         });
//       } else if ((delta as unknown as Record<string, unknown>)?.['toolUse']) {
//         const tu = (delta as unknown as Record<string, unknown>)['toolUse'] as Record<string, unknown>;
//         sseWrite(res, 'content_block_delta', {
//           type: 'content_block_delta', index: idx,
//           delta: { type: 'input_json_delta', partial_json: tu['input'] ?? '' },
//         });
//       }
//     }

//     // content_block_stop
//     if (event.contentBlockStop) {
//       sseWrite(res, 'content_block_stop', {
//         type: 'content_block_stop', index: event.contentBlockStop.contentBlockIndex,
//       });
//     }

//     // messageStop
//     if (event.messageStop) {
//       stopReason = STOP_MAP[event.messageStop.stopReason ?? ''] ?? 'end_turn';
//     }

//     // metadata (usage)
//     if ((event as unknown as Record<string, unknown>)['metadata']) {
//       const meta = (event as unknown as Record<string, unknown>)['metadata'] as Record<string, unknown>;
//       const usage = meta['usage'] as Record<string, unknown> | undefined;
//       outputTokens = (usage?.['outputTokens'] as number) ?? 0;
//     }
//   }

//   sseWrite(res, 'message_delta', {
//     type: 'message_delta',
//     delta: { stop_reason: stopReason, stop_sequence: null },
//     usage: { output_tokens: outputTokens },
//   });
//   sseWrite(res, 'message_stop', { type: 'message_stop' });
//   res.end();
//   } catch (error) {
//     console.error('[Stream Error]', error);
//     throw error;
//   } finally {
//     // Clear Redis cache on ALL exit paths (success, error, disconnect)
//     await clearStreamCache(requestId);
//   }

//   // Send Telegram notification with response content (no sound - handled elsewhere)
//   try {
//     if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
//       const https = require('https');
//       const fullText = responseText.join('');
//       const maxLen = 4000;
//       const textToSend = fullText.length > maxLen 
//         ? fullText.substring(0, maxLen) + '...\n[truncated]'
//         : fullText;
      
//       const message = encodeURIComponent(`📱 Response:\n\n${textToSend}`);
//       const path = `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${process.env.TELEGRAM_CHAT_ID}&text=${message}`;
      
//       const req = https.request({
//         hostname: 'api.telegram.org',
//         port: 443,
//         path: path,
//         method: 'GET',
//         timeout: 5000
//       }, (res: any) => {
//         // Consume response to avoid memory leaks
//         res.on('data', () => {});
//         res.on('error', (err: Error) => {
//           console.error('[Telegram Notify Error]', err.message);
//         });
//       });
      
//       req.on('error', (err: Error) => {
//         console.error('[Telegram Notify Error]', err.message);
//       });
      
//       req.on('timeout', () => {
//         req.destroy();
//         console.error('[Telegram Notify Error] Request timeout');
//       });
      
//       req.end();
//     }
//   } catch (e) {
//     // Ignore notification errors
//   }
// }

// // ════════════════════════════════════════════════════════════════════════════
// // OpenAI-format functions
// // ════════════════════════════════════════════════════════════════════════════

// /** Non-streaming: Converse API → OpenAI ChatCompletion response */
// export async function invokeModelOpenAI(
//   body: Record<string, unknown>,
// ): Promise<Record<string, unknown>> {
//   const input = openaiToConverseInput(body) as unknown as ConverseCommandInput;
//   const response = await client.send(new ConverseCommand(input));
//   logger?.debug('Converse response', { response });
//   return fromConverseResponseOpenAI(response as unknown as Record<string, unknown>);
// }

// /** Streaming: ConverseStream → OpenAI SSE chunks (data: {...}\n\n format) */
// export async function invokeModelStreamOpenAI(
//   body: Record<string, unknown>,
//   res: Response,
//   onTextDelta?: (text: string) => void,
// ): Promise<void> {
//   const input = openaiToConverseInput(body) as unknown as ConverseStreamCommandInput;

//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');

//   const chatId = `chatcmpl-${Date.now()}`;
//   const created = Math.floor(Date.now() / 1000);

//   // Generate unique request ID for caching
//   const requestId = generateRequestId();
//   const responseText: string[] = []; // Collect text chunks for Telegram

//   function chunk(delta: Record<string, unknown>, finishReason: string | null = null): void {
//     const payload = {
//       id: chatId,
//       object: 'chat.completion.chunk',
//       created,
//       model: 'amazon-nova-micro',
//       choices: [{ index: 0, delta, finish_reason: finishReason }],
//     };
//     res.write(`data: ${JSON.stringify(payload)}\n\n`);
//   }

//   // role chunk
//   chunk({ role: 'assistant', content: '' });

//   const FINISH_MAP: Record<string, string> = {
//     end_turn: 'stop', max_tokens: 'length', tool_use: 'tool_calls', stop_sequence: 'stop',
//   };

//   try {
//     const response = await client.send(new ConverseStreamCommand(input));
//     const toolCallAccum: Record<number, { id: string; name: string; args: string }> = {};
//     let finishReason = 'stop';

//   for await (const event of (response.stream ?? [])) {
//     if (event.contentBlockStart?.start?.toolUse) {
//       const tu = event.contentBlockStart.start.toolUse;
//       const idx = event.contentBlockStart.contentBlockIndex ?? 0;
//       toolCallAccum[idx] = { id: tu.toolUseId ?? '', name: tu.name ?? '', args: '' };
//       chunk({
//         tool_calls: [{
//           index: idx, id: tu.toolUseId, type: 'function',
//           function: { name: tu.name, arguments: '' },
//         }],
//       });
//     }

//     if (event.contentBlockDelta) {
//       const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
//       const delta = event.contentBlockDelta.delta;
//       if (delta?.text !== undefined) {
//         responseText.push(delta.text); // Collect for Telegram
        
//         // Cache chunk to Redis
//         cacheStreamResponse(requestId, delta.text);
        
//         chunk({ content: delta.text });
//       } else {
//         const raw = delta as unknown as Record<string, unknown>;
//         if (raw?.['toolUse']) {
//           const partialJson = String((raw['toolUse'] as Record<string, unknown>)['input'] ?? '');
//           if (toolCallAccum[idx]) toolCallAccum[idx].args += partialJson;
//           chunk({ tool_calls: [{ index: idx, function: { arguments: partialJson } }] });
//         }
//       }
//     }

//     if (event.messageStop) {
//       finishReason = FINISH_MAP[event.messageStop.stopReason ?? ''] ?? 'stop';
//     }
//   }

//   // final chunk with finish_reason
//   chunk({}, finishReason);
//   res.write('data: [DONE]\n\n');
//   res.end();
//   } catch (error) {
//     console.error('[Stream Error]', error);
//     throw error;
//   } finally {
//     // Clear Redis cache on ALL exit paths (success, error, disconnect)
//     await clearStreamCache(requestId);
//   }

//   // Send Telegram notification with response content (no sound - handled elsewhere)
//   try {
//     if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
//       const https = require('https');
//       const fullText = responseText.join('');
//       const maxLen = 4000;
//       const textToSend = fullText.length > maxLen 
//         ? fullText.substring(0, maxLen) + '...\n[truncated]'
//         : fullText;
      
//       const message = encodeURIComponent(`📱 Response:\n\n${textToSend}`);
//       const path = `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${process.env.TELEGRAM_CHAT_ID}&text=${message}`;
      
//       const req = https.request({
//         hostname: 'api.telegram.org',
//         port: 443,
//         path: path,
//         method: 'GET',
//         timeout: 5000
//       }, (res: any) => {
//         // Consume response to avoid memory leaks
//         res.on('data', () => {});
//         res.on('error', (err: Error) => {
//           console.error('[Telegram Notify Error]', err.message);
//         });
//       });
      
//       req.on('error', (err: Error) => {
//         console.error('[Telegram Notify Error]', err.message);
//       });
      
//       req.on('timeout', () => {
//         req.destroy();
//         console.error('[Telegram Notify Error] Request timeout');
//       });
      
//       req.end();
//     }
//   } catch (e) {
//     // Ignore notification errors
//   }
// }