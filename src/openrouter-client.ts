/**
 * OpenRouter Client - Routes requests via OpenRouter API
 *
 * Generic client for models accessed through OpenRouter's API gateway.
 * Supports: DeepSeek v4, Claude Fable 5, and other OpenRouter models.
 */

import { Response } from 'express';
import { playChatCompletionSoundAsync } from './utils/sound-notification';
import { logger } from './utils/logger';
import { logPromptCacheUsage, toAnthropicInputUsage } from './utils/prompt-cache-usage';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

function openRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
  return apiKey;
}

function extractOpenRouterEvents(buffer: string, onEvent: (event: any) => void): string {
  const blocks = buffer.split('\n\n');
  const remainder = blocks.pop() ?? '';
  for (const block of blocks) {
    const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    const data = dataLine.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      onEvent(JSON.parse(data));
    } catch {
      // Partial events remain in the buffer; malformed complete events are ignored.
    }
  }
  return remainder;
}

function extractOpenRouterDeltas(buffer: string, onText: (text: string) => void): string {
  return extractOpenRouterEvents(buffer, (event) => {
    const delta = event?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) onText(delta);
  });
}

function anthropicContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function anthropicToOpenRouterRequest(body: Record<string, unknown>): Record<string, unknown> {
  const messages: any[] = [];
  const system = anthropicContentToText(body['system']) || (typeof body['system'] === 'string' ? body['system'] : '');
  if (system) messages.push({ role: 'system', content: system });

  for (const message of (body['messages'] || []) as any[]) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    if (!Array.isArray(message.content)) {
      messages.push({ role: message.role, content: message.content });
      continue;
    }

    const text = anthropicContentToText(message.content);
    if (message.role === 'assistant') {
      const toolCalls = message.content
        .filter((block: any) => block?.type === 'tool_use')
        .map((block: any) => ({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        }));
      messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }

    if (text) messages.push({ role: 'user', content: text });
    for (const block of message.content) {
      if (block?.type !== 'tool_result') continue;
      messages.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: anthropicContentToText(block.content) || String(block.content ?? ''),
      });
    }
  }

  const tools = Array.isArray(body['tools'])
    ? body['tools'].map((tool: any) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
      }))
    : undefined;

  return {
    model: getOpenRouterModel(body['model'] as string | undefined),
    messages,
    temperature: body['temperature'] ?? 0.7,
    max_tokens: body['max_tokens'] ?? 4096,
    ...(tools ? { tools } : {}),
    ...(body['tool_choice'] ? { tool_choice: body['tool_choice'] } : {}),
  };
}

function writeAnthropicEvent(res: Response, event: string, data: Record<string, unknown>): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Model ID mappings
const MODEL_MAPPINGS: Record<string, string> = {
  // DeepSeek variants
  'deepseek-v4-flash': 'deepseek/deepseek-v4-flash-0731',
  'deepseek-v4': 'deepseek/deepseek-v4-flash-0731',
  'deepseek': 'deepseek/deepseek-v4-flash-0731',

  // Claude Fable variants
  'fable-5': 'anthropic/claude-fable-5',
  'fable': 'anthropic/claude-fable-5',
  'claude-fable-5': 'anthropic/claude-fable-5',
  'claude-fable': 'anthropic/claude-fable-5',

  // Qwen variants
  'qwen-3.8-max': 'qwen/qwen3.8-max',
  'qwen-max': 'qwen/qwen3.8-max',
  'qwen3.8-max': 'qwen/qwen3.8-max',
  'qwen': 'qwen/qwen3.8-max',
};

/**
 * Check if the request should be routed through OpenRouter
 */
export function shouldUseOpenRouter(model: string | undefined): boolean {
  if (!model) return false;
  const lowerModel = model.toLowerCase();
  return lowerModel.includes('deepseek') ||
         lowerModel.includes('fable') ||
         lowerModel.includes('qwen') ||
         lowerModel in MODEL_MAPPINGS;
}

/**
 * Get the OpenRouter model ID from various formats
 */
function getOpenRouterModel(requestedModel: string | undefined): string {
  if (!requestedModel) return 'deepseek/deepseek-v4-flash-0731';

  const lowerModel = requestedModel.toLowerCase();

  // Check direct mappings
  if (lowerModel in MODEL_MAPPINGS) {
    return MODEL_MAPPINGS[lowerModel];
  }

  // Check if it's already an OpenRouter model ID
  if (requestedModel.includes('/')) {
    return requestedModel;
  }

  // Fallback
  return 'deepseek/deepseek-v4-flash-0731';
}

/**
 * Invoke model via OpenRouter (non-streaming) - OpenAI format
 */
export async function invokeOpenRouter(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const requestedModel = body['model'] as string | undefined;
  const model = getOpenRouterModel(requestedModel);

  console.log(`[OpenRouter] Calling with model: ${model}`);

  const messages = (body['messages'] || []) as Array<any>;
  const temperature = body['temperature'] ?? 0.7;
  const maxTokens = body['max_tokens'] ?? 500;

  const requestBody: any = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterApiKey()}`,
      'HTTP-Referer': 'https://github.com/anon16767/hopper-android',
      'X-Title': 'Hopper Android Development',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }
  const data = await response.json() as any;
  logPromptCacheUsage(logger, 'openrouter', model, data.usage);
  playChatCompletionSoundAsync();

  return {
    id: data.id,
    object: 'chat.completion',
    created: data.created,
    model: data.model,
    choices: data.choices,
    usage: data.usage,
  };
}

/**
 * Invoke model via OpenRouter (streaming) - OpenAI format
 */
export async function invokeOpenRouterStream(
  body: Record<string, unknown>,
  res: Response,
  onTextDelta?: (text: string) => void,
): Promise<string[]> {
  const requestedModel = body['model'] as string | undefined;
  const model = getOpenRouterModel(requestedModel);

  console.log(`[OpenRouter] Streaming with model: ${model}`);

  const messages = (body['messages'] || []) as Array<any>;
  const temperature = body['temperature'] ?? 0.7;
  const maxTokens = body['max_tokens'] ?? 500;

  const requestBody: any = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterApiKey()}`,
      'HTTP-Referer': 'https://github.com/anon16767/hopper-android',
      'X-Title': 'Hopper Android Development',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }
  if (!response.body) throw new Error('Response body is null');

  const responseText: string[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = extractOpenRouterEvents(buffer + decoder.decode(value, { stream: true }), (delta) => {
        responseText.push(delta);
        onTextDelta?.(delta);
      });
    }

    res.write('data: [DONE]\n\n');
    res.end();
    playChatCompletionSoundAsync();
    return responseText;
  } catch (error) {
    console.error('[OpenRouter] Streaming error:', error);
    throw error;
  }
}

/**
 * Invoke model via OpenRouter - Anthropic format
 */
export async function invokeOpenRouterAnthropic(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const requestBody = anthropicToOpenRouterRequest(body);
  const model = requestBody['model'] as string;
  const result = await invokeOpenRouter(requestBody);
  const choice = (result as any).choices?.[0];
  const usage = (result as any).usage;
  const message = choice?.message ?? {};
  const content: any[] = [];
  if (message.content) content.push({ type: 'text', text: message.content });
  for (const toolCall of message.tool_calls ?? []) {
    let input: unknown = {};
    try { input = JSON.parse(toolCall.function?.arguments || '{}'); } catch { input = {}; }
    content.push({ type: 'tool_use', id: toolCall.id, name: toolCall.function?.name, input });
  }

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    stop_sequence: null,
    usage: {
      ...toAnthropicInputUsage(usage),
      output_tokens: usage?.completion_tokens || 0,
    },
  };
}

export async function invokeOpenRouterAnthropicStream(
  body: Record<string, unknown>,
  res: Response,
  onTextDelta?: (text: string) => void,
): Promise<string[]> {
  const requestBody: Record<string, unknown> = { ...anthropicToOpenRouterRequest(body), stream: true };
  const model = requestBody['model'] as string;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const responseText: string[] = [];

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey()}`,
        'HTTP-Referer': 'https://github.com/anon16767/hopper-android',
        'X-Title': 'Hopper Android Development',
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) throw new Error(`OpenRouter API error ${response.status}: ${await response.text()}`);
    if (!response.body) throw new Error('Response body is null');

    writeAnthropicEvent(res, 'message_start', {
      type: 'message_start',
      message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const openBlocks = new Set<number>();
    const toolBlocks = new Map<number, number>();
    let nextBlockIndex = 0;
    let textBlockIndex: number | undefined;
    let finishReason = 'stop';
    let outputTokens = 0;
    let buffer = '';

    const handleEvent = (event: any): void => {
      const choice = event?.choices?.[0];
      const delta = choice?.delta;
      if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason;
      if (typeof event?.usage?.completion_tokens === 'number') outputTokens = event.usage.completion_tokens;

      if (typeof delta?.content === 'string' && delta.content) {
        if (textBlockIndex === undefined) {
          textBlockIndex = nextBlockIndex++;
          openBlocks.add(textBlockIndex);
          writeAnthropicEvent(res, 'content_block_start', { type: 'content_block_start', index: textBlockIndex, content_block: { type: 'text', text: '' } });
        }
        responseText.push(delta.content);
        onTextDelta?.(delta.content);
        writeAnthropicEvent(res, 'content_block_delta', { type: 'content_block_delta', index: textBlockIndex, delta: { type: 'text_delta', text: delta.content } });
      }

      for (const toolCall of delta?.tool_calls ?? []) {
        const toolIndex = Number(toolCall.index ?? 0);
        let contentIndex = toolBlocks.get(toolIndex);
        if (contentIndex === undefined) {
          contentIndex = nextBlockIndex++;
          toolBlocks.set(toolIndex, contentIndex);
          openBlocks.add(contentIndex);
          writeAnthropicEvent(res, 'content_block_start', {
            type: 'content_block_start',
            index: contentIndex,
            content_block: { type: 'tool_use', id: toolCall.id || `tool_${toolIndex}`, name: toolCall.function?.name || 'tool', input: {} },
          });
        }
        const partialJson = toolCall.function?.arguments;
        if (typeof partialJson === 'string' && partialJson) {
          writeAnthropicEvent(res, 'content_block_delta', { type: 'content_block_delta', index: contentIndex, delta: { type: 'input_json_delta', partial_json: partialJson } });
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = extractOpenRouterEvents(buffer + decoder.decode(value, { stream: true }), handleEvent);
    }
    extractOpenRouterEvents(buffer + decoder.decode() + '\n\n', handleEvent);

    for (const index of [...openBlocks].sort((left, right) => left - right)) {
      writeAnthropicEvent(res, 'content_block_stop', { type: 'content_block_stop', index });
    }
    writeAnthropicEvent(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: finishReason === 'tool_calls' ? 'tool_use' : finishReason === 'length' ? 'max_tokens' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: outputTokens },
    });
    writeAnthropicEvent(res, 'message_stop', { type: 'message_stop' });
    res.end();
    playChatCompletionSoundAsync();
    return responseText;
  } catch (error) {
    console.error('[OpenRouter] Anthropic streaming error:', error);
    throw error;
  }
}
