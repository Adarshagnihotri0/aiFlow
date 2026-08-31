import type { Logger } from './logger';

export interface PromptCacheUsage {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  hitRate: number;
  reported: boolean;
}

export interface AnthropicInputUsage {
  input_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function extractPromptCacheUsage(usageValue: unknown): PromptCacheUsage {
  const usage = record(usageValue);
  const promptDetails = record(usage['prompt_tokens_details']);
  const inputDetails = record(usage['input_tokens_details']);

  const inputTokens = nonNegativeNumber(
    usage['prompt_tokens'] ?? usage['input_tokens'] ?? usage['inputTokens'],
  );
  const cacheReadTokens = nonNegativeNumber(
    promptDetails['cached_tokens'] ??
      inputDetails['cached_tokens'] ??
      usage['cache_read_input_tokens'] ??
      usage['cacheReadInputTokens'] ??
      usage['prompt_cache_hit_tokens'],
  );
  const cacheWriteTokens = nonNegativeNumber(
    promptDetails['cache_write_tokens'] ??
      inputDetails['cache_write_tokens'] ??
      promptDetails['cache_creation_tokens'] ??
      inputDetails['cache_creation_tokens'] ??
      usage['cache_creation_input_tokens'] ??
      usage['cacheWriteInputTokens'] ??
      usage['prompt_cache_miss_tokens'],
  );
  const usesSeparateInputCategories =
    'cache_read_input_tokens' in usage ||
    'cache_creation_input_tokens' in usage ||
    'cacheReadInputTokens' in usage ||
    'cacheWriteInputTokens' in usage;
  const totalInputTokens = usesSeparateInputCategories
    ? inputTokens + cacheReadTokens + cacheWriteTokens
    : inputTokens;

  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    hitRate: totalInputTokens > 0 ? cacheReadTokens / totalInputTokens : 0,
    reported:
      'cached_tokens' in promptDetails ||
      'cached_tokens' in inputDetails ||
      'cache_write_tokens' in promptDetails ||
      'cache_write_tokens' in inputDetails ||
      'cache_read_input_tokens' in usage ||
      'cache_creation_input_tokens' in usage ||
      'cacheReadInputTokens' in usage ||
      'cacheWriteInputTokens' in usage ||
      'prompt_cache_hit_tokens' in usage ||
      'prompt_cache_miss_tokens' in usage,
  };
}

export function toAnthropicInputUsage(usageValue: unknown): AnthropicInputUsage {
  const rawUsage = record(usageValue);
  const usage = extractPromptCacheUsage(usageValue);
  const usesSeparateInputCategories =
    'cache_read_input_tokens' in rawUsage ||
    'cache_creation_input_tokens' in rawUsage ||
    'cacheReadInputTokens' in rawUsage ||
    'cacheWriteInputTokens' in rawUsage;
  const uncachedInputTokens = usesSeparateInputCategories
    ? usage.inputTokens
    : Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);

  return {
    input_tokens: uncachedInputTokens,
    ...(usage.reported ? { cache_read_input_tokens: usage.cacheReadTokens } : {}),
    ...(usage.cacheWriteTokens > 0
      ? { cache_creation_input_tokens: usage.cacheWriteTokens }
      : {}),
  };
}

export function logPromptCacheUsage(
  logger: Logger,
  provider: string,
  model: string,
  usageValue: unknown,
): PromptCacheUsage {
  const usage = extractPromptCacheUsage(usageValue);
  logger.info('Provider prompt cache usage', {
    provider,
    model,
    inputTokens: usage.inputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    cacheHitRate: Number((usage.hitRate * 100).toFixed(2)),
    cacheUsageReported: usage.reported,
  });
  return usage;
}
