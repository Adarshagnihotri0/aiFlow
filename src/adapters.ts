// Amazon Nova Pro — Amazon's own model, no marketplace subscription needed.
// Best tool use + agentic capability in the Nova family.
// Price: ~$0.80/1M input tokens. EOL: not announced.
const region = process.env.AWS_REGION ?? 'ap-south-1';
const profilePrefix = region.startsWith('eu-')
  ? 'eu'
  : region.startsWith('ap-')
    ? 'apac'
    : 'us';

//export const STATIC_MODEL_ID = `${profilePrefix}.deepseek.v3.2`;
export const STATIC_MODEL_ID = `zai.glm-5`
// ── Anthropic content block → Converse ContentBlock ─────────────────────────
function toConverseContent(content: unknown) {
  if (typeof content === 'string') {
    return content.trim() ? [{ text: content }] : [];  // ← Skip if empty
  }
  if (!Array.isArray(content)) return [];
  
  return (content as Record<string, unknown>[])
    .map((block) => {
      if (block['type'] === 'text') {
        const text = String(block['text'] ?? '').trim();
        return text ? { text } : null;  // ← Return null for empty text
      }
      if (block['type'] === 'tool_use') {
        // AWS Bedrock: tool names must be ≤64 chars and match [a-zA-Z0-9_-]+
        const toolName = String(block['name'] ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const truncatedName = toolName.length > 64 ? toolName.substring(0, 64) : toolName;
        return { toolUse: { toolUseId: block['id'], name: truncatedName, input: block['input'] ?? {} } };
      }
      if (block['type'] === 'tool_result') {
        const raw = block['content'];
        const inner = typeof raw === 'string'
          ? (raw.trim() ? [{ text: raw }] : [])  // ← Filter empty strings
          : Array.isArray(raw)
            ? (raw as Record<string, unknown>[])
              .map((c) => {
                const t = String(c['text'] ?? '').trim();
                return t ? { text: t } : null;
              })
              .filter(Boolean)
            : (raw ? [{ text: String(raw) }] : []);
        return inner.length ? { toolResult: { toolUseId: block['tool_use_id'], content: inner } } : null;
      }
      return null;  // ← Don't create empty text blocks
    })
    .filter(Boolean);  // ← Remove null entries
}

/** Convert Anthropic request body to Bedrock ConverseCommand input */
export function toConverseInput(body: Record<string, unknown>): Record<string, unknown> {
  const messages = ((body['messages'] ?? []) as Record<string, unknown>[]).map((m) => ({
    role: m['role'],
    content: toConverseContent(m['content']),
  }));

  const system = body['system']
    ? [{ text: typeof body['system'] === 'string' ? body['system'] : JSON.stringify(body['system']) }]
    : undefined;

  const NOVA_LITE_MAX_TOKENS = 1640000;
  const inferenceConfig: Record<string, unknown> = {};
  if (body['max_tokens']) inferenceConfig['maxTokens'] = Math.min(body['max_tokens'] as number, NOVA_LITE_MAX_TOKENS);
  else inferenceConfig['maxTokens'] = NOVA_LITE_MAX_TOKENS;
  if (body['temperature'] !== undefined) inferenceConfig['temperature'] = body['temperature'];
  if (body['top_p'] !== undefined) inferenceConfig['topP'] = body['top_p'];

  const tools = body['tools'] as Record<string, unknown>[] | undefined;
  const toolConfig = tools?.length
    ? {
        tools: tools.map((t) => {
          // AWS Bedrock: tool names must be ≤64 chars and match [a-zA-Z0-9_-]+
          const toolName = String(t['name'] ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const truncatedName = toolName.length > 64 ? toolName.substring(0, 64) : toolName;
          return {
            toolSpec: {
              name: truncatedName,
              description: t['description'],
              inputSchema: { json: t['input_schema'] },
            },
          };
        }),
      }
    : undefined;

  return {
    modelId: STATIC_MODEL_ID,
    messages,
    ...(system ? { system } : {}),
    inferenceConfig,
    ...(toolConfig ? { toolConfig } : {}),
  };
}

// ── Converse response → Anthropic response ────────────────────────────────────
const STOP_MAP: Record<string, string> = {
  end_turn: 'end_turn', tool_use: 'tool_use', max_tokens: 'max_tokens', stop_sequence: 'stop_sequence',
};

export function fromConverseResponse(response: Record<string, unknown>): Record<string, unknown> {
  const msg = (response['output'] as Record<string, unknown>)?.['message'] as Record<string, unknown>;
  const raw = (msg?.['content'] ?? []) as Record<string, unknown>[];
  const usage = response['usage'] as Record<string, unknown> | undefined;

  const content = raw.map((block) => {
    if (block['text'] !== undefined) return { type: 'text', text: block['text'] };
    if (block['toolUse']) {
      const tu = block['toolUse'] as Record<string, unknown>;
      return { type: 'tool_use', id: tu['toolUseId'], name: tu['name'], input: tu['input'] };
    }
    return { type: 'text', text: '' };
  });

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: STATIC_MODEL_ID,
    stop_reason: STOP_MAP[response['stopReason'] as string] ?? 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: usage?.['inputTokens'] ?? 0, output_tokens: usage?.['outputTokens'] ?? 0 },
  };
}

/** Model list returned by GET /v1/models */
export const AVAILABLE_MODELS = [
  {
    id: STATIC_MODEL_ID,
    object: 'model',
    created: 1747958400,
    owned_by: 'aws-bedrock',
  },
  {
    id: 'deepseek/deepseek-v4-flash-0731',
    object: 'model',
    created: Date.now(),
    owned_by: 'deepseek',
  },
  {
    id: 'deepseek-v4-flash',
    object: 'model',
    created: Date.now(),
    owned_by: 'deepseek',
  },
  {
    id: 'deepseek-v4',
    object: 'model',
    created: Date.now(),
    owned_by: 'deepseek',
  },
  {
    id: 'anthropic/claude-fable-5',
    object: 'model',
    created: Date.now(),
    owned_by: 'anthropic',
  },
  {
    id: 'fable-5',
    object: 'model',
    created: Date.now(),
    owned_by: 'anthropic',
  },
  {
    id: 'claude-fable-5',
    object: 'model',
    created: Date.now(),
    owned_by: 'anthropic',
  },
  {
    id: 'qwen/qwen3.8-max',
    object: 'model',
    created: Date.now(),
    owned_by: 'qwen',
  },
  {
    id: 'qwen-3.8-max',
    object: 'model',
    created: Date.now(),
    owned_by: 'qwen',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// OpenAI ↔ Converse adapters
// ════════════════════════════════════════════════════════════════════════════

/** Convert OpenAI chat/completions request → Bedrock ConverseCommand input */
export function openaiToConverseInput(body: Record<string, unknown>): Record<string, unknown> {
  const rawMessages = (body['messages'] ?? []) as Record<string, unknown>[];

  // Pull system messages out; Converse takes them separately
  const systemParts = rawMessages
    .filter((m) => m['role'] === 'system')
    .map((m) => {
      const text = String(m['content'] ?? '').trim();
      return text ? { text } : null;  // ← Filter empty system messages
    })
    .filter(Boolean);

  const messages = rawMessages
    .filter((m) => m['role'] !== 'system')
    .map((m) => {
      const role = m['role'] === 'tool' ? 'user' : (m['role'] as string);

      // tool result (role === "tool")
      if (m['role'] === 'tool') {
        const toolText = String(m['content'] ?? '').trim();
        const inner = toolText ? [{ text: toolText }] : [];  // ← Only add text if non-empty
        return {
          role: 'user',
          content: [{
            toolResult: {
              toolUseId: m['tool_call_id'],
              content: inner.length ? inner : [{ text: '' }],  // ← Fallback to empty if needed by Bedrock
            },
          }],
        };
      }

      // assistant with tool_calls
      const toolCalls = m['tool_calls'] as Record<string, unknown>[] | undefined;
      if (role === 'assistant' && toolCalls?.length) {
        const content: Record<string, unknown>[] = [];
        const msgText = String(m['content'] ?? '').trim();
        if (msgText) content.push({ text: msgText });  // ← Only add if non-empty
        for (const tc of toolCalls) {
          const fn = tc['function'] as Record<string, unknown>;
          let input: unknown = {};
          try { input = JSON.parse(String(fn['arguments'] ?? '{}')); } catch { /* keep {} */ }
          // AWS Bedrock: tool names must be ≤64 chars and match [a-zA-Z0-9_-]+
          const toolName = String(fn['name'] ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const truncatedName = toolName.length > 64 ? toolName.substring(0, 64) : toolName;
          content.push({ toolUse: { toolUseId: tc['id'], name: truncatedName, input } });
        }
        return { role, content: content.length ? content : [{ text: '' }] };  // ← Fallback
      }

      // plain text message
      const text = String(m['content'] ?? '').trim();
      return { role, content: text ? [{ text }] : [{ text: '' }] };  // ← Fallback for empty
    });

  const NOVA_LITE_MAX_TOKENS = 5000;
  const inferenceConfig: Record<string, unknown> = {};
  if (body['max_tokens']) inferenceConfig['maxTokens'] = Math.min(body['max_tokens'] as number, NOVA_LITE_MAX_TOKENS);
  else inferenceConfig['maxTokens'] = NOVA_LITE_MAX_TOKENS;
  if (body['temperature'] !== undefined) inferenceConfig['temperature'] = body['temperature'];
  if (body['top_p'] !== undefined) inferenceConfig['topP'] = body['top_p'];

  // OpenAI tools format → Converse toolSpec
  const tools = body['tools'] as Record<string, unknown>[] | undefined;
  const toolConfig = tools?.length
    ? {
        tools: tools.map((t) => {
          const fn = t['function'] as Record<string, unknown>;
          // AWS Bedrock: tool names must be ≤64 chars and match [a-zA-Z0-9_-]+
          const toolName = String(fn['name'] ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const truncatedName = toolName.length > 64 ? toolName.substring(0, 64) : toolName;
          return {
            toolSpec: {
              name: truncatedName,
              description: fn['description'],
              inputSchema: { json: fn['parameters'] },
            },
          };
        }),
      }
    : undefined;

  return {
    modelId: STATIC_MODEL_ID,
    messages,
    ...(systemParts.length ? { system: systemParts as Record<string, unknown>[] } : {}),
    inferenceConfig,
    ...(toolConfig ? { toolConfig } : {}),
  };
}

const OPENAI_FINISH_MAP: Record<string, string> = {
  end_turn: 'stop', max_tokens: 'length', tool_use: 'tool_calls', stop_sequence: 'stop',
};

/** Convert Converse response → OpenAI ChatCompletion response */
export function fromConverseResponseOpenAI(response: Record<string, unknown>): Record<string, unknown> {
  const msg = (response['output'] as Record<string, unknown>)?.['message'] as Record<string, unknown>;
  const raw = (msg?.['content'] ?? []) as Record<string, unknown>[];
  const usage = response['usage'] as Record<string, unknown> | undefined;

  let textContent = '';
  const toolCalls: Record<string, unknown>[] = [];

  for (const block of raw) {
    if (block['text'] !== undefined) textContent += block['text'];
    if (block['toolUse']) {
      const tu = block['toolUse'] as Record<string, unknown>;
      toolCalls.push({
        id: tu['toolUseId'],
        type: 'function',
        function: { name: tu['name'], arguments: JSON.stringify(tu['input'] ?? {}) },
      });
    }
  }

  const finishReason = OPENAI_FINISH_MAP[response['stopReason'] as string] ?? 'stop';
  const messageOut: Record<string, unknown> = { role: 'assistant', content: textContent || null };
  if (toolCalls.length) messageOut['tool_calls'] = toolCalls;

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: STATIC_MODEL_ID,
    choices: [{ index: 0, message: messageOut, finish_reason: finishReason }],
    usage: {
      prompt_tokens: usage?.['inputTokens'] ?? 0,
      completion_tokens: usage?.['outputTokens'] ?? 0,
      total_tokens: ((usage?.['inputTokens'] as number) ?? 0) + ((usage?.['outputTokens'] as number) ?? 0),
    },
  };
}