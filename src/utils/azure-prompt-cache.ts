import { createHash } from 'crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function stablePromptIdentity(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const messages = Array.isArray(body['messages'])
    ? body['messages'] as Record<string, unknown>[]
    : [];
  const stableMessages: Record<string, unknown>[] = [];

  for (const message of messages) {
    if (message['role'] !== 'system' && message['role'] !== 'developer') break;
    stableMessages.push(message);
  }

  const tools = Array.isArray(body['tools']) ? body['tools'] : [];
  if (stableMessages.length === 0 && tools.length === 0) return undefined;

  return {
    messages: stableMessages,
    tools,
    response_format: body['response_format'] ?? null,
  };
}

export function withAzurePromptCacheKey(
  body: Record<string, unknown>,
  deployment: string,
): Record<string, unknown> {
  if (!deployment.toLowerCase().includes('-sol')) return body;
  if (typeof body['prompt_cache_key'] === 'string' && body['prompt_cache_key'].trim()) return body;

  const identity = stablePromptIdentity(body);
  if (!identity) return body;

  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalize(identity)))
    .digest('hex')
    .slice(0, 24);

  return {
    ...body,
    prompt_cache_key: `proxy:${deployment}:${digest}`,
  };
}
