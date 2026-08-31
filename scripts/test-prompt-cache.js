const assert = require('node:assert/strict');
const { withAzurePromptCacheKey } = require('../dist/utils/azure-prompt-cache');
const { extractPromptCacheUsage } = require('../dist/utils/prompt-cache-usage');

const deployment = 'gpt-5.6-sol';
const stable = {
  model: deployment,
  messages: [
    { role: 'system', content: 'Stable engineering instructions.' },
    { role: 'user', content: 'First question.' },
  ],
  tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
};

const first = withAzurePromptCacheKey(stable, deployment);
const nextTurn = withAzurePromptCacheKey({
  ...stable,
  messages: [
    stable.messages[0],
    { role: 'user', content: 'A different question.' },
  ],
}, deployment);
const changedSystem = withAzurePromptCacheKey({
  ...stable,
  messages: [
    { role: 'system', content: 'Changed engineering instructions.' },
    stable.messages[1],
  ],
}, deployment);
const changedTools = withAzurePromptCacheKey({
  ...stable,
  tools: [{ type: 'function', function: { name: 'search', parameters: { type: 'object' } } }],
}, deployment);

assert.equal(first.prompt_cache_key, nextTurn.prompt_cache_key);
assert.notEqual(first.prompt_cache_key, changedSystem.prompt_cache_key);
assert.notEqual(first.prompt_cache_key, changedTools.prompt_cache_key);
assert.equal(
  withAzurePromptCacheKey({ ...stable, prompt_cache_key: 'client-key' }, deployment).prompt_cache_key,
  'client-key',
);
assert.equal(withAzurePromptCacheKey(stable, 'gpt-4.1-deployment'), stable);

assert.deepEqual(
  extractPromptCacheUsage({
    prompt_tokens: 1600,
    prompt_tokens_details: { cached_tokens: 1200, cache_write_tokens: 256 },
  }),
  {
    inputTokens: 1600,
    cacheReadTokens: 1200,
    cacheWriteTokens: 256,
    hitRate: 0.75,
    reported: true,
  },
);

console.log('Prompt-cache assertions passed.');
