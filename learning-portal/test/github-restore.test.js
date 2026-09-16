import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, lstat, symlink, open, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { restoreGitHub } from '../scripts/restore-github.js';
import { exportNotebook } from '../server/github-sync.js';
import { profileDefault } from '../server/schema.js';
import { sourceIds } from '../server/catalog.js';
import { acquireOwnership } from '../server/ownership.js';
import { atomicJson } from '../server/store.js';

const REPO = 'Example/Notebook';
const REPO_ID = 12345;
const TOKEN = 'server-only-fixture-token';
const API = 'https://api.github.com/repos/Example/Notebook';
const PAYLOAD_LIMIT = 750 * 1024;
const RESPONSE_LIMIT = 1_200_000;
const json = (value, options) => new Response(JSON.stringify(value), options);
const metadata = () => ({ id: REPO_ID, private: true, archived: false, owner: { login: 'example' }, name: 'NOTEBOOK', full_name: 'example/NOTEBOOK' });
const state = () => ({ version: 1, profile: { ...profileDefault }, reviews: {}, progress: {}, receipts: [], sessions: [] });
const session = (id = 'lesson-one', extra = {}) => ({
  id, title: 'Curated lesson', date: '2026-09-16T12:00:00.000Z', status: 'complete',
  summary: 'One owner serializes writes.', why: 'Avoid conflicting state.', changes: ['Added a queue.'],
  concepts: ['Ownership'], exercise: 'Explain a retry.',
  evidence: [{ label: 'Queue test', state: 'reported', reference: 'Recorded test result.' }],
  sourceIds: [sourceIds[0]], ...extra,
});
const content = (bytes = Buffer.from(JSON.stringify(exportNotebook(state())))) => ({
  type: 'file', path: 'fieldnotes/notebook.json', encoding: 'base64', sha: 'remote-sha-1', content: bytes.toString('base64'),
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-restore-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = {
    root, destination: path.join(root, 'recovered'), calls: [], metadata: metadata(), content: content(), intercept: null,
  };
  f.fetchImpl = async (url, options) => {
    f.calls.push({ url, options });
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.equal(options.headers['X-GitHub-Api-Version'], '2022-11-28');
    assert.ok(options.headers['User-Agent']);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body, undefined);
    assert.equal((await lstat(f.destination)).mode & 0o777, 0o700, 'reservation precedes networking');
    assert.equal(await readFile(path.join(f.destination, 'owner.lock'), 'utf8'), String(process.pid), 'ownership precedes networking');
    assert.equal((await lstat(path.join(f.destination, 'owner.lock'))).mode & 0o777, 0o600);
    if (f.intercept) {
      const response = await f.intercept(url, options);
      if (response !== undefined) return response;
    }
    if (url === API) return json(f.metadata);
    assert.equal(url, `${API}/contents/fieldnotes/notebook.json?ref=backup%2Fnotebook`);
    return json(f.content);
  };
  f.restore = (options = {}, dependencies = {}) => restoreGitHub({
    repo: REPO, repoId: REPO_ID, branch: 'backup/notebook', destination: f.destination,
    token: TOKEN, fetchImpl: f.fetchImpl, ...options,
  }, dependencies);
  f.empty = async () => assert.deepEqual(await readdir(f.destination), []);
  return f;
}

async function rejectsSafe(promise, code, reserved) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, 'RestoreError');
    assert.equal(error.code, code);
    assert.equal(error.reserved, reserved);
    assert.equal(error.cause, undefined);
    assert.ok(!String(error.stack).includes(TOKEN));
    assert.ok(!JSON.stringify(error).includes(TOKEN));
    if (reserved) assert.match(error.message, /reserved destination is retained/);
    return true;
  });
}

test('import exposes reusable recovery without invoking the CLI', async () => {
  const module = await import('../scripts/restore-github.js');
  assert.deepEqual(Object.keys(module), ['restoreGitHub']);
  assert.equal(module.restoreGitHub, restoreGitHub);
});

test('valid restore preserves exact state, private modes and counts, without checkpoint or secrets', async (t) => {
  const f = await fixture(t);
  const notebook = state();
  notebook.sessions = [session('lesson-two', { supersedes: 'lesson-one' }), session()];
  notebook.progress['read-kotlin'] = { read: true, attempted: true };
  notebook.reviews['read-kotlin'] = { due: 1000, interval: 100, reps: 2, fingerprint: 'fixture' };
  notebook.receipts = [{ requestId: '55d38f1d-8bdb-48b5-91e1-0123456789ab', cardId: 'read-kotlin', rating: 'good', review: { ...notebook.reviews['read-kotlin'] } }];
  const envelope = exportNotebook(notebook);
  // Key order and GitHub line wrapping are not meaningful changes to JSON state.
  f.content = content(Buffer.from(JSON.stringify({ notebook: envelope.notebook, format: envelope.format }, null, 2)));
  f.content.content = f.content.content.match(/.{1,60}/g).join('\r\n') + '\n';
  const result = await f.restore();
  assert.deepEqual(result, { status: 'restored', sessions: 2, reviews: 1, progress: 1, receipts: 1 });
  const restored = await readFile(path.join(f.destination, 'notebook.json'), 'utf8');
  assert.deepEqual(JSON.parse(restored), notebook);
  assert.equal(JSON.parse(restored).profile.aiConsent, false);
  assert.deepEqual(await readdir(f.destination), ['notebook.json']);
  assert.equal((await lstat(f.destination)).mode & 0o777, 0o700);
  assert.equal((await lstat(path.join(f.destination, 'notebook.json'))).mode & 0o777, 0o600);
  assert.ok(!restored.includes(TOKEN));
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.equal(f.calls.length, 2);
});

test('existing empty, active, file and symlink destinations refuse before networking and stay untouched', async (t) => {
  for (const kind of ['empty', 'active', 'file', 'symlink', 'dangling-symlink']) {
    const f = await fixture(t);
    const existing = path.join(f.root, 'active');
    await mkdir(existing);
    await writeFile(path.join(existing, 'notebook.json'), 'keep-active-notebook');
    if (kind === 'empty' || kind === 'active') {
      await mkdir(f.destination);
      if (kind === 'active') await writeFile(path.join(f.destination, 'notebook.json'), 'keep-destination-notebook');
    } else if (kind === 'file') await writeFile(f.destination, 'keep-file');
    else await symlink(kind === 'symlink' ? existing : path.join(f.root, 'absent'), f.destination);
    await rejectsSafe(f.restore(), 'destination', false);
    assert.equal(f.calls.length, 0);
    assert.equal(await readFile(path.join(existing, 'notebook.json'), 'utf8'), 'keep-active-notebook');
    if (kind === 'active') assert.equal(await readFile(path.join(f.destination, 'notebook.json'), 'utf8'), 'keep-destination-notebook');
    if (kind === 'file') assert.equal(await readFile(f.destination, 'utf8'), 'keep-file');
    if (kind === 'empty') await f.empty();
    if (kind.includes('symlink')) assert.ok((await lstat(f.destination)).isSymbolicLink());
  }
});

test('configuration fails closed without reserving or making network requests', async (t) => {
  const f = await fixture(t);
  for (const options of [
    { repoId: undefined }, { repoId: '12345' }, { repoId: 0 }, { repoId: -1 }, { repoId: 1.5 }, { repoId: Number.MAX_SAFE_INTEGER + 1 },
    { repo: undefined }, { repo: 'owner/repo/extra' }, { repo: '../repo' }, { repo: 'https://other.test/repo' },
    { branch: undefined }, { branch: '' }, { branch: '../main' }, { branch: 'main?ref=other' },
    { branch: 'main.lock' }, { branch: 'work//main' }, { branch: 'work/.hidden' }, { branch: 'work/trailing.' },
    { token: undefined }, { token: '' }, { token: ' ' }, { token: 'bad\nheader' }, { token: 'non-ascii-☃' },
    { destination: 'relative/path' }, { destination: '/invalid\0path' }, { fetchImpl: null },
  ]) await rejectsSafe(f.restore(options), 'configuration', false);
  assert.equal(f.calls.length, 0);
  await assert.rejects(lstat(f.destination), { code: 'ENOENT' });
  await rejectsSafe(f.restore({ destination: path.join(f.root, 'missing-parent', 'child') }), 'destination', false);
  await assert.rejects(lstat(path.join(f.root, 'missing-parent')), { code: 'ENOENT' });
});

test('public, transferred, renamed, archived and wrong-ID repositories cannot reach contents', async (t) => {
  for (const patch of [
    { private: false }, { private: undefined }, { id: REPO_ID + 1 }, { id: String(REPO_ID) },
    { archived: true }, { archived: undefined }, { owner: { login: 'other' } }, { owner: null },
    { name: 'renamed' }, { full_name: 'other/notebook' },
  ]) {
    const f = await fixture(t);
    Object.assign(f.metadata, patch);
    await rejectsSafe(f.restore(), 'blocked', true);
    assert.equal(f.calls.length, 1);
    await f.empty();
  }
});

test('strict envelope, allowlists, consent and unchanged validation reject invalid notebooks', async (t) => {
  const mutations = [
    (e) => { e.format = 'other'; }, (e) => { e.unknown = true; },
    (e) => { delete e.notebook; }, (e) => { e.notebook.profile.aiConsent = true; },
    (e) => { delete e.notebook.profile.aiConsent; }, (e) => { e.notebook.unknown = true; },
    (e) => { e.notebook.profile.auth = TOKEN; }, (e) => { e.notebook.sessions = [session('lesson-one', { unknown: true })]; },
    (e) => { e.notebook.sessions = [session('lesson-one', { sourceIds: ['unapproved-source'] })]; },
    (e) => { e.notebook.sessions = [session('lesson-one', { summary: 'password=private-material' })]; },
    (e) => { e.notebook.sessions = [session('lesson-one', { title: ' Silently trimmed ' })]; },
    (e) => { e.notebook.sessions = [session(), session()]; },
    (e) => { e.notebook.sessions = [session('lesson-two', { supersedes: 'missing-target' })]; },
    (e) => { e.notebook.sessions = [session('lesson-one', { supersedes: 'lesson-one' })]; },
    (e) => { e.notebook.sessions = [session('lesson-one', { supersedes: 'lesson-two' }), session('lesson-two', { supersedes: 'lesson-one' })]; },
    (e) => { e.notebook.sessions = [session(), session('lesson-two', { supersedes: 'lesson-one' }), session('lesson-three', { supersedes: 'lesson-one' })]; },
  ];
  for (const mutate of mutations) {
    const f = await fixture(t);
    const envelope = exportNotebook(state());
    mutate(envelope);
    f.content = content(Buffer.from(JSON.stringify(envelope)));
    await rejectsSafe(f.restore(), 'blocked', true);
    await f.empty();
  }
});

test('malformed JSON, UTF-8, base64 and content metadata are rejected', async (t) => {
  for (const invalid of [
    content(Buffer.from('{')), content(Buffer.from([0xc3, 0x28])), content(Buffer.from('null')),
    content(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(exportNotebook(state())))])),
    { ...content(), content: 'Zh==' }, { ...content(), content: 'e30' }, { ...content(), content: 'e30= ' },
    { ...content(), content: 'e30=\r' }, { ...content(), content: '____' }, { ...content(), content: '' },
    { ...content(), encoding: 'utf8' }, { ...content(), type: 'symlink' }, { ...content(), path: 'elsewhere.json' },
    { ...content(), sha: '' }, { ...content(), sha: TOKEN + '\n' }, { ...content(), content: null },
  ]) {
    const f = await fixture(t);
    f.content = invalid;
    await rejectsSafe(f.restore(), 'blocked', true);
    await f.empty();
  }
});

test('payload byte limit accepts exactly 750 KiB and rejects one byte more', async (t) => {
  const text = JSON.stringify(exportNotebook(state()));
  for (const size of [PAYLOAD_LIMIT, PAYLOAD_LIMIT + 1]) {
    const f = await fixture(t);
    f.content = content(Buffer.from(text + ' '.repeat(size - Buffer.byteLength(text))));
    if (size === PAYLOAD_LIMIT) assert.equal((await f.restore()).status, 'restored');
    else { await rejectsSafe(f.restore(), 'blocked', true); await f.empty(); }
  }
});

test('redirects, status errors, malformed response JSON/UTF-8 and response sizes fail closed', async (t) => {
  const responses = [
    () => json({}, { status: 302, headers: { Location: 'https://elsewhere.test/' } }),
    () => { const response = json(metadata()); Object.defineProperty(response, 'redirected', { value: true }); return response; },
    ...[401, 403, 404, 500].map((status) => () => json({ message: TOKEN }, { status })),
    () => new Response('{'), () => new Response(Buffer.from([0xc3, 0x28])),
    () => json(metadata(), { headers: { 'content-length': String(RESPONSE_LIMIT) } }),
    () => json(metadata(), { headers: { 'content-length': 'invalid' } }),
    () => new Response(Buffer.alloc(RESPONSE_LIMIT)),
    () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(Buffer.alloc(600_000)); controller.enqueue(Buffer.alloc(600_000)); controller.close();
    } }), { headers: { 'content-length': '1' } }),
  ];
  for (const atContent of [false, true]) {
    for (const response of responses) {
      const f = await fixture(t);
      f.intercept = (url) => (url !== API) === atContent ? response() : undefined;
      await rejectsSafe(f.restore(), 'blocked', true);
      assert.equal(f.calls.length, atContent ? 2 : 1);
      await f.empty();
    }
  }
});

test('network failure retains reservation, never overwrites local work and exposes no raw errors', async (t) => {
  for (const failAtContent of [false, true]) {
    const f = await fixture(t);
    const active = path.join(f.root, 'notebook.json');
    await writeFile(active, 'active local progress');
    f.intercept = (url) => { if ((url !== API) === failAtContent) throw new Error(`raw remote error ${TOKEN}`); };
    await rejectsSafe(f.restore(), 'network', true);
    await f.empty();
    assert.equal(await readFile(active, 'utf8'), 'active local progress');
    const calls = f.calls.length;
    await rejectsSafe(f.restore(), 'destination', false);
    assert.equal(f.calls.length, calls, 'a failed reservation cannot be silently retried');
  }
});

test('a file introduced into the reservation is preserved rather than overwritten', async (t) => {
  const f = await fixture(t);
  f.intercept = async (url) => {
    if (url !== API) await writeFile(path.join(f.destination, 'notebook.json'), 'concurrent local work');
  };
  await rejectsSafe(f.restore(), 'storage', true);
  assert.equal(await readFile(path.join(f.destination, 'notebook.json'), 'utf8'), 'concurrent local work');
});

test('atomic reservation permits only one concurrent recovery for a destination', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.restore(), f.restore()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'destination');
  assert.equal(rejected.reason.reserved, false);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.destination, 'notebook.json'), 'utf8')), state());
});

test('startup cannot acquire ownership after final validation until persistence and parent durability complete', async (t) => {
  const f = await fixture(t);
  const validated = deferred();
  const persistGate = deferred();
  const syncingParent = deferred();
  const syncGate = deferred();
  const closingParent = deferred();
  const closeGate = deferred();
  let completed = false;
  const pending = f.restore({}, {
    async persist(file, notebook) {
      // This dependency is entered immediately after recovery's final directory validation.
      validated.resolve();
      await persistGate.promise;
      await atomicJson(file, notebook);
    },
    async openDirectory(directory, flags) {
      assert.equal(directory, f.root);
      assert.equal(flags, 'r');
      const parent = await open(directory, flags);
      return {
        async sync() { syncingParent.resolve(); await syncGate.promise; await parent.sync(); },
        async close() { closingParent.resolve(); await closeGate.promise; await parent.close(); },
      };
    },
  });
  // Wake boundary waits on unexpected early failure, so the assertions report it instead of hanging.
  void pending.then(() => { completed = true; }, () => {
    completed = true; validated.resolve(); syncingParent.resolve(); closingParent.resolve();
  });
  const startupIsExcluded = async () => {
    assert.equal(completed, false);
    assert.deepEqual(await readFile(path.join(f.destination, 'owner.lock'), 'utf8'), String(process.pid));
    await assert.rejects(acquireOwnership(f.destination), { name: 'OwnershipError', code: 'locked' });
  };
  try {
    await validated.promise;
    await startupIsExcluded();
    await assert.rejects(lstat(path.join(f.destination, 'notebook.json')), { code: 'ENOENT' });
    persistGate.resolve();
    await syncingParent.promise;
    await startupIsExcluded();
    assert.deepEqual(JSON.parse(await readFile(path.join(f.destination, 'notebook.json'), 'utf8')), state());
    syncGate.resolve();
    await closingParent.promise;
    await startupIsExcluded();
    closeGate.resolve();
    assert.equal((await pending).status, 'restored');
    const release = await acquireOwnership(f.destination);
    await release();
  } finally {
    persistGate.resolve(); syncGate.resolve(); closeGate.resolve();
    await pending.catch(() => {});
  }
});

test('parent open, fsync and close failures never report success and always retain the reservation', async (t) => {
  for (const failure of ['open', 'sync', 'close']) {
    const f = await fixture(t);
    let closed = false;
    let synced = false;
    await rejectsSafe(f.restore({}, {
      async openDirectory(directory, flags) {
        assert.equal(directory, f.root);
        assert.equal(flags, 'r');
        if (failure === 'open') throw new Error(TOKEN);
        const parent = await open(directory, flags);
        return {
          async sync() {
            await assert.rejects(acquireOwnership(f.destination), { code: 'locked' });
            if (failure === 'sync') throw new Error(TOKEN);
            await parent.sync(); synced = true;
          },
          async close() {
            await parent.close(); closed = true;
            if (failure === 'close') throw new Error(TOKEN);
          },
        };
      },
    }), 'storage', true);
    assert.equal(closed, failure !== 'open', 'opened parent is closed even when fsync fails');
    assert.equal(synced, failure === 'close');
    assert.deepEqual(await readdir(f.destination), ['notebook.json']);
    assert.deepEqual(JSON.parse(await readFile(path.join(f.destination, 'notebook.json'), 'utf8')), state());
    await rejectsSafe(f.restore(), 'destination', false);
    const release = await acquireOwnership(f.destination);
    await release();
  }
});

test('persistence failure before or after commit is sanitized, releases ownership and never reuses the destination', async (t) => {
  for (const committed of [false, true]) {
    const f = await fixture(t);
    let parentOpened = false;
    await rejectsSafe(f.restore({}, {
      async persist(file, notebook) {
        await assert.rejects(acquireOwnership(f.destination), { code: 'locked' });
        if (committed) await atomicJson(file, notebook);
        throw new Error(TOKEN);
      },
      async openDirectory() { parentOpened = true; throw new Error(TOKEN); },
    }), 'storage', true);
    assert.equal(parentOpened, false);
    assert.deepEqual(await readdir(f.destination), committed ? ['notebook.json'] : []);
    await rejectsSafe(f.restore(), 'destination', false);
    const release = await acquireOwnership(f.destination);
    await release();
  }
});

test('real ownership and atomicJson fsync failures never produce successful recovery', async (t) => {
  // Production sync order: owner.lock, notebook temporary file, destination directory.
  for (const failAt of [1, 2, 3]) {
    const f = await fixture(t);
    const probe = await open(path.join(f.root, 'probe'), 'wx', 0o600);
    const prototype = Object.getPrototypeOf(probe);
    const originalSync = prototype.sync;
    await probe.close();
    let calls = 0;
    const sync = t.mock.method(prototype, 'sync', async function () {
      calls += 1;
      if (calls === failAt) throw new Error(TOKEN);
      await originalSync.call(this);
    });
    try {
      await rejectsSafe(f.restore(), 'storage', true);
      assert.equal(calls, failAt);
      assert.equal(f.calls.length, failAt === 1 ? 0 : 2);
      assert.deepEqual(await readdir(f.destination), failAt === 1 ? ['owner.lock'] : failAt === 2 ? [] : ['notebook.json']);
      await rejectsSafe(f.restore(), 'destination', false);
    } finally { sync.mock.restore(); }
    if (failAt === 1) {
      await assert.rejects(acquireOwnership(f.destination), { code: 'locked' });
      assert.equal(await readFile(path.join(f.destination, 'owner.lock'), 'utf8'), String(process.pid));
    } else {
      const release = await acquireOwnership(f.destination);
      await release();
    }
  }
});

test('replacement owner.lock is not accepted by final validation or deleted during cleanup', async (t) => {
  const f = await fixture(t);
  f.intercept = async (url) => {
    if (url !== API) {
      await rename(path.join(f.destination, 'owner.lock'), path.join(f.root, 'original.lock'));
      await writeFile(path.join(f.destination, 'owner.lock'), 'replacement-owner');
    }
  };
  await rejectsSafe(f.restore(), 'storage', true);
  assert.deepEqual(await readdir(f.destination), ['owner.lock']);
  assert.equal(await readFile(path.join(f.destination, 'owner.lock'), 'utf8'), 'replacement-owner');
});

test('release failure overrides completion or network failure with a sanitized storage error', async (t) => {
  for (const duringNetwork of [false, true]) {
    const f = await fixture(t);
    const replaceLock = async () => {
      await rename(path.join(f.destination, 'owner.lock'), path.join(f.root, 'original.lock'));
      await writeFile(path.join(f.destination, 'owner.lock'), TOKEN);
    };
    if (duringNetwork) f.intercept = async () => { await replaceLock(); throw new Error(TOKEN); };
    await rejectsSafe(f.restore({}, {
      async persist(file, notebook) { await atomicJson(file, notebook); await replaceLock(); },
    }), 'storage', true);
    assert.equal(await readFile(path.join(f.destination, 'owner.lock'), 'utf8'), TOKEN);
    assert.deepEqual((await readdir(f.destination)).sort(), duringNetwork ? ['owner.lock'] : ['notebook.json', 'owner.lock']);
  }
});

test('15-second deadline rejects a fetch ignoring abort; its late response cannot write', async (t) => {
  const f = await fixture(t);
  const entered = deferred();
  const gate = deferred();
  let signal;
  f.intercept = (_url, options) => { signal = options.signal; entered.resolve(); return gate.promise; };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = f.restore();
  const rejected = rejectsSafe(pending, 'timeout', true);
  await entered.promise;
  t.mock.timers.tick(15_000);
  await rejected;
  assert.equal(signal.aborted, true);
  gate.resolve(json(metadata()));
  await f.empty();
  assert.equal(f.calls.length, 1);
});

test('metadata and stalled body share one deadline, and timeout cancels the reader', async (t) => {
  const f = await fixture(t);
  const entered = deferred();
  let cancelled = false;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  f.intercept = (url) => {
    if (url === API) { t.mock.timers.tick(10_000); return undefined; }
    return new Response(new ReadableStream({
      pull() { entered.resolve(); return new Promise(() => {}); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 }));
  };
  const rejected = rejectsSafe(f.restore(), 'timeout', true);
  await entered.promise;
  t.mock.timers.tick(5_000);
  await rejected;
  assert.equal(cancelled, true);
  assert.equal(f.calls.length, 2);
  await f.empty();
});