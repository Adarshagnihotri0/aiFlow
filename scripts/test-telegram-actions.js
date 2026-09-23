const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { handleActionMessage, inspectActions, transitionAction, actionCodes } = require('../dist/services/telegram-action-inbox');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-action-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let now = 1000000;
  const options = { chatId: '-100', allowedUsers: ['10'], isChatCreator: async () => false,
    file: path.join(dir, 'actions.json'), now: () => now };
  const base = { updateId: 1, chatId: '-100', userId: '10', threadId: 3, workspace: '/fixture', command: 'action', argument: 'review-comments' };
  const send = delta => handleActionMessage({ ...base, ...delta }, options);
  return { options, base, send, setNow: n => { now = n; } };
}
function confirmation(reply) { return reply.match(/\/confirm ([a-f0-9]{16}) ([a-f0-9]{32})/).slice(1).join(' '); }
test('configured chat AND user AND topic required; bots rejected without state', async t => {
  const { send, options } = await fixture(t);
  for (const delta of [{ chatId: 'other' }, { userId: '11' }, { isBot: true }, { threadId: 0 }]) {
    assert.equal(await send(delta), 'Action access denied.');
  }
  await assert.rejects(fs.stat(options.file), { code: 'ENOENT' });
});
test('explicit allowlist does not silently fall back to creator', async t => {
  const { base, options } = await fixture(t);
  options.isChatCreator = async () => true;
  assert.equal(await handleActionMessage({ ...base, userId: '99' }, options), 'Action access denied.');
  options.allowedUsers = [];
  assert.match(await handleActionMessage({ ...base, userId: '99' }, options), /No work has run/);
});
test('confirmation bound to request, user, topic and workspace; single use and durable replay rejection', async t => {
  const { send, options } = await fixture(t);
  const argument = confirmation(await send({}));
  assert.match(await send({ updateId: 2, command: 'confirm', argument, threadId: 4 }), /No matching/);
  assert.match(await send({ updateId: 3, command: 'confirm', argument, workspace: '/other' }), /No matching/);
  assert.match(await send({ updateId: 4, command: 'confirm', argument: `${argument.slice(0, -1)}x` }), /invalid/);
  assert.match(await send({ updateId: 5, command: 'confirm', argument }), /queued/);
  assert.match(await send({ updateId: 6, command: 'confirm', argument }), /consumed/);
  assert.match(await send({ updateId: 5, command: 'confirm', argument }), /already handled/);
  assert.equal((await inspectActions(options.file, options.now()))[0].status, 'queued');
  const stored = await fs.readFile(options.file, 'utf8');
  assert.doesNotMatch(stored, new RegExp(argument.split(' ')[1]));
  assert.doesNotMatch(stored, /\/fixture|userId|chatId|threadId/);
});
test('expired and cancelled confirmations never become queued', async t => {
  const { send, options, setNow } = await fixture(t);
  const argument = confirmation(await send({}));
  setNow(1600000);
  assert.match(await send({ updateId: 2, command: 'confirm', argument }), /expired/);
  assert.equal((await inspectActions(options.file, options.now()))[0].status, 'expired');
  const another = confirmation(await send({ updateId: 3 }));
  assert.match(await send({ updateId: 4, command: 'cancel', argument: another.split(' ')[0] }), /cancelled/);
  assert.match(await send({ updateId: 5, command: 'confirm', argument: another }), /consumed/);
});
test('allowlist rejects shell, destructive/publication/secret requests and free text without executing', async t => {
  const { send, options } = await fixture(t);
  let updateId = 1;
  for (const argument of ['rm -rf /', 'publish', 'delete-data', 'show-token', 'review-comments; echo x', 'please fix everything']) {
    assert.match(await send({ updateId: updateId++, argument }), /No free-text/);
  }
  assert.deepEqual(await inspectActions(options.file, options.now()), []);
});
test('local claim is single-use; in-progress restart timeout blocks instead of replaying', async t => {
  const { send, options } = await fixture(t);
  const argument = confirmation(await send({}));
  const id = argument.split(' ')[0];
  await assert.rejects(transitionAction(id, 'in_progress', options.file, options.now()));
  await send({ updateId: 2, command: 'confirm', argument });
  assert.equal((await transitionAction(id, 'in_progress', options.file, options.now())).status, 'in_progress');
  await assert.rejects(transitionAction(id, 'in_progress', options.file, options.now()));
  assert.equal((await inspectActions(options.file, options.now() + 1800000))[0].status, 'blocked');
  await assert.rejects(transitionAction(id, 'succeeded', options.file, options.now() + 1800000));
});
test('bounded active queue and semantic duplicate requests', async t => {
  const { send, options } = await fixture(t);
  await send({});
  assert.match(await send({ updateId: 2 }), /awaiting_confirmation/);
  let updateId = 3;
  for (let i = 1; i <= 31; i++) await send({ updateId: updateId++, threadId: 3 + i, argument: actionCodes[i % actionCodes.length] });
  assert.match(await send({ updateId, threadId: 99 }), /inbox full/);
  assert.equal((await inspectActions(options.file, options.now())).length, 32);
});
test('local completion has explicit status and no raw evidence output', async t => {
  const { send, options } = await fixture(t);
  const argument = confirmation(await send({})); const id = argument.split(' ')[0];
  await send({ updateId: 2, command: 'confirm', argument });
  await transitionAction(id, 'in_progress', options.file, options.now());
  assert.deepEqual(await transitionAction(id, 'succeeded', options.file, options.now()), { id, action: 'review-comments', status: 'succeeded' });
});
