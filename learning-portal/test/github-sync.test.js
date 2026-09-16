import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGitHubSync, exportNotebook } from '../server/github-sync.js';
import { atomicJson, createStore } from '../server/store.js';
import { profileDefault } from '../server/schema.js';
import { sourceIds } from '../server/catalog.js';

const REPO = 'Example/Notebook';
const REPO_ID = 12345;
const TOKEN = 'server-only-fixture-token';
const CONTENT_PATH = 'fieldnotes/notebook.json';
const API = 'https://api.github.com/repos/Example/Notebook';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const emptyState = () => ({ version: 1, profile: { ...profileDefault }, reviews: {}, progress: {}, receipts: [], sessions: [] });
const session = (id = 'lesson-one', extra = {}) => ({
  id, title: 'A curated lesson', date: '2026-09-16T12:00:00.000Z', status: 'complete',
  summary: 'A curated summary, not a source excerpt.', why: 'Keep work owned by the right layer.',
  changes: ['Added a bounded queue.'], concepts: ['Ownership'], exercise: 'Explain cancellation.',
  evidence: [{ label: 'Queue test', state: 'reported', reference: 'Recorded test result.' }],
  sourceIds: [sourceIds[0]],
  teaching: { plainExplanation: 'One writer at a time.', example: 'Queue a task, then await it.', checkQuestion: 'How many writers?', checkAnswer: 'One.' },
  ...extra,
});

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-github-'));
  const store = await createStore(directory);
  const adapters = [];
  const f = {
    directory, store, calls: [], remote: null, sequence: 0,
    metadata: { id: REPO_ID, private: true, archived: false, owner: { login: 'example' }, name: 'NOTEBOOK', full_name: 'example/NOTEBOOK' },
    checkpointFile: path.join(directory, 'github-sync.json'),
    intercept: null, afterPut: null,
    puts() { return this.calls.filter((call) => call.options.method === 'PUT'); },
    async checkpoint() { return JSON.parse(await readFile(this.checkpointFile, 'utf8')); },
    setRemote(state, sha = `remote-${++this.sequence}`) { this.remote = { sha, text: JSON.stringify(exportNotebook(state), null, 2) }; },
  };
  f.fetch = async (url, options) => {
    f.calls.push({ url, options });
    assert.ok(url === API || url === `${API}/contents/${CONTENT_PATH}` || url.startsWith(`${API}/contents/${CONTENT_PATH}?ref=`));
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.equal(options.headers['X-GitHub-Api-Version'], '2022-11-28');
    assert.ok(options.headers['User-Agent']);
    assert.ok(options.signal instanceof AbortSignal);
    if (f.intercept) {
      const response = await f.intercept(url, options);
      if (response !== undefined) return response;
    }
    if (url === API) return json(f.metadata);
    if (options.method === 'GET') {
      if (!f.remote) return json({ message: 'Absent' }, 404);
      return json({ type: 'file', path: CONTENT_PATH, encoding: 'base64', sha: f.remote.sha, content: Buffer.from(f.remote.text).toString('base64') });
    }
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers['Content-Type'], 'application/json');
    const body = JSON.parse(options.body);
    assert.equal(body.sha ?? null, f.remote?.sha ?? null, 'PUT must compare against the observed base SHA');
    const checkpoint = await f.checkpoint();
    assert.ok(checkpoint.pending?.hash, 'intent must be on disk before PUT');
    assert.equal(checkpoint.pending.baseSha, body.sha ?? null);
    f.remote = { sha: `uploaded-${++f.sequence}`, text: Buffer.from(body.content, 'base64').toString('utf8') };
    if (f.afterPut) await f.afterPut();
    return json({ content: { sha: f.remote.sha, path: CONTENT_PATH } }, 201);
  };
  f.make = async (options = {}) => {
    const adapter = await createGitHubSync({ store, directory, repo: REPO, repoId: REPO_ID, token: TOKEN, fetchImpl: f.fetch, now: () => 1000, ...options });
    adapters.push(adapter);
    return adapter;
  };
  t.after(async () => {
    await Promise.all(adapters.map((adapter) => adapter.stop()));
    await rm(directory, { recursive: true, force: true });
  });
  return f;
}

test('export is strict, detached, consent-free and retains curated lessons, not source excerpts', () => {
  const state = emptyState();
  state.profile.aiConsent = true;
  state.sessions.push(session());
  state.progress['read-kotlin'] = { read: true, attempted: true };
  const before = structuredClone(state);
  const exported = exportNotebook(state);
  assert.equal(exported.format, 'fieldnotes-notebook-v1');
  assert.equal(exported.notebook.profile.aiConsent, false);
  assert.equal(exported.notebook.sessions[0].teaching.example, state.sessions[0].teaching.example);
  assert.equal(exported.notebook.sessions[0].summary, state.sessions[0].summary);
  assert.deepEqual(exported.notebook.progress, state.progress);
  assert.deepEqual(state, before);
  exported.notebook.progress['read-kotlin'].read = false;
  assert.equal(state.progress['read-kotlin'].read, true);
  for (const extra of [{ auth: { token: TOKEN } }, { token: TOKEN }, { sources: [{ text: 'SOURCE EXCERPT' }] }, { unknown: true }]) {
    assert.throws(() => exportNotebook({ ...state, ...extra }), /blocked/);
  }
  assert.throws(() => exportNotebook({ ...state, profile: { ...state.profile, auth: TOKEN } }), /blocked/);
  assert.throws(() => exportNotebook({ ...state, sessions: [session('lesson-one', { text: 'SOURCE EXCERPT' })] }), /blocked/);
  assert.throws(() => exportNotebook({ ...state, sessions: [session('lesson-one', { sourceIds: ['unapproved-source'] })] }), /blocked/);
  assert.throws(() => exportNotebook({ ...state, sessions: [session('lesson-one', { summary: 'password=do-not-publish' })] }), /blocked/);
});

test('session graph rejects duplicate IDs, absent targets, forks, self-links and cycles', () => {
  const cases = [
    [session(), session()],
    [session('lesson-two', { supersedes: 'missing-one' })],
    [session(), session('lesson-two', { supersedes: 'lesson-one' }), session('lesson-three', { supersedes: 'lesson-one' })],
    [session('lesson-one', { supersedes: 'lesson-one' })],
    [session('lesson-one', { supersedes: 'lesson-two' }), session('lesson-two', { supersedes: 'lesson-one' })],
  ];
  for (const sessions of cases) assert.throws(() => exportNotebook({ ...emptyState(), sessions }), /blocked/);
  assert.equal(exportNotebook({ ...emptyState(), sessions: [session('lesson-two', { supersedes: 'lesson-one' }), session()] }).notebook.sessions.length, 2);
});

test('configuration requires immutable positive ID, server token, owner/name and constrained branch', async (t) => {
  const f = await fixture(t);
  for (const options of [
    { repoId: undefined }, { repoId: 0 }, { repoId: -1 }, { repoId: '12345' }, { repoId: 1.5 }, { repoId: Number.MAX_SAFE_INTEGER + 1 },
    { token: '' }, { token: '   ' }, { token: 'bad\nheader' },
    { repo: 'https://elsewhere.test/owner/repo' }, { repo: 'owner/repo/extra' }, { repo: '../repo' },
    { branch: '../main' }, { branch: 'main?ref=other' }, { branch: 'main.lock' }, { branch: 'work//main' }, { branch: 'work/.hidden' },
  ]) await assert.rejects(f.make(options), /blocked/);
  assert.equal(f.calls.length, 0);
});

test('private, immutable, unarchived repository metadata is mandatory before every content request', async (t) => {
  for (const changes of [
    { private: false }, { private: undefined }, { id: REPO_ID + 1 }, { id: String(REPO_ID) }, { archived: true }, { archived: undefined }, { archived: null }, { archived: 'false' },
    { owner: { login: 'transferred-owner' } }, { name: 'renamed' }, { full_name: 'other/notebook' },
  ]) {
    const f = await fixture(t);
    Object.assign(f.metadata, changes);
    const adapter = await f.make();
    assert.equal((await adapter.sync()).state, 'blocked');
    assert.equal(f.calls.length, 1);
    assert.equal(f.puts().length, 0);
  }
});

test('initial upload has durable private intent, safe status and case-insensitive repository verification', async (t) => {
  const f = await fixture(t);
  await f.store.update((state) => { state.profile.aiConsent = true; state.sessions.push(session()); });
  const original = f.store.snapshot();
  const adapter = await f.make({ branch: 'backup/notebook' });
  const result = await adapter.sync();
  assert.deepEqual(result, { configured: true, state: 'synced', lastSyncedAt: 1000, message: 'Notebook is synced to the private repository.', repo: REPO, branch: 'backup/notebook' });
  assert.equal(f.puts().length, 1);
  assert.equal(JSON.parse(f.puts()[0].options.body).branch, 'backup/notebook');
  assert.equal(f.calls[1].url, `${API}/contents/${CONTENT_PATH}?ref=backup%2Fnotebook`);
  assert.equal(JSON.parse(f.remote.text).notebook.profile.aiConsent, false);
  assert.deepEqual(f.store.snapshot(), original);
  const checkpoint = await f.checkpoint();
  assert.equal(checkpoint.repoId, REPO_ID);
  assert.equal(checkpoint.repo, REPO.toLowerCase());
  assert.equal(checkpoint.path, CONTENT_PATH);
  assert.equal(checkpoint.ack.sha, f.remote.sha);
  assert.equal((await stat(f.checkpointFile)).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(checkpoint).includes(TOKEN));
  assert.deepEqual(Object.keys(result).sort(), ['branch', 'configured', 'lastSyncedAt', 'message', 'repo', 'state']);
});

test('restart with unchanged content revalidates metadata and does not PUT again', async (t) => {
  const f = await fixture(t);
  await (await f.make()).sync();
  const restarted = await f.make();
  assert.equal((await restarted.sync()).state, 'synced');
  assert.equal(f.puts().length, 1);
  assert.equal(f.calls.filter((call) => call.url === API).length, 2);
  f.metadata.private = false;
  assert.equal((await restarted.sync()).state, 'blocked');
  assert.equal(f.puts().length, 1);
});

test('canonical hashing ignores object key order and local consent changes', async (t) => {
  const f = await fixture(t);
  await (await f.make()).sync();
  const snapshot = f.store.snapshot();
  const reordered = Object.fromEntries(Object.entries(snapshot).reverse());
  reordered.profile = Object.fromEntries(Object.entries(snapshot.profile).reverse());
  reordered.profile.aiConsent = true;
  const adapter = await f.make({ store: { snapshot: () => structuredClone(reordered) } });
  assert.equal((await adapter.sync()).state, 'synced');
  assert.equal(f.puts().length, 1);
});

test('optional undefined fields remain valid JSON, and non-finite receipt numbers are rejected', () => {
  const state = emptyState();
  state.sessions = [session('lesson-one', { supersedes: undefined })];
  assert.equal(exportNotebook(state).notebook.sessions[0].supersedes, undefined);
  state.receipts.push({
    requestId: '55d38f1d-8bdb-48b5-91e1-0123456789ab', cardId: 'read-kotlin', rating: 'good',
    review: { due: Infinity, interval: 0, reps: 0, fingerprint: '' },
  });
  assert.throws(() => exportNotebook(state), /blocked/);
});

test('without checkpoint only an exactly equal validated remote payload can be acknowledged', async (t) => {
  const equal = await fixture(t);
  equal.setRemote(equal.store.snapshot());
  assert.equal((await (await equal.make()).sync()).state, 'synced');
  assert.equal(equal.puts().length, 0);
  assert.equal((await equal.checkpoint()).ack.sha, equal.remote.sha);

  const different = await fixture(t);
  const state = different.store.snapshot();
  state.progress['read-kotlin'] = { read: true };
  different.setRemote(state);
  const original = different.store.snapshot();
  assert.equal((await (await different.make()).sync()).state, 'conflict');
  assert.equal(different.puts().length, 0);
  assert.deepEqual(different.store.snapshot(), original, 'remote is never restored locally');
});

test('divergent SHA, even for identical content, and missing acknowledged remote are conflicts', async (t) => {
  for (const divergence of ['different', 'same-content-new-sha', 'missing']) {
    const f = await fixture(t);
    const adapter = await f.make();
    await adapter.sync();
    if (divergence === 'missing') f.remote = null;
    else if (divergence === 'same-content-new-sha') f.remote.sha = 'independent-commit';
    else {
      const other = f.store.snapshot(); other.profile.role = 'backend'; f.setRemote(other);
    }
    const original = f.store.snapshot();
    assert.equal((await adapter.sync()).state, 'conflict');
    await adapter.sync();
    assert.equal(f.puts().length, 1);
    assert.deepEqual(f.store.snapshot(), original);
  }
});

test('checkpoint binds repo ID, owner/name, branch and fixed path and fails closed on corruption', async (t) => {
  for (const change of [
    { repoId: REPO_ID + 1 }, { repo: 'other/notebook' }, { branch: 'other' },
    { path: 'other/notebook.json' }, { auth: TOKEN }, { pending: { hash: 'invalid', baseSha: null } },
  ]) {
    const f = await fixture(t);
    await (await f.make()).sync();
    await atomicJson(f.checkpointFile, { ...await f.checkpoint(), ...change });
    f.calls.length = 0;
    const restarted = await f.make();
    assert.equal((await restarted.sync()).state, 'blocked');
    assert.equal(f.calls.length, 0);
  }
  const f = await fixture(t);
  await (await f.make()).sync();
  await chmod(f.checkpointFile, 0o644);
  f.calls.length = 0;
  assert.equal((await (await f.make()).sync()).state, 'blocked');
  assert.equal(f.calls.length, 0);
});

test('local changes during PUT acknowledge only the captured payload and remain pending', async (t) => {
  const f = await fixture(t);
  const before = f.store.snapshot();
  f.afterPut = () => f.store.update((state) => { state.progress['read-kotlin'] = { read: true }; });
  const adapter = await f.make();
  assert.equal((await adapter.sync()).state, 'pending');
  assert.deepEqual(JSON.parse(f.remote.text), exportNotebook(before));
  assert.equal(f.store.snapshot().progress['read-kotlin'].read, true);
  f.afterPut = null;
  assert.equal((await adapter.sync()).state, 'synced');
  assert.equal(f.puts().length, 2);
  await f.store.update((state) => { state.profile.minutes = 45; });
  assert.equal(adapter.status().state, 'pending');
});

test('overlapping sync calls coalesce to one bounded attempt, with snapshot captured before awaits', async (t) => {
  const f = await fixture(t);
  const gate = deferred();
  const entered = deferred();
  f.intercept = async (url) => { if (url === API) { entered.resolve(); await gate.promise; } };
  const adapter = await f.make();
  const first = adapter.sync();
  const overlap = adapter.sync();
  assert.equal(first, overlap);
  await entered.promise;
  await f.store.update((state) => { state.profile.role = 'backend'; });
  gate.resolve();
  assert.equal((await first).state, 'pending');
  assert.equal(f.puts().length, 1);
  assert.equal(f.calls.length, 3);
  assert.equal(JSON.parse(f.remote.text).notebook.profile.role, 'undecided');
});

test('lost PUT response recovers durable intent on restart without another PUT', async (t) => {
  const f = await fixture(t);
  f.afterPut = () => { throw new Error(`Remote secret ${TOKEN}`); };
  const original = f.store.snapshot();
  const first = await f.make();
  assert.equal((await first.sync()).state, 'offline');
  const intent = await f.checkpoint();
  assert.equal(intent.ack, null);
  assert.ok(intent.pending.hash);
  assert.deepEqual(f.store.snapshot(), original);
  assert.ok(!JSON.stringify(first.status()).includes(TOKEN));
  f.afterPut = null;
  const restarted = await f.make();
  assert.equal((await restarted.sync()).state, 'synced');
  assert.equal(f.puts().length, 1);
  assert.equal((await f.checkpoint()).ack.hash, intent.pending.hash);
});

test('ambiguous update recovery acknowledges intent only, leaving newer local edits pending', async (t) => {
  const f = await fixture(t);
  await (await f.make()).sync();
  await f.store.update((state) => { state.profile.role = 'backend'; });
  f.afterPut = () => { throw new Error('Lost response'); };
  assert.equal((await (await f.make()).sync()).state, 'offline');
  const pending = (await f.checkpoint()).pending;
  await f.store.update((state) => { state.profile.minutes = 45; });
  f.afterPut = null;
  const restarted = await f.make();
  assert.equal((await restarted.sync()).state, 'pending');
  assert.equal((await f.checkpoint()).ack.hash, pending.hash);
  assert.equal(f.puts().length, 2);
  assert.equal((await restarted.sync()).state, 'synced');
  assert.equal(f.puts().length, 3);
});

test('a failed uncommitted PUT retries only on a later attempt against its original base', async (t) => {
  const f = await fixture(t);
  f.intercept = (url, options) => { if (options.method === 'PUT') throw new Error('Network unavailable'); };
  const adapter = await f.make();
  assert.equal((await adapter.sync()).state, 'offline');
  assert.equal(f.puts().length, 1);
  assert.equal(f.remote, null);
  f.intercept = null;
  assert.equal((await adapter.sync()).state, 'synced');
  assert.equal(f.puts().length, 2);
});

test('unresolved intent cannot rebase onto an independently changed remote', async (t) => {
  const f = await fixture(t);
  await (await f.make()).sync();
  await f.store.update((state) => { state.profile.role = 'backend'; });
  f.intercept = (url, options) => { if (options.method === 'PUT') throw new Error('Disconnected'); };
  assert.equal((await (await f.make()).sync()).state, 'offline');
  const different = f.store.snapshot(); different.profile.minutes = 45; f.setRemote(different);
  f.intercept = null;
  assert.equal((await (await f.make()).sync()).state, 'conflict');
  assert.equal(f.puts().length, 2);
});

test('post-PUT checkpoint failure fences the instance and retains intent even after rename', async (t) => {
  for (const committed of [false, true]) {
    const f = await fixture(t);
    let writes = 0;
    const adapter = await f.make({ persist: async (file, value) => {
      writes++;
      if (writes === 2) {
        if (committed) await atomicJson(file, value);
        throw Object.assign(new Error(`Checkpoint failure ${TOKEN}`), { committed });
      }
      await atomicJson(file, value);
    } });
    assert.equal((await adapter.sync()).state, 'blocked');
    const durable = await f.checkpoint();
    assert.ok(durable.pending?.hash, 'the original pending intent must remain durable');
    if (!committed) assert.equal(durable.ack, null);
    const count = f.calls.length;
    assert.equal((await adapter.sync()).state, 'blocked');
    assert.equal(f.calls.length, count);
    assert.equal(f.puts().length, 1);
    assert.ok(!JSON.stringify(adapter.status()).includes(TOKEN));
    assert.equal((await (await f.make()).sync()).state, 'synced');
    assert.equal(f.puts().length, 1);
  }
});

test('failed intent persistence prevents PUT and preserves the local notebook', async (t) => {
  const f = await fixture(t);
  const original = f.store.snapshot();
  const adapter = await f.make({ persist: async () => { throw new Error(TOKEN); } });
  assert.equal((await adapter.sync()).state, 'blocked');
  assert.equal(f.puts().length, 0);
  assert.deepEqual(f.store.snapshot(), original);
});

test('PUT conflicts never acknowledge or automatically retry, and malformed PUT success retains intent', async (t) => {
  for (const [code, body, expected] of [
    [409, { message: TOKEN }, 'conflict'], [422, { message: TOKEN }, 'conflict'],
    [200, { content: { path: CONTENT_PATH, sha: '' } }, 'blocked'],
  ]) {
    const f = await fixture(t);
    f.intercept = (url, options) => { if (options.method === 'PUT') return json(body, code); };
    const adapter = await f.make();
    const result = await adapter.sync();
    assert.equal(result.state, expected);
    assert.equal(result.lastSyncedAt, null);
    assert.equal(f.puts().length, 1);
    const checkpoint = await f.checkpoint();
    assert.equal(checkpoint.ack, null);
    assert.ok(checkpoint.pending.hash);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    await adapter.sync();
    assert.equal(f.puts().length, 1);
  }
});

test('stop during intent persistence prevents the subsequent PUT', async (t) => {
  const f = await fixture(t);
  const entered = deferred();
  const release = deferred();
  const adapter = await f.make({ persist: async (file, value) => {
    entered.resolve();
    await release.promise;
    await atomicJson(file, value);
  } });
  const syncing = adapter.sync();
  await entered.promise;
  const stopping = adapter.stop();
  release.resolve();
  assert.equal((await syncing).state, 'offline');
  await stopping;
  assert.equal(f.puts().length, 0);
  assert.ok((await f.checkpoint()).pending.hash);
});

test('payload exceeding 750 KiB is rejected before network or checkpoint writes', async (t) => {
  const f = await fixture(t);
  const oversized = emptyState();
  oversized.reviews['read-kotlin'] = { due: 0, interval: 0, reps: 0, fingerprint: 'x'.repeat(750 * 1024) };
  assert.throws(() => exportNotebook(oversized), /blocked/);
  const adapter = await f.make({ store: { snapshot: () => structuredClone(oversized) } });
  assert.equal((await adapter.sync()).state, 'blocked');
  assert.equal(f.calls.length, 0);
});

test('malformed, noncanonical base64 and invalid remote schemas block rather than appearing absent', async (t) => {
  const base = { type: 'file', path: CONTENT_PATH, encoding: 'base64', sha: 'remote-sha' };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64');
  const valid = exportNotebook(emptyState());
  const consent = structuredClone(valid); consent.notebook.profile.aiConsent = true;
  const graph = structuredClone(valid); graph.notebook.sessions = [session(), session()];
  const unknown = structuredClone(valid); unknown.notebook.auth = TOKEN;
  for (const content of [
    null, [], {}, { ...base, sha: '', content: encode(valid) },
    { ...base, content: '%%%%' }, { ...base, content: 'Zh==' }, { ...base, content: 'e30= ' },
    { ...base, encoding: 'utf8', content: encode(valid) }, { ...base, path: 'other.json', content: encode(valid) },
    { ...base, content: Buffer.from('{broken').toString('base64') },
    { ...base, content: Buffer.from([0xff]).toString('base64') },
    { ...base, content: encode(consent) }, { ...base, content: encode(graph) }, { ...base, content: encode(unknown) },
    { ...base, content: encode({ ...valid, sources: [] }) },
  ]) {
    const f = await fixture(t);
    f.intercept = (url) => { if (url !== API) return json(content); };
    assert.equal((await (await f.make()).sync()).state, 'blocked');
    assert.equal(f.puts().length, 0);
  }
});

test('wrapped valid base64 is accepted but malformed response JSON is blocked', async (t) => {
  const f = await fixture(t);
  f.intercept = (url) => {
    if (url === API) return;
    const content = Buffer.from(JSON.stringify(exportNotebook(f.store.snapshot()))).toString('base64').match(/.{1,60}/g).join('\n');
    return json({ type: 'file', path: CONTENT_PATH, encoding: 'base64', sha: 'wrapped', content });
  };
  assert.equal((await (await f.make()).sync()).state, 'synced');
  assert.equal(f.puts().length, 0);
  f.intercept = () => new Response('{broken');
  assert.equal((await (await f.make()).sync()).state, 'blocked');
});

test('response bound rejects declared or streamed 1.2 MB and cancels excess streams', async (t) => {
  for (const declared of [true, false]) {
    const f = await fixture(t);
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(400_000)); },
      cancel() { cancelled = true; },
    });
    f.intercept = () => new Response(body, { headers: declared ? { 'content-length': '1200000' } : {} });
    assert.equal((await (await f.make()).sync()).state, 'blocked');
    assert.equal(cancelled, true);
    assert.equal(f.puts().length, 0);
  }
});

test('HTTP failures are classified without reading or exposing remote error bodies', async (t) => {
  for (const [code, expected] of [[401, 'blocked'], [403, 'blocked'], [409, 'conflict'], [422, 'conflict'], [500, 'offline'], [503, 'offline'], [302, 'blocked'], [404, 'blocked']]) {
    const f = await fixture(t);
    f.intercept = () => new Response(TOKEN, { status: code });
    const result = await (await f.make()).sync();
    assert.equal(result.state, expected);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    assert.equal(f.puts().length, 0);
  }
});

test('network failure never mutates local notebook and exposes no raw error', async (t) => {
  const f = await fixture(t);
  await f.store.update((state) => { state.progress['read-kotlin'] = { attempted: true }; });
  const original = f.store.snapshot();
  const originalFile = await readFile(path.join(f.directory, 'notebook.json'), 'utf8');
  f.intercept = () => { throw new Error(`https://bad.example/${TOKEN}`); };
  const adapter = await f.make();
  assert.equal((await adapter.sync()).state, 'offline');
  assert.deepEqual(f.store.snapshot(), original);
  assert.equal(await readFile(path.join(f.directory, 'notebook.json'), 'utf8'), originalFile);
  assert.ok(!JSON.stringify(adapter.status()).includes(TOKEN));
  assert.equal(f.puts().length, 0);
});

test('rate limits retry automatically while genuine permission denials stay fenced', async (t) => {
  for (const [code, headers] of [[403, { 'x-ratelimit-remaining': '0', 'retry-after': '180' }], [429, { 'retry-after': '180' }]]) {
    const f = await fixture(t);
    f.intercept = () => new Response('not exposed', { status: code, headers });
    const adapter = await f.make();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    try {
      adapter.start();
      assert.equal((await adapter.sync()).state, 'offline');
      f.intercept = null;
      t.mock.timers.tick(179999);
      assert.equal(f.calls.length, 1);
      t.mock.timers.tick(1);
      assert.equal((await adapter.sync()).state, 'synced');
      assert.equal(f.puts().length, 1);
    } finally { await adapter.stop(); t.mock.timers.reset(); }
  }
});

test('invalid and duplicate review receipts are rejected; historical valid receipts are retained', () => {
  const entry = { requestId: '55d38f1d-8bdb-48b5-91e1-0123456789ab', cardId: 'read-kotlin', rating: 'good', review: { due: 10, interval: 1, reps: 1, fingerprint: 'old-source' } };
  for (const review of [{ due: -1 }, { interval: -1 }, { reps: -1 }, { reps: 1.5 }]) {
    assert.throws(() => exportNotebook({ ...emptyState(), receipts: [{ ...entry, review: { ...entry.review, ...review } }] }));
  }
  assert.throws(() => exportNotebook({ ...emptyState(), receipts: [entry, entry] }));
  assert.equal(exportNotebook({ ...emptyState(), receipts: [entry] }).notebook.receipts.length, 1);
});

test('stop aborts an in-flight attempt and start is idempotent', async (t) => {
  const f = await fixture(t);
  const entered = deferred();
  let signal;
  f.intercept = (url, options) => {
    signal = options.signal;
    entered.resolve();
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
  };
  const adapter = await f.make();
  adapter.start(); adapter.start();
  await entered.promise;
  await adapter.stop();
  assert.equal(signal.aborted, true);
  assert.equal(adapter.status().state, 'offline');
  assert.equal(f.calls.length, 1);
  assert.equal(f.puts().length, 0);
});

test('15-second deadline bounds both fetch and response body waits', async (t) => {
  for (const phase of ['fetch', 'body']) {
    const f = await fixture(t);
    const entered = deferred();
    let cancelled = false;
    f.intercept = () => {
      if (phase === 'fetch') { entered.resolve(); return new Promise(() => {}); }
      return new Response(new ReadableStream({
        // Resolve only when the response reader requests data, not just on fetch entry.
        pull() { entered.resolve(); },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 }));
    };
    const adapter = await f.make();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const active = adapter.sync();
      await entered.promise;
      t.mock.timers.tick(15_000);
      assert.equal((await active).state, 'offline');
      assert.equal(f.calls[0].options.signal.aborted, true);
      if (phase === 'body') assert.equal(cancelled, true);
      assert.equal(f.puts().length, 0);
    } finally { await adapter.stop(); t.mock.timers.reset(); }
  }
});

test('background backoff is bounded at 15 minutes and stop clears the scheduled retry', async (t) => {
  const f = await fixture(t);
  f.intercept = () => { throw new Error('Offline'); };
  const adapter = await f.make({ intervalMs: 60_000 });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    adapter.start();
    await adapter.sync();
    assert.equal(f.calls.length, 1);
    for (const delay of [120_000, 240_000, 480_000, 900_000, 900_000]) {
      const count = f.calls.length;
      t.mock.timers.tick(delay - 1);
      assert.equal(f.calls.length, count);
      t.mock.timers.tick(1);
      await adapter.sync();
      assert.equal(f.calls.length, count + 1);
    }
    await adapter.stop();
    const count = f.calls.length;
    t.mock.timers.tick(900_000);
    assert.equal(f.calls.length, count);
  } finally { await adapter.stop(); t.mock.timers.reset(); }
});