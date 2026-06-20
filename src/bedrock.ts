import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseCommandInput,
  type ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import type { Response } from 'express';
import { toConverseInput, fromConverseResponse, STATIC_MODEL_ID, openaiToConverseInput, fromConverseResponseOpenAI } from './adapters';

function makeClient(): BedrockRuntimeClient {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
      },
    });
  }
  return new BedrockRuntimeClient({ region });
}

const client = makeClient();

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Non-streaming: use Converse API and return Anthropic-format response */
export async function invokeModel(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const input = toConverseInput(body) as unknown as ConverseCommandInput;
  const response = await client.send(new ConverseCommand(input));
  return fromConverseResponse(response as unknown as Record<string, unknown>);
}

/** Streaming: use ConverseStream and emit Anthropic SSE events */
export async function invokeModelStream(
  body: Record<string, unknown>,
  res: Response,
): Promise<void> {
  const input = toConverseInput(body);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const response = await client.send(new ConverseStreamCommand(input as unknown as ConverseStreamCommandInput));

  // ── message_start ─────────────────────────────────────────────────────────
  sseWrite(res, 'message_start', {
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
  sseWrite(res, 'ping', { type: 'ping' });

  const STOP_MAP: Record<string, string> = {
    end_turn: 'end_turn', tool_use: 'tool_use',
    max_tokens: 'max_tokens', stop_sequence: 'stop_sequence',
  };

  let stopReason = 'end_turn';
  let outputTokens = 0;
  const started = new Set<number>();

  for await (const event of (response.stream ?? [])) {
    // content_block_start
    if (event.contentBlockStart) {
      const { contentBlockIndex: idx, start } = event.contentBlockStart;
      started.add(idx!);
      if (start?.toolUse) {
        sseWrite(res, 'content_block_start', {
          type: 'content_block_start', index: idx,
          content_block: { type: 'tool_use', id: start.toolUse.toolUseId, name: start.toolUse.name, input: {} },
        });
      } else {
        sseWrite(res, 'content_block_start', {
          type: 'content_block_start', index: idx,
          content_block: { type: 'text', text: '' },
        });
      }
    }

    // content_block_delta
    if (event.contentBlockDelta) {
      const { contentBlockIndex: idx, delta } = event.contentBlockDelta;
      if (!started.has(idx!)) {
        started.add(idx!);
        sseWrite(res, 'content_block_start', {
          type: 'content_block_start', index: idx,
          content_block: { type: 'text', text: '' },
        });
      }
      if (delta?.text !== undefined) {
        sseWrite(res, 'content_block_delta', {
          type: 'content_block_delta', index: idx,
          delta: { type: 'text_delta', text: delta.text },
        });
      } else if ((delta as unknown as Record<string, unknown>)?.['toolUse']) {
        const tu = (delta as unknown as Record<string, unknown>)['toolUse'] as Record<string, unknown>;
        sseWrite(res, 'content_block_delta', {
          type: 'content_block_delta', index: idx,
          delta: { type: 'input_json_delta', partial_json: tu['input'] ?? '' },
        });
      }
    }

    // content_block_stop
    if (event.contentBlockStop) {
      sseWrite(res, 'content_block_stop', {
        type: 'content_block_stop', index: event.contentBlockStop.contentBlockIndex,
      });
    }

    // messageStop
    if (event.messageStop) {
      stopReason = STOP_MAP[event.messageStop.stopReason ?? ''] ?? 'end_turn';
    }

    // metadata (usage)
    if ((event as unknown as Record<string, unknown>)['metadata']) {
      const meta = (event as unknown as Record<string, unknown>)['metadata'] as Record<string, unknown>;
      const usage = meta['usage'] as Record<string, unknown> | undefined;
      outputTokens = (usage?.['outputTokens'] as number) ?? 0;
    }
  }

  sseWrite(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  });
  sseWrite(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

// ════════════════════════════════════════════════════════════════════════════
// OpenAI-format functions
// ════════════════════════════════════════════════════════════════════════════

/** Non-streaming: Converse API → OpenAI ChatCompletion response */
export async function invokeModelOpenAI(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const input = openaiToConverseInput(body) as unknown as ConverseCommandInput;
  const response = await client.send(new ConverseCommand(input));
  console.log('Converse response:', JSON.stringify(response));
  return fromConverseResponseOpenAI(response as unknown as Record<string, unknown>);
}

/** Streaming: ConverseStream → OpenAI SSE chunks (data: {...}\n\n format) */
export async function invokeModelStreamOpenAI(
  body: Record<string, unknown>,
  res: Response,
): Promise<void> {
  const input = openaiToConverseInput(body) as unknown as ConverseStreamCommandInput;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const chatId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  function chunk(delta: Record<string, unknown>, finishReason: string | null = null): void {
    const payload = {
      id: chatId,
      object: 'chat.completion.chunk',
      created,
      model: 'amazon-nova-micro',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // role chunk
  chunk({ role: 'assistant', content: '' });

  const FINISH_MAP: Record<string, string> = {
    end_turn: 'stop', max_tokens: 'length', tool_use: 'tool_calls', stop_sequence: 'stop',
  };

  const response = await client.send(new ConverseStreamCommand(input));
  const toolCallAccum: Record<number, { id: string; name: string; args: string }> = {};
  let finishReason = 'stop';

  for await (const event of (response.stream ?? [])) {
    if (event.contentBlockStart?.start?.toolUse) {
      const tu = event.contentBlockStart.start.toolUse;
      const idx = event.contentBlockStart.contentBlockIndex ?? 0;
      toolCallAccum[idx] = { id: tu.toolUseId ?? '', name: tu.name ?? '', args: '' };
      chunk({
        tool_calls: [{
          index: idx, id: tu.toolUseId, type: 'function',
          function: { name: tu.name, arguments: '' },
        }],
      });
    }

    if (event.contentBlockDelta) {
      const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
      const delta = event.contentBlockDelta.delta;
      if (delta?.text !== undefined) {
        chunk({ content: delta.text });
      } else {
        const raw = delta as unknown as Record<string, unknown>;
        if (raw?.['toolUse']) {
          const partialJson = String((raw['toolUse'] as Record<string, unknown>)['input'] ?? '');
          if (toolCallAccum[idx]) toolCallAccum[idx].args += partialJson;
          chunk({ tool_calls: [{ index: idx, function: { arguments: partialJson } }] });
        }
      }
    }

    if (event.messageStop) {
      finishReason = FINISH_MAP[event.messageStop.stopReason ?? ''] ?? 'stop';
    }
  }

  // final chunk with finish_reason
  chunk({}, finishReason);
  res.write('data: [DONE]\n\n');
  res.end();
}
