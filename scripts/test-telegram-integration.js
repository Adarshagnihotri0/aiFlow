const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// All Telegram requests in this process are local mocks, including getUpdates.
function mockTransport(t, respond) {
  const original = https.request;
  https.request = (options, callback) => {
    const request = new EventEmitter();
    request.destroy = error => request.emit('error', error);
    request.end = body => queueMicrotask(() => {
      const result = respond(options.path.split('/').at(-1), JSON.parse(body));
      const response = new EventEmitter(); response.statusCode = result.http ?? 200;
      callback(response);
      response.emit('data', JSON.stringify(result.body)); response.emit('end');
    });
    return request;
  };
  t.after(() => { https.request = original; });
}
function stubModule(t, name, exports) {
  const key = require.resolve(name); const original = require.cache[key];
  require.cache[key] = { id: key, filename: key, loaded: true, exports };
  t.after(() => { if (original) require.cache[key] = original; else delete require.cache[key]; });
}

test('existing sender returns actual ack, propagates rejection, and never polls or creates topics', async t => {
  process.env.TELEGRAM_BOT_TOKEN = 'fixture'; process.env.TELEGRAM_CHAT_ID = '-100';
  process.env.TELEGRAM_FORWARD_CHATS = 'false';
  const originalRead = fs.readFileSync;
  fs.readFileSync = function(file, ...args) {
    if (String(file).endsWith('telegram-workspace-topics.json')) return JSON.stringify({ topics: { 'Workspace | bitchat-android': 42 } });
    return originalRead.call(this, file, ...args);
  };
  t.after(() => { fs.readFileSync = originalRead; });
  let mode = 'ok'; const methods = [];
  mockTransport(t, (method, payload) => {
    methods.push(method); assert.equal(payload.message_thread_id, 42); assert.equal(payload.chat_id, '-100');
    assert.doesNotMatch(payload.text, /private-value/);
    if (mode === 'reject') return { http: 429, body: { ok: false, description: 'fixture rate limit' } };
    if (mode === 'no-ack') return { body: { ok: true, result: {} } };
    return { body: { ok: true, result: { message_id: 77 } } };
  });
  const { sendProgressText, forwardWorkspaceText } = require('../dist/services/telegram-forwarder');
  process.env.TELEGRAM_FORWARD_CHATS = 'true';
  await forwardWorkspaceText('bitchat-android', 'private whole response must never be forwarded');
  assert.equal(methods.length, 0, 'existing Hopper Stop hook must not forward raw audits');
  process.env.TELEGRAM_FORWARD_CHATS = 'false';
  assert.deepEqual(await sendProgressText('token=private-value'), { messageId: 77, topic: 'workspace' });
  mode = 'reject'; await assert.rejects(sendProgressText('bounded update'));
  mode = 'no-ack'; await assert.rejects(sendProgressText('bounded update'));
  mode = 'ok'; assert.equal((await sendProgressText('recovered')).messageId, 77);
  assert.deepEqual(methods, ['sendMessage', 'sendMessage', 'sendMessage', 'sendMessage']);
});

test('existing single poller routes approved actions only to durable inbox, never legacy execution or model', async t => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'telegram-poller-test-'));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'actions.json');
  const inbox = require('../dist/services/telegram-action-inbox');
  const replies = []; let challenge; const cursors = []; let polls = 0;
  const stop = new Error('fixture done');
  stubModule(t, '../dist/services/telegram-action-inbox', {
    ...inbox,
    readActionCursor: async () => 100,
    recordActionCursor: async id => { cursors.push(id); await inbox.recordActionCursor(id, file); if (id === 105) throw stop; },
    handleActionMessage: (message, options) => inbox.handleActionMessage(message, { ...options, file }),
  });
  stubModule(t, '../dist/services/telegram-forwarder', {
    forwardTelegramThreadText: async (_label, response) => {
      replies.push(response);
      const match = response.match(/\/confirm ([a-f0-9]{16} [a-f0-9]{32})/);
      if (match) challenge = match[1];
    },
  });
  stubModule(t, '../dist/services/workspace-agent', {
    resolveWorkspace: async () => ({ root: '/Users/adarshagnihotri/Desktop/grasshopper/bitchat-android' }),
    runWorkspaceAgent: () => assert.fail('Legacy execution must not run'),
    runWorkspaceCheck: () => assert.fail('Legacy check must not run'),
  });
  stubModule(t, '../dist/bedrock', { invokeModelOpenAI: () => assert.fail('Actions must not invoke a model') });
  stubModule(t, '../dist/adapters', { STATIC_MODEL_ID: 'fixture-model' });
  process.env.TELEGRAM_ACTION_USER_IDS = '10'; process.env.TELEGRAM_BOT_TOKEN = 'fixture';
  process.env.TELEGRAM_CHAT_ID = '-100'; process.env.TELEGRAM_ENABLED = 'true';
  const message = (update_id, text, user = 10) => ({ update_id, message: { message_id: update_id, chat: { id: -100 }, from: { id: user }, message_thread_id: 3, text } });
  mockTransport(t, (method, body) => {
    if (method === 'getUpdates') {
      assert.notEqual(body.offset, -1, 'durable restart must not discard the backlog');
      polls++;
      if (polls === 1) return { http: 503, body: { ok: false, description: 'fixture offline' } };
      const result = polls === 2
        ? [message(101, '/action review-comments', 99), message(102, '/action review-comments'), message(103, '/work delete everything')]
        : [message(104, `/confirm ${challenge}`), message(105, '/action review-comments')];
      assert.ok(polls <= 3, 'no extra consumer');
      return { body: { ok: true, result } };
    }
    if (method === 'getChatMember') return { body: { ok: true, result: { status: 'member' } } };
    if (method === 'setMyCommands') {
      const commands = body.commands.map(item => item.command);
      for (const name of ['work', 'workconfirm', 'workcancel', 'check', 'action', 'confirm', 'cancel']) assert.ok(commands.includes(name));
      assert.match(body.commands.find(item => item.command === 'confirm').description, /does not execute/);
    }
    assert.ok(['setMyCommands', 'sendChatAction'].includes(method));
    return { body: { ok: true, result: true } };
  });
  const polling = require('../dist/telegram-polling');
  const started = Date.now();
  const running = polling.startTelegramPolling();
  await polling.startTelegramPolling(); // Guard prevents a second same-process consumer.
  await assert.rejects(running, error => error === stop);
  assert.ok(Date.now() - started >= 1000, 'offline polling must back off');
  assert.equal(polls, 3);
  assert.equal(replies.length, 3); // Unauthorized sender and non-creator /work have no response/effects.
  assert.match(replies[1], /queued/);
  const actions = await inbox.inspectActions(file);
  assert.equal(actions.length, 1); assert.equal(actions[0].status, 'queued');
  assert.deepEqual(cursors, [101, 102, 103, 104, 105]);
  assert.equal(await inbox.readActionCursor(file), 105);
});
