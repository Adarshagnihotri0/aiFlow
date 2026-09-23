const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function stub(t, name, exports) {
  const key = require.resolve(name); const original = require.cache[key];
  require.cache[key] = { id: key, filename: key, loaded: true, exports };
  t.after(() => { if (original) require.cache[key] = original; else delete require.cache[key]; });
}
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-command-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const originalEnv = { ...process.env };
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_CHAT_ID: '-100', TELEGRAM_ACTION_USER_IDS: '10', TELEGRAM_ENABLED: 'true' });
  t.after(() => { process.env = originalEnv; });
  t.mock.method(global, 'fetch', () => assert.fail('No live network'));
  t.mock.method(require('node:child_process'), 'spawn', () => assert.fail('No real workspace subprocess'));
  const effects = []; const methods = []; const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const workspace = { name: 'Fixture', root: '/Users/adarshagnihotri/Desktop/grasshopper/bitchat-android', topicId: 3, checks: { build: { executable: '/fixture/build', args: [] } } };
  let binding = workspace; let fingerprint = 'initial'; let fingerprintHook; let failure; let membershipFailure = false;
  const creators = new Set([20]);
  t.mock.method(https, 'request', (options, callback) => {
    const method = options.path.split('/').at(-1); methods.push(method);
    assert.ok(['getChatMember', 'sendChatAction'].includes(method), 'No poller, registration, or send may run');
    const request = new EventEmitter(); request.destroy = error => request.emit('error', error);
    request.end = body => queueMicrotask(() => {
      const payload = JSON.parse(body);
      if (membershipFailure && method === 'getChatMember') { request.emit('error', new Error('private membership error')); return; }
      const response = new EventEmitter(); response.statusCode = 200; callback(response);
      response.emit('data', JSON.stringify({ ok: true, result: method === 'getChatMember'
        ? { status: creators.has(payload.user_id) ? 'creator' : 'administrator' } : true }));
      response.emit('end');
    });
    return request;
  });
  stub(t, '../dist/services/telegram-forwarder', { redactSensitiveText: text => text, forwardTelegramThreadText: () => assert.fail('Dispatch does not send') });
  // Only use the real token constructor. Never call real resolve/fingerprint/agent/check helpers.
  const realWorkspace = require('../dist/services/workspace-agent');
  stub(t, '../dist/services/workspace-agent', {
    createPendingWork: realWorkspace.createPendingWork,
    resolveWorkspace: async thread => { effects.push(['resolve', thread]); return binding; },
    workspaceFingerprint: async () => { effects.push(['fingerprint']); fingerprintHook?.(); return fingerprint; },
    runWorkspaceAgent: async (ws, request, mode) => {
      effects.push(['agent', mode, ws.root, request]); if (failure) throw failure; return `Mock ${mode} result`;
    },
    runWorkspaceCheck: async (ws, name) => {
      effects.push(['check', name]); if (failure) throw failure;
      if (!Object.hasOwn(ws.checks, name)) throw new Error('private unknown check'); return 'Mock check result';
    },
  });
  let modelFailure;
  stub(t, '../dist/bedrock', { invokeModelOpenAI: async (body, signal) => {
    effects.push(['model', body]); assert.ok(signal instanceof AbortSignal);
    if (modelFailure) throw modelFailure; return { choices: [{ message: { content: 'Mock answer' } }] };
  } });
  stub(t, '../dist/adapters', { STATIC_MODEL_ID: 'fixture-model' });
  const inbox = require('../dist/services/telegram-action-inbox'); const file = path.join(dir, 'actions.json');
  stub(t, '../dist/services/telegram-action-inbox', {
    ...inbox, handleActionMessage: (message, options) => {
      effects.push(['inbox', message.command]); return inbox.handleActionMessage(message, { ...options, file });
    },
    readActionCursor: () => assert.fail('No poller'), recordActionCursor: () => assert.fail('No poller'),
  });
  for (const name of ['../dist/telegram-polling', '../dist/services/telegram-inference']) {
    const key = require.resolve(name); delete require.cache[key]; t.after(() => delete require.cache[key]);
  }
  const { handleTelegramMessage } = require('../dist/telegram-polling');
  let update = 0;
  const send = (text, user = 20, thread = 3, override = {}) => handleTelegramMessage({
    message_id: ++update, chat: { id: -100 }, from: { id: user }, message_thread_id: thread, text, ...override,
  }, update);
  return { send, effects, methods, logs, workspace, creators,
    actions: () => inbox.inspectActions(file, now),
    setBinding: value => { binding = value; }, setFingerprint: value => { fingerprint = value; },
    setNow: value => { now = value; }, onFingerprint: fn => { fingerprintHook = fn; },
    setFailure: value => { failure = value; }, setModelFailure: value => { modelFailure = value; },
    failMembership: () => { membershipFailure = true; },
  };
}
const token = reply => { const match = reply.match(/\/workconfirm ([a-f0-9]{32})/); assert.ok(match, reply); return match[1]; };
const executions = f => f.effects.filter(effect => effect[0] === 'agent' && effect[1] === 'execute');

test('legacy execution and durable inbox have disjoint confirmations and cancellation namespaces', async t => {
  const f = await fixture(t);
  const plan = await f.send('/work@FixtureBot synthetic change'); const legacy = token(plan);
  assert.match(plan, /\/workcancel/); assert.match(plan, /Read-only planning/);
  assert.equal(executions(f).length, 0);
  // Creator-only work is available even when the explicit inbox allowlist excludes that creator.
  assert.match(await f.send(`/confirm ${legacy}`, 10), /No matching/);
  assert.match(await f.send(`/cancel ${legacy}`, 10), /No matching/);
  const request = await f.send('/action review-comments', 10);
  const challenge = request.match(/\/confirm ([a-f0-9]{16} [a-f0-9]{32})/)[1];
  assert.match(await f.send(`/workconfirm ${challenge}`), /No matching/);
  assert.match(await f.send(`/workcancel ${challenge}`), /No matching/);
  assert.match(await f.send(`/confirm ${challenge}`, 10), /queued/);
  assert.equal((await f.actions())[0].status, 'queued'); assert.equal(executions(f).length, 0);
  assert.match(await f.send(`/workconfirm ${legacy}`), /not independently verified/);
  assert.equal(executions(f).length, 1);
  assert.match(await f.send(`/workconfirm ${legacy}`), /consumed/);
  assert.equal(executions(f).length, 1);
});

test('unauthorized/bot/wrong-chat commands have no typing, model, inbox, or workspace effects', async t => {
  const f = await fixture(t);
  for (const command of ['/work synthetic', '/check build', '/workconfirm fake', '/workcancel fake']) {
    assert.equal(await f.send(command, 10), undefined, 'allowlisted administrator is not creator');
    assert.equal(await f.send(command, 99), undefined);
    assert.equal(await f.send(command, 20, 3, { from: { id: 20, is_bot: true } }), undefined);
    assert.equal(await f.send(command, 20, 3, { chat: { id: -200 } }), undefined);
  }
  for (const command of ['/ask synthetic', '/action review-comments', '/confirm fake', '/cancel fake']) {
    assert.equal(await f.send(command, 99), undefined);
    assert.equal(await f.send(command, 20), undefined, 'inbox allowlist remains strict, no creator fallback');
  }
  f.failMembership(); assert.equal(await f.send('/work synthetic'), undefined);
  assert.deepEqual(f.effects, []);
  assert.ok(f.methods.every(method => method === 'getChatMember'));
  assert.deepEqual(f.logs, []);
  assert.deepEqual(await f.actions(), []);
});

test('token owner and topic are enforced; cancellation is single-use', async t => {
  const f = await fixture(t); const pending = token(await f.send('/work synthetic'));
  f.creators.add(30); // Simulate group ownership transfer after a plan was created.
  assert.match(await f.send(`/workconfirm ${pending}`, 30), /wrong owner\/topic/);
  assert.match(await f.send(`/workcancel ${pending}`, 30), /wrong owner\/topic/);
  assert.match(await f.send(`/workconfirm ${pending}`, 20, 4), /wrong owner\/topic/);
  assert.match(await f.send(`/workcancel ${pending}`, 20, 4), /wrong owner\/topic/);
  assert.match(await f.send(`/workcancel ${pending}`), /cancelled/);
  assert.match(await f.send(`/workconfirm ${pending}`), /consumed/);
  assert.equal(executions(f).length, 0);
});

test('expired, changed-fingerprint, changed/disabled-binding tokens are refused and never reusable', async t => {
  const f = await fixture(t);
  const expired = token(await f.send('/work synthetic'));
  f.setNow(1600000); assert.match(await f.send(`/workconfirm ${expired}`), /expired/);
  const stale = token(await f.send('/work synthetic'));
  f.setFingerprint('changed'); assert.match(await f.send(`/workconfirm ${stale}`), /workspace changed/);
  f.setFingerprint('initial'); assert.match(await f.send(`/workconfirm ${stale}`), /consumed/);
  const remapped = token(await f.send('/work synthetic'));
  f.setBinding({ ...f.workspace, root: '/other-fixture' });
  assert.match(await f.send(`/workconfirm ${remapped}`), /binding changed/);
  f.setBinding(f.workspace); assert.match(await f.send(`/workconfirm ${remapped}`), /consumed/);
  const disabled = token(await f.send('/work synthetic')); f.setBinding(undefined);
  assert.match(await f.send(`/workconfirm ${disabled}`), /disabled/);
  assert.equal(executions(f).length, 0);
});

test('expiry is rechecked after awaited fingerprint and concurrent confirmations execute at most once', async t => {
  const f = await fixture(t); const expired = token(await f.send('/work synthetic'));
  f.onFingerprint(() => f.setNow(1600000));
  assert.match(await f.send(`/workconfirm ${expired}`), /expired/); assert.equal(executions(f).length, 0);
  f.onFingerprint(undefined);
  const pending = token(await f.send('/work synthetic'));
  const results = await Promise.all([f.send(`/workconfirm ${pending}`), f.send(`/workconfirm ${pending}`)]);
  assert.equal(executions(f).length, 1);
  assert.ok(results.some(reply => /consumed/.test(reply)));
});

test('workspace failures never claim success, leak subprocess text, or allow token replay', async t => {
  const f = await fixture(t); const pending = token(await f.send('/work synthetic'));
  f.setFailure(new Error('private subprocess output'));
  assert.match(await f.send(`/workconfirm ${pending}`), /completion is not confirmed/);
  assert.match(await f.send(`/workconfirm ${pending}`), /consumed/);
  assert.match(await f.send('/check build'), /completion is not confirmed/);
  assert.doesNotMatch(JSON.stringify(f.logs), /private subprocess/);
});

test('creator check delegates only to existing configured-check helper, not model or inbox', async t => {
  const f = await fixture(t);
  assert.match(await f.send('/check'), /check exited successfully/);
  assert.deepEqual(f.effects, [['resolve', 3], ['check', 'build']]);
  assert.match(await f.send('/check unconfigured'), /completion is not confirmed/);
  assert.equal(executions(f).length, 0);
});

test('real dispatch reports actual inference outcome, rejects invalid prompts, and keeps status independent of commands', async t => {
  const f = await fixture(t);
  assert.match(await f.send('/status', 10), /no inference observed/);
  assert.match(await f.send('/ask', 10), /Usage/);
  assert.match(await f.send(`/ask ${'a'.repeat(12001)}`, 10), /too long/);
  assert.equal(f.effects.length, 0);
  assert.equal(await f.send('/ask synthetic', 10), 'Mock answer');
  assert.match(await f.send('/status', 10), /Last completed: success/);
  await f.send('/check');
  assert.match(await f.send('/status', 10), /Last completed: success/);
  f.setModelFailure(Object.assign(new Error('private URL'), { cause: { code: 'ENOTFOUND' } }));
  assert.match(await f.send('/ask synthetic', 10), /ENOTFOUND/);
  assert.match(await f.send('/status', 10), /Last completed: failure.*ENOTFOUND/);
  assert.match(await f.send('/history', 10), /\*\*2\*\*/);
  await f.send('/clear', 10);
  assert.match(await f.send('/history', 10), /\*\*0\*\*/);
  assert.match(await f.send('/status', 10), /Last completed: failure/);
  assert.doesNotMatch(JSON.stringify(f.logs), /private URL/);
  const help = await f.send('/help', 10);
  assert.match(help, /no workspace tools or VS Code session access/);
  assert.match(help, /\/confirm and \/cancel are inbox-only/);
});
