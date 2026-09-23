const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { publishProgress, validateProgress, renderProgress } = require('../dist/services/telegram-progress');
const event = {
  run: 'hopper-20260913', sequence: 1, phase: 'review',
  areas: ['comments', 'groups', 'reel-playback', 'nearby-sync'], decision: 'inspection-first',
  evidence: [{ check: 'android-compile', result: 'pending' }, { check: 'device-sync', result: 'not-run' }],
  blockers: ['compile-pending', 'device-unverified'], next: 'inspect',
};
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-progress-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'progress.json');
}
test('strict schema never accepts transcripts, message bodies, locations or secret fields', () => {
  for (const field of ['text', 'transcript', 'reasoning', 'location', 'token', 'chat_id']) {
    assert.throws(() => validateProgress({ ...event, [field]: 'private data' }));
  }
  assert.throws(() => validateProgress({ ...event, decision: 'arbitrary private text' }));
  assert.throws(() => validateProgress({ ...event, evidence: [{ check: 'proxy-tests', result: 'passed', text: 'log' }] }));
  assert.throws(() => validateProgress({ ...event, sequence: NaN }));
  assert.match(renderProgress(event), /No device sync proof yet/);
  assert.match(renderProgress(event), /Compilation validation pending/);
});
test('durable semantic and sequence dedup, acknowledgement and private state', async t => {
  const file = await fixture(t); let calls = 0;
  const send = async () => { calls++; return { messageId: 123, topic: 'workspace' }; };
  assert.equal((await publishProgress(event, send, file, 100000)).status, 'delivered');
  assert.equal((await publishProgress(event, send, file, 200000)).status, 'duplicate');
  assert.equal((await publishProgress({ ...event, sequence: 2, areas: [...event.areas].reverse() }, send, file, 200000)).status, 'duplicate');
  assert.equal(calls, 1);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.doesNotMatch(await fs.readFile(file, 'utf8'), /comments|reel|Decision/);
});
test('rate limits defer without losing a retry; uncertain sends never auto-retry', async t => {
  const file = await fixture(t); let calls = 0;
  const send = async () => { calls++; return { messageId: 123, topic: 'workspace' }; };
  await publishProgress(event, send, file, 100000);
  const next = { ...event, sequence: 2, phase: 'validation' };
  assert.equal((await publishProgress(next, send, file, 100001)).status, 'deferred');
  assert.equal((await publishProgress(next, async () => { throw new Error('offline'); }, file, 140000)).status, 'uncertain');
  assert.equal((await publishProgress(next, send, file, 200000)).status, 'uncertain');
  assert.equal(calls, 1);
});
test('overlap fails closed while sender owns reservation', async t => {
  const file = await fixture(t); let release, started;
  const ready = new Promise(r => { started = r; });
  const pending = publishProgress(event, () => new Promise(r => { release = r; started(); }), file, 100000);
  await ready;
  await assert.rejects(publishProgress(event, async () => { throw new Error('must not run'); }, file, 100000));
  release({ messageId: 123, topic: 'workspace' });
  assert.equal((await pending).status, 'delivered');
});
test('corrupt state and missing acknowledgement fail closed', async t => {
  const file = await fixture(t);
  assert.equal((await publishProgress(event, async () => ({}), file, 100000)).status, 'uncertain');
  await fs.writeFile(file, 'broken');
  await assert.rejects(publishProgress(event, async () => { throw new Error('must not run'); }, file));
});
test('sequence conflicts, bounded daily budget, run capacity and malformed metadata fail safely', async t => {
  const file = await fixture(t);
  const send = async () => ({ messageId: 123, topic: 'workspace' });
  await publishProgress(event, send, file, 100000);
  await assert.rejects(publishProgress({ ...event, phase: 'blocked' }, send, file, 200000), /conflict/);
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  const saved = state.entries[0];
  state.entries = Array.from({ length: 120 }, (_, i) => ({ ...saved, hash: String(i).padStart(64, '0'), sequence: i + 1 }));
  state.runs[event.run] = 120;
  await fs.writeFile(file, JSON.stringify(state));
  assert.equal((await publishProgress({ ...event, sequence: 121 }, send, file, 200000)).status, 'deferred');
  state.entries = [];
  state.runs = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`hopper-2026090${i + 1}`, 1]));
  await fs.writeFile(file, JSON.stringify(state));
  await assert.rejects(publishProgress(event, send, file, 200000), /capacity/);
  state.runs = {}; state.entries = [{}];
  await fs.writeFile(file, JSON.stringify(state));
  await assert.rejects(publishProgress(event, send, file, 200000), /Invalid progress state/);
});
test('unsafe state permissions and symlinked files are rejected', async t => {
  const file = await fixture(t);
  await fs.writeFile(file, '{}', { mode: 0o644 });
  const send = async () => assert.fail('Unsafe file must not reach sender');
  await assert.rejects(publishProgress(event, send, file));
  await fs.unlink(file);
  await fs.symlink(path.join(path.dirname(file), 'missing'), file);
  await assert.rejects(publishProgress(event, send, file));
});
