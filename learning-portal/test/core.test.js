import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicJson, createStore, scheduleReview } from '../server/store.js';
import { chatSchema, redact, validateSession } from '../server/schema.js';
import { lessons, sourceIds, retrieve } from '../server/catalog.js';
import { boundedHistory } from '../public/limits.js';

test('all lessons have a real approved source, exercise, and recall contract', () => {
  assert.equal(new Set(lessons.map((lesson) => lesson.id)).size, lessons.length);
  for (const lesson of lessons) {
    assert.ok(lesson.sourceIds.every((id) => sourceIds.includes(id)));
    assert.ok(lesson.exercise && lesson.question && lesson.answer && lesson.interview);
  }
});
test('review scheduling resets changed sources and bounds long intervals', () => {
  const first = scheduleReview(null, 'good', 1000, 'v1');
  assert.equal(first.due, 1000 + 86400000);
  assert.equal(scheduleReview(first, 'again', 2000, 'v1').due, 602000);
  assert.equal(scheduleReview(first, 'easy', 2000, 'v2').reps, 1);
  assert.equal(scheduleReview({ fingerprint: 'v1', interval: 1e12, reps: 1 }, 'easy', 0, 'v1').interval, 180 * 86400000);
});
test('serialized durable writes preserve overlapping updates and survive reopen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-test-'));
  try {
    const store = await createStore(dir);
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.update((state) => { state.progress[`lesson-${i}`] = { read: true }; })));
    const reopened = await createStore(dir);
    assert.equal(Object.keys(reopened.snapshot().progress).length, 12);
    assert.equal((await stat(path.join(dir, 'notebook.json'))).mode & 0o777, 0o600);
    const detached = store.snapshot(); detached.profile.role = 'backend';
    assert.equal(store.snapshot().profile.role, 'undecided');
    await assert.rejects(store.update((state) => { state.profile.minutes = -1; }));
    assert.equal(store.snapshot().profile.minutes, 25);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('corrupt progress is not silently overwritten', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-test-'));
  try { await writeFile(path.join(dir, 'notebook.json'), 'broken'); await assert.rejects(createStore(dir), /refusing to overwrite/); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
test('sensitive assignments are redacted and unapproved session sources rejected', () => {
  assert.ok(!redact('password=topsecret').includes('topsecret'));
  assert.ok(!redact('Bearer abcdef123456').includes('abcdef123456'));
  assert.throws(() => validateSession({ id: 'hello' }, sourceIds));
});
test('retrieval omits missing sources and prefers selected lesson context', () => {
  const sources = [{ id: 'one', text: 'alpha', missing: false }, { id: 'two', text: 'beta', missing: false }, { id: 'three', text: 'beta', missing: true }];
  const selected = retrieve('beta', sources, { sourceIds: ['one'] });
  assert.equal(selected[0].id, 'one'); assert.equal(selected.length, 2);
});

test('browser history keeps the latest eight entries of at most 4000 characters through sixth and later turns', () => {
  const messages = [];
  assert.deepEqual(boundedHistory(messages), []);
  for (let turn = 1; turn <= 12; turn++) {
    const input = Object.freeze(messages.slice());
    const history = boundedHistory(input);
    assert.equal(history.length, Math.min(messages.length, 8), `turn ${turn}`);
    assert.deepEqual(history, messages.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })));
    assert.ok(history.every((entry) => entry.content.length <= 4000));
    assert.deepEqual(chatSchema.parse({ question: `Explain turn ${turn}`, mode: 'teach', history }).history, history);
    if (turn >= 6) {
      assert.equal(history.length, 8);
      assert.equal(history[0].content, `Question ${turn - 4}`);
      assert.equal(history.at(-1).content.length, 4000);
    }
    // Browser-only metadata must not leak into the strict wire schema, and the
    // full answer in the in-memory transcript must not be truncated in place.
    messages.push(Object.freeze({ role: 'user', content: `Question ${turn}` }));
    messages.push(Object.freeze({ role: 'assistant', content: `Answer ${turn}: ${'a'.repeat(16000 - `Answer ${turn}: `.length)}`, sources: ['hopper-contracts'], warning: 'Not independently verified.' }));
  }
  assert.ok(messages.filter((entry) => entry.role === 'assistant').every((entry) => entry.content.length === 16000));
});

test('a committed persist failure advances the snapshot and fences queued and later writes until reopen', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-commit-fault-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fault = Object.assign(new Error('Injected post-rename durability failure'), { committed: true });
  let persistCalls = 0;
  const store = await createStore(dir, { persist: async (file, state) => {
    persistCalls++;
    await atomicJson(file, state);
    throw fault;
  } });
  let blockedMutations = 0;
  const committed = assert.rejects(store.update((state) => { state.profile.role = 'backend'; }), (error) => {
    assert.equal(error, fault);
    assert.equal(error.committed, true);
    return true;
  });
  const queued = assert.rejects(store.update((state) => { blockedMutations++; state.profile.minutes = 45; }), /writes stopped after a storage failure/);
  await Promise.all([committed, queued]);
  assert.equal(store.snapshot().profile.role, 'backend');
  assert.equal(store.snapshot().profile.minutes, 25);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'notebook.json'), 'utf8')), store.snapshot());
  await assert.rejects(store.update(() => { blockedMutations++; }), /writes stopped after a storage failure/);
  assert.equal(blockedMutations, 0);
  assert.equal(persistCalls, 1);

  const reopened = await createStore(dir);
  assert.deepEqual(reopened.snapshot(), store.snapshot());
  await reopened.update((state) => { state.profile.minutes = 45; });
  assert.equal(reopened.snapshot().profile.role, 'backend');
  assert.equal(reopened.snapshot().profile.minutes, 45);
  assert.deepEqual((await createStore(dir)).snapshot(), reopened.snapshot());
  await assert.rejects(store.update(() => { blockedMutations++; }), /writes stopped after a storage failure/);
  assert.equal(blockedMutations, 0);
  assert.equal(persistCalls, 1);
});