const { test } = require('node:test');
const assert = require('node:assert/strict');

function stub(t, name, exports) {
  const key = require.resolve(name); const previous = require.cache[key];
  require.cache[key] = { id: key, filename: key, loaded: true, exports };
  t.after(() => { if (previous) require.cache[key] = previous; else delete require.cache[key]; });
}
function inference(t, invoke, timeout) {
  stub(t, '../dist/bedrock', { invokeModelOpenAI: () => assert.fail('Unmocked model call') });
  const key = require.resolve('../dist/services/telegram-inference'); delete require.cache[key];
  t.after(() => delete require.cache[key]);
  const { TelegramInference } = require(key);
  const logs = []; t.mock.method(console, 'error', (...args) => logs.push(args));
  return { service: new TelegramInference(invoke, timeout), logs };
}
const completion = content => ({ choices: [{ message: { content } }] });

// No dotenv, server entrypoint, poller, or real provider is loaded in this suite.
test('success/failure/status and history commit only complete bounded turns, including full-history failure', async t => {
  const requests = []; let fail = false;
  const { service, logs } = inference(t, async body => {
    requests.push(body);
    if (fail) throw Object.assign(new Error('secret body and URL'), { cause: { code: 'ECONNRESET', message: 'secret cause' } });
    return completion(`answer-${requests.length}`);
  });
  assert.match(service.status('topic'), /no inference observed/);
  assert.doesNotMatch(service.status('topic'), /Ready/);
  for (let i = 0; i < 11; i++) await service.ask('topic', `question-${i}`);
  assert.equal(service.historyLength('topic'), 20);
  assert.match(service.status('topic'), /Last completed: success at/);
  const successAt = service.status('topic').match(/Last success: (.+)/)[1];
  fail = true;
  assert.match(await service.ask('topic', 'failed-prompt'), /ECONNRESET/);
  assert.equal(service.historyLength('topic'), 20);
  assert.match(service.status('topic'), /Last completed: failure at.*ECONNRESET/);
  assert.ok(service.status('topic').includes(`Last success: ${successAt}`));
  fail = false; await service.ask('topic', 'recovery');
  assert.match(service.status('topic'), /Last completed: success at/);
  assert.doesNotMatch(service.status('topic'), /Last failure: none/);
  const latest = requests.at(-1).messages;
  assert.equal(latest[1].content, 'question-2', 'failed request must not evict the oldest retained pair');
  for (const request of requests) {
    assert.ok(request.messages.length <= 20);
    assert.equal(request.messages[0].role, 'system');
    request.messages.slice(1).forEach((turn, index) => assert.equal(turn.role, index % 2 ? 'assistant' : 'user'));
  }
  assert.ok(!latest.some(turn => turn.content === 'failed-prompt'));
  assert.doesNotMatch(JSON.stringify(logs), /secret|failed-prompt|question-|answer-/);
  assert.equal(service.historyLength('other'), 0);
  assert.match(service.status('other'), /no inference observed/);
  service.clear('topic'); assert.equal(service.historyLength(), 0);
  assert.match(service.status('topic'), /Last completed: success at/, 'clear must not invent or erase actual inference results');
});

test('deadline aborts transport, clears timer, reports timeout, ignores late success, and permits retry', async t => {
  let expire; let cleared = 0; let signal; let resolveLate; let calls = 0;
  t.mock.method(global, 'setTimeout', (callback, ms) => { assert.equal(ms, 60000); expire = callback; return 123; });
  t.mock.method(global, 'clearTimeout', timer => { assert.equal(timer, 123); cleared++; });
  const { service } = inference(t, (_body, incoming) => {
    calls++; signal = incoming;
    return calls === 1 ? new Promise(resolve => { resolveLate = resolve; }) : Promise.resolve(completion('recovered'));
  });
  const pending = service.ask('topic', 'synthetic');
  assert.match(service.status('topic'), /In progress: yes/);
  assert.match(await service.ask('topic', 'overlap'), /already in progress/);
  assert.equal(calls, 1);
  expire();
  assert.equal(signal.aborted, true);
  assert.match(await pending, /timed out \(TIMEOUT\)/);
  assert.equal(cleared, 1);
  const failedStatus = service.status('topic');
  resolveLate(completion('late')); await Promise.resolve();
  assert.equal(service.status('topic'), failedStatus);
  assert.equal(service.historyLength(), 0);
  assert.equal(await service.ask('topic', 'retry'), 'recovered');
  assert.equal(cleared, 2); assert.equal(signal.aborted, false);
});

test('abort-aware rejection and successful completion both clear real short deadlines', async t => {
  let observed;
  const { service } = inference(t, (_body, signal) => new Promise((_resolve, reject) => {
    observed = signal;
    signal.addEventListener('abort', () => reject(new DOMException('private', 'AbortError')), { once: true });
  }), 5);
  assert.match(await service.ask('topic', 'synthetic'), /TIMEOUT/);
  assert.equal(observed.aborted, true);
});

test('empty/malformed responses are failures, with no synthetic assistant history', async t => {
  let response;
  const { service } = inference(t, async () => response);
  for (response of [null, {}, { choices: [] }, completion('  '), completion({ private: 'upstream' })]) {
    assert.match(await service.ask('topic', 'synthetic'), /EMPTY_RESPONSE/);
    assert.equal(service.historyLength(), 0);
    assert.match(service.status('topic'), /Last success: none observed/);
  }
});

test('cause/status diagnostics are allowlisted and never echo raw upstream data', async t => {
  let failure;
  const { service, logs } = inference(t, async () => { throw failure; });
  for (const [error, expected] of [
    [Object.assign(new TypeError('private-fetch-url'), { cause: { code: 'ENOTFOUND', address: 'private-address' } }), 'ENOTFOUND'],
    [Object.assign(new Error('private-http-body'), { status: 503 }), 'HTTP_ERROR; HTTP 503'],
    [Object.assign(new Error('private-message'), { cause: { code: 'private-code' }, status: 'private-status' }), 'UNKNOWN'],
    [new SyntaxError('private-json-body'), 'INVALID_RESPONSE'],
    [new DOMException('private-abort-reason', 'AbortError'), 'ABORTED'],
  ]) {
    failure = error;
    assert.ok((await service.ask('topic', 'private-prompt')).includes(expected));
    assert.doesNotMatch(service.status('topic'), /private-/);
  }
  assert.doesNotMatch(JSON.stringify(logs), /private-/);
});

test('clear during pending inference does not resurrect cleared history', async t => {
  let finish;
  const { service } = inference(t, () => new Promise(resolve => { finish = resolve; }));
  const pending = service.ask('topic', 'synthetic'); service.clear('topic');
  finish(completion('done')); await pending;
  assert.equal(service.historyLength(), 0);
  assert.match(service.status('topic'), /Last completed: success/);
});

test('actual Bedrock call forwards optional signal and never reads/logs HTTP error bodies', async t => {
  const logs = [];
  stub(t, '../dist/adapters', { STATIC_MODEL_ID: 'fixture-model' });
  stub(t, '../dist/utils/logger', { logger: { warn: () => {}, error: (...args) => logs.push(args) } });
  stub(t, '../dist/utils/redis-cache', {});
  stub(t, '../dist/utils/sound-notification', {});
  stub(t, '../dist/utils/voice-summary', {});
  stub(t, '../dist/utils/prompt-cache-usage', { logPromptCacheUsage: () => {} });
  const key = require.resolve('../dist/bedrock'); delete require.cache[key]; t.after(() => delete require.cache[key]);
  const { invokeModelOpenAI } = require(key);
  let incoming; let mode = 'success'; let cancelled = false;
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/v1/chat/completions'));
    incoming = options;
    if (mode === 'success') return { ok: true, json: async () => completion('fixture') };
    if (mode === 'body-abort') return { ok: true, json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('fixture', 'AbortError')), { once: true });
    }) };
    return { ok: false, status: 503, body: { cancel: async () => { cancelled = true; } }, text: () => assert.fail('Must not read raw error body') };
  });
  const controller = new AbortController();
  assert.deepEqual(await invokeModelOpenAI({ messages: [], tools: [] }, controller.signal), completion('fixture'));
  assert.equal(incoming.signal, controller.signal);
  assert.deepEqual(JSON.parse(incoming.body), { messages: [], model: 'fixture-model' });
  await invokeModelOpenAI({ messages: [] }); assert.equal(incoming.signal, undefined);
  mode = 'error';
  await assert.rejects(invokeModelOpenAI({}), error => error.status === 503 && error.message === 'Mantle HTTP request failed');
  assert.equal(cancelled, true); assert.deepEqual(logs, []);
  mode = 'body-abort';
  const pending = invokeModelOpenAI({}, controller.signal);
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
