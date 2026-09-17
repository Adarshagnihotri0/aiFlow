import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import jsQR from 'jsqr';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { createInbox, sessionLesson } from '../server/sessions.js';
import { profileDefault, validateSession } from '../server/schema.js';
import { sourceIds } from '../server/catalog.js';

const recap = { id: 'first-session', title: 'A recorded change', date: '2026-09-16T00:00:00.000Z', status: 'incomplete', summary: 'The agent introduced a route boundary.', why: 'The recorded reason was to separate UI coordination from persistence.', changes: ['Added a separate owner.'], concepts: ['Ownership'], exercise: 'Draw the responsibilities and identify a test.', sourceIds: ['hopper-contracts'], evidence: [{ label: 'Behaviour test', state: 'not-run', reference: 'No runtime result recorded.' }] };

async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-api-'));
  await mkdir(path.join(dir, 'hopper'), { recursive: true });
  await writeFile(path.join(dir, 'hopper/AGENTS.md'), 'Routes coordinate state. Repositories own data consistency.');
  const store = await createStore(path.join(dir, 'data'));
  const app = createApp({ store, roots: { hopper: path.join(dir, 'hopper'), proxy: path.join(dir, 'proxy') }, publicDirectory: path.join(dir, 'public'), publicOrigin: 'https://notebook.example', localAuthority: '127.0.0.1:3210', ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  let cookie = '';
  async function call(route, { method = 'GET', body, remote = false, auth = true, headers = {} } = {}) {
    // Node fetch rewrites Host. Use http.request to exercise the real host boundary.
    const response = await new Promise((resolve, reject) => {
      const request = http.request(`http://127.0.0.1:${server.address().port}${route}`, {
        method, headers: { Host: remote ? 'notebook.example' : '127.0.0.1:3210', ...(auth && cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', Origin: remote ? 'https://notebook.example' : 'http://127.0.0.1:3210' } : {}), ...headers },
      }, (incoming) => {
        const chunks = []; incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () => resolve({ status: incoming.statusCode, headers: new Headers(Object.entries(incoming.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])), json: async () => incoming.headers['content-type']?.includes('application/json') ? JSON.parse(Buffer.concat(chunks).toString()) : Buffer.concat(chunks).toString() }));
      });
      request.on('error', reject); request.end(body === undefined ? undefined : JSON.stringify(body));
    });
    const set = response.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { dir, store, call };
}
test('external links may open only the public shell, never cross-site APIs, frames or writes', async (t) => {
  const { dir, store, call } = await fixture(t);
  await mkdir(path.join(dir, 'public'));
  await writeFile(path.join(dir, 'public/index.html'), '<!doctype html><title>Fieldnotes</title>');
  const navigation = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  for (const route of ['/', '/index.html']) {
    const result = await call(route, { remote: true, auth: false, headers: navigation });
    assert.equal(result.status, 200);
    assert.match(result.body, /<title>Fieldnotes<\/title>/);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.equal(result.headers.get('x-frame-options'), 'DENY');
  }
  await call('/api/bootstrap'); // Even an authenticated browser cannot bypass the boundary.
  const before = store.snapshot();
  for (const route of ['/api/bootstrap', '/api/github', '/api/source/hopper-contracts', '/health', '/app.js']) {
    assert.equal((await call(route, { remote: true, headers: navigation })).status, 403, route);
  }
  for (const headers of [
    { ...navigation, 'Sec-Fetch-Dest': 'iframe' },
    { ...navigation, 'Sec-Fetch-Mode': 'cors' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { ...navigation, Host: 'evil.example' },
  ]) assert.equal((await call('/', { remote: true, headers })).status, 403);
  for (const route of ['/', '/api/login', '/api/pair', '/api/logout', '/api/progress', '/api/chat']) {
    assert.equal((await call(route, { remote: true, method: 'POST', body: {}, headers: navigation })).status, 403, route);
  }
  assert.equal((await call('/api/profile', { remote: true, method: 'PUT', body: profileDefault, headers: navigation })).status, 403);
  assert.deepEqual(store.snapshot(), before);
  assert.equal((await call('/api/bootstrap', { remote: true, auth: false })).status, 401);
});
test('private data requires pairing remotely; local bootstrap grants only direct loopback', async (t) => {
  const { call } = await fixture(t);
  assert.equal((await call('/api/bootstrap', { remote: true, auth: false })).status, 401);
  assert.equal((await call('/api/bootstrap', { headers: { 'x-forwarded-for': '1.2.3.4' }, auth: false })).status, 401);
  assert.equal((await call('/api/bootstrap', { headers: { Host: 'evil.example' }, auth: false })).status, 403);
  assert.equal((await call('/api/bootstrap', { headers: { 'Sec-Fetch-Site': 'cross-site' }, auth: false })).status, 403);
  const result = await call('/api/bootstrap');
  assert.equal(result.status, 200); assert.equal(result.body.local, true);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await call('/api/source/not-allowed')).status, 404);
});
test('QR encodes only the approved public origin and a fragment code; replacement and exact expiry are enforced', async (t) => {
  let clock = Date.now();
  const { call, store } = await fixture(t, { now: () => clock });
  await call('/api/bootstrap');
  const first = await call('/api/pair', { method: 'POST', body: {} });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const { size, data } = first.body.qr;
  const width = (size + 8) * 5;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / 5) - 4; const col = Math.floor(x / 5) - 4;
    if (row >= 0 && row < size && col >= 0 && col < size && data[row * size + col]) {
      const offset = (y * width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  // Independently decode pixels, not just compare the encoder's own matrix.
  const decoded = jsQR(pixels, width, width);
  assert.equal(decoded?.data, `https://notebook.example/#pair=${first.body.code}`);
  assert.match(first.body.code, /^[A-Za-z0-9_-]{12}$/);
  assert.equal(new URL(decoded.data).search, '');
  assert.equal(first.body.expiresAt, clock + 300000);
  assert.equal((await call('/api/pair', { method: 'POST', body: {}, remote: true })).status, 403);
  assert.equal((await call('/api/pair', { method: 'POST', body: {}, headers: { 'cf-connecting-ip': '127.0.0.1' } })).status, 403);
  const second = await call('/api/pair', { method: 'POST', body: {} });
  assert.notEqual(second.body.code, first.body.code);
  assert.equal((await call('/api/login', { method: 'POST', body: { code: first.body.code }, remote: true })).status, 401);
  clock = second.body.expiresAt;
  assert.equal((await call('/api/login', { method: 'POST', body: { code: second.body.code }, remote: true })).status, 401);
  assert.equal(store.snapshot().profile.aiConsent, false);
});

test('pairing without a public origin offers a code but no misleading QR', async (t) => {
  const { call } = await fixture(t, { publicOrigin: '' });
  await call('/api/bootstrap');
  const result = await call('/api/pair', { method: 'POST', body: {} });
  assert.equal(result.status, 200);
  assert.equal(result.body.qr, null);
});

test('pairing expires, is single use, cannot be generated remotely and logout revokes cookie', async (t) => {
  let clock = Date.now(); const { call } = await fixture(t, { now: () => clock });
  await call('/api/bootstrap');
  const first = await call('/api/pair', { method: 'POST', body: {} });
  clock += 300001;
  assert.equal((await call('/api/login', { remote: true, method: 'POST', body: { code: first.body.code } })).status, 401);
  const second = await call('/api/pair', { method: 'POST', body: {} });
  const login = await call('/api/login', { remote: true, method: 'POST', body: { code: second.body.code } });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /Secure/);
  assert.equal((await call('/api/login', { remote: true, method: 'POST', body: { code: second.body.code } })).status, 401);
  assert.equal((await call('/api/pair', { remote: true, method: 'POST', body: {} })).status, 403);
  await call('/api/logout', { remote: true, method: 'POST', body: {} });
  assert.equal((await call('/api/bootstrap', { remote: true })).status, 401);
});
test('CSRF and invalid profile requests do not mutate progress', async (t) => {
  const { call, store } = await fixture(t); await call('/api/bootstrap');
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, minutes: -1 } })).status, 400);
  assert.equal((await call('/api/profile', { method: 'PUT', body: profileDefault, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.deepEqual(store.snapshot().profile, profileDefault);
});

test('GitHub status is authenticated only and never part of public health', async (t) => {
  const value = { configured: true, state: 'synced', repo: 'Example/Private', branch: 'main', lastSyncedAt: 100, message: 'Saved' };
  const { call } = await fixture(t, { github: { status: () => value } });
  assert.equal((await call('/api/github', { remote: true, auth: false })).status, 401);
  assert.ok(!JSON.stringify((await call('/health', { remote: true, auth: false })).body).includes('Private'));
  assert.deepEqual((await call('/api/bootstrap')).body.github, value);
  assert.deepEqual((await call('/api/github')).body, value);
});

test('focused presentation is optional, validated, and never implies AI consent', async (t) => {
  const { call, store } = await fixture(t);
  await call('/api/bootstrap');
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, learningStyle: 'focused' } })).status, 200);
  assert.equal(store.snapshot().profile.learningStyle, 'focused');
  assert.equal(store.snapshot().profile.aiConsent, false);
  assert.equal((await call('/api/chat', { method: 'POST', body: { question: 'Explain ownership', mode: 'teach' } })).status, 403);
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, learningStyle: 'diagnosis' } })).status, 400);
});
test('two clients cannot restore withdrawn consent by saving a captured stale settings body', async (t) => {
  let providerCalls = 0;
  const { call, store, dir } = await fixture(t, { fetchImpl: async () => { providerCalls++; throw new Error('No provider call is permitted.'); } });
  const first = await call('/api/bootstrap', { auth: false });
  const clientA = { Cookie: first.headers.get('set-cookie').split(';')[0] };
  assert.equal((await call('/api/profile', { method: 'PUT', headers: clientA, body: { ...first.body.profile, aiConsent: true, expectedAiConsent: false } })).status, 200);
  const oldProfile = (await call('/api/bootstrap', { headers: clientA })).body.profile;
  assert.equal(oldProfile.aiConsent, true);
  const staleSettingsBody = { ...oldProfile, learningStyle: 'focused', expectedAiConsent: oldProfile.aiConsent };

  const second = await call('/api/bootstrap', { auth: false });
  const clientB = { Cookie: second.headers.get('set-cookie').split(';')[0] };
  assert.notEqual(clientA.Cookie, clientB.Cookie);
  assert.equal((await call('/api/profile', { method: 'PUT', headers: clientB, body: { ...second.body.profile, aiConsent: false, expectedAiConsent: true } })).status, 200);
  const withdrawn = store.snapshot().profile;
  assert.equal(withdrawn.aiConsent, false);

  const staleSave = await call('/api/profile', { method: 'PUT', headers: clientA, body: staleSettingsBody });
  assert.equal(staleSave.status, 409);
  assert.match(staleSave.body.error, /Preferences were not saved/);
  assert.deepEqual(store.snapshot().profile, withdrawn);
  assert.deepEqual((await call('/api/bootstrap', { headers: clientA })).body.profile, withdrawn);
  // A legacy client with no expected snapshot must not restore consent either.
  assert.equal((await call('/api/profile', { method: 'PUT', headers: clientA, body: { ...oldProfile, learningStyle: 'focused' } })).status, 409);
  assert.deepEqual(store.snapshot().profile, withdrawn);
  assert.equal((await call('/api/chat', { method: 'POST', headers: clientA, body: { question: 'Explain ownership', mode: 'teach' } })).status, 403);
  assert.equal(providerCalls, 0);

  // Keeping the preference draft and explicitly unchecking consent is safe even
  // with the original expected=true snapshot. No automatic enable or partial save.
  assert.equal((await call('/api/profile', { method: 'PUT', headers: clientA, body: { ...staleSettingsBody, aiConsent: false } })).status, 200);
  const focused = { ...withdrawn, learningStyle: 'focused' };
  assert.deepEqual(store.snapshot().profile, focused);
  assert.deepEqual((await call('/api/bootstrap', { headers: clientB })).body.profile, focused);
  assert.deepEqual((await createStore(path.join(dir, 'data'))).snapshot().profile, focused);
});

test('enabling requires an explicit false snapshot; valid withdrawals never require a matching snapshot', async (t) => {
  const { call, store } = await fixture(t);
  await call('/api/bootstrap');
  for (const expected of [{}, { expectedAiConsent: true }]) {
    assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, ...expected } })).status, 409);
    assert.deepEqual(store.snapshot().profile, profileDefault);
  }
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: 'false' } })).status, 400);
  for (const expected of [{}, { expectedAiConsent: false }, { expectedAiConsent: true }]) {
    assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } })).status, 200);
    assert.deepEqual(store.snapshot().profile, { ...profileDefault, aiConsent: true });
    assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, learningStyle: 'focused', aiConsent: true, expectedAiConsent: true } })).status, 200);
    assert.deepEqual(store.snapshot().profile, { ...profileDefault, learningStyle: 'focused', aiConsent: true });
    assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, ...expected } })).status, 200);
    assert.deepEqual(store.snapshot().profile, profileDefault);
    assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, ...expected } })).status, 200);
    assert.deepEqual((await call('/api/bootstrap')).body.profile, profileDefault);
  }
});

test('focused live chat request uses literal presentation instructions without diagnosis assumptions (mock provider only)', async (t) => {
  const requests = [];
  const { call, store } = await fixture(t, { fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Mock source-assisted explanation [S1].' } }] }));
  } });
  await call('/api/bootstrap');
  const profile = { ...profileDefault, learningStyle: 'focused', aiConsent: true };
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profile, expectedAiConsent: false } })).status, 200);
  const result = await call('/api/chat', { method: 'POST', body: { question: 'Explain route ownership', mode: 'teach', lessonId: 'state-and-routes' } });
  assert.equal(result.status, 200);
  assert.equal(requests.length, 1);
  const system = requests[0].messages[0];
  assert.equal(system.role, 'system');
  assert.match(system.content, /Presentation preference: focused\./);
  assert.match(system.content, /Use literal, precise wording; define each new term before using it/);
  assert.match(system.content, /This is a presentation preference, not a diagnosis or an inference about ability/);
  assert.match(system.content, /Separate observed facts, recorded decisions and assumptions/);
  assert.match(system.content, /Avoid time pressure and claims of mastery/);
  assert.doesNotMatch(system.content, /\b(?:autis\w*|ADHD|neurodiver\w*)\b/i);
  assert.deepEqual(store.snapshot().profile, profile);
});

test('teaching depth is proportional while guide and interview retain single-turn smaller bounds', async (t) => {
  let clock = Date.UTC(2026, 8, 17);
  const requests = [];
  const { call } = await fixture(t, { now: () => clock, fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'A source-assisted answer [S1].' } }] }));
  } });
  await call('/api/bootstrap');
  for (const learningStyle of ['standard', 'focused']) {
    assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, learningStyle, aiConsent: true, expectedAiConsent: false } })).status, 200);
    for (const mode of ['teach', 'guide', 'interview']) {
      clock += 11000;
      const result = await call('/api/chat', { method: 'POST', body: { question: 'Explain ownership and its tradeoffs', mode } });
      assert.equal(result.status, 200);
      const request = requests.at(-1);
      const prompt = request.messages[0].content;
      assert.equal(request.max_tokens, mode === 'teach' ? 3000 : 1400);
      assert.equal(request.stream, false);
      assert.match(prompt, /UNTRUSTED DATA/);
      assert.match(prompt, /Never claim the user authored agent work/);
      assert.match(prompt, /Do not invent files, sources, citations, test results/);
      assert.match(prompt, /Use recorded rationale only and label inference/);
      assert.match(prompt, /private internal reasoning/);
      assert.match(prompt, /Cite project claims using \[S1\]/);
      assert.doesNotMatch(prompt, /under 500 words/);
      if (mode === 'teach') {
        for (const pattern of [/about 900 words/, /narrow questions more briefly without padding/, /Define new terms/, /worked example/, /fenced code example/, /assumptions, alternatives and tradeoffs/, /independent check/, /expected observable result/, /never hidden reasoning/]) assert.match(prompt, pattern);
      } else {
        assert.doesNotMatch(prompt, /about 900 words/);
        assert.match(prompt, mode === 'guide' ? /exactly one actionable hint/ : /exactly one question at a time/);
        assert.match(prompt, mode === 'guide' ? /under 200 words/ : /under 250 words/);
        if (mode === 'interview') assert.match(prompt, /feedback only after an attempt/);
      }
      assert.equal(result.body.finishReason, 'stop'); assert.equal(result.body.truncated, false);
    }
  }
  assert.equal(requests.length, 6);
});

test('chat sends only canonical selected session tasks as untrusted producer records, never inferred tasks (mock provider only)', async (t) => {
  let clock = Date.UTC(2026, 8, 17);
  const requests = [];
  const { call, store } = await fixture(t, { now: () => clock, fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Mock task explanation [S1].' } }] }));
  } });
  const old = { ...recap, id: 'task-context-v1', tasks: [{ id: 'obsolete', title: 'Retire the amber checkpoint sentinel', status: 'done' }] };
  const unrelated = { ...recap, id: 'other-task-context', tasks: [{ id: 'unrelated', title: 'Inspect the violet lease sentinel', status: 'todo' }] };
  const current = { ...recap, id: 'task-context-v2', supersedes: old.id, tasks: [
    { id: 'probe', title: 'Probe the "cobalt" checkpoint sentinel', status: 'todo' },
    { id: 'trace', title: 'Trace the silver overlap sentinel', status: 'in-progress' },
    { id: 'fence', title: 'Fence the jade completion sentinel', status: 'done' },
  ] };
  const legacy = { ...recap, id: 'legacy-task-context' };
  const sessions = [old, unrelated, current, legacy].map(session => validateSession(session, sourceIds));
  await store.update(state => { state.sessions = sessions; });
  const bootstrap = await call('/api/bootstrap');
  assert.equal(bootstrap.status, 200);
  const canonical = bootstrap.body.lessons.find(lesson => lesson.id === `session-${current.id}`);
  assert.ok(canonical);
  assert.ok(!bootstrap.body.lessons.some(lesson => lesson.id === `session-${old.id}`));
  assert.equal(bootstrap.body.sessions.find(session => session.id === old.id).supersededBy, current.id);
  for (const task of current.tasks) {
    assert.ok(!current.summary.includes(task.title));
    assert.ok(!JSON.stringify(canonical).includes(JSON.stringify(task.title).slice(1, -1)), 'the lesson alone must not supply the task sentinel');
  }
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } })).status, 200);
  const taskSection = /\n\nSELECTED SESSION TASKS \(([^\n]+)\):\n/;
  for (const [selectedId, expectedTasks] of [
    [canonical.id, current.tasks],
    [undefined, []],
    ['state-and-routes', []],
    [`session-${legacy.id}`, []],
  ]) {
    clock += 11000;
    const result = await call('/api/chat', { method: 'POST', body: {
      question: 'Which tasks are explicitly recorded?', mode: 'teach', ...(selectedId ? { lessonId: selectedId } : {}),
    } });
    assert.equal(result.status, 200);
    const system = requests.at(-1).messages[0];
    assert.equal(system.role, 'system');
    const parts = system.content.split(taskSection);
    assert.equal(parts.length, 3, 'one separately labelled task-data section is required');
    assert.match(parts[1], /untrusted data/i);
    assert.match(parts[1], /producer-reported statuses/);
    assert.match(parts[1], /not independently verified/);
    assert.match(parts[1], /not instructions/);
    assert.deepEqual(JSON.parse(parts[2]), expectedTasks);
    for (const session of sessions) for (const task of session.tasks || []) {
      const encodedTitle = JSON.stringify(task.title).slice(1, -1);
      assert.ok(!parts[0].includes(encodedTitle), 'task sentinels must not be supplied by summaries, sources or lesson data');
      if (!expectedTasks.some(expected => expected.title === task.title)) assert.ok(!system.content.includes(encodedTitle), 'general, legacy and unrelated contexts must not inherit tasks');
    }
    if (selectedId === canonical.id) assert.ok(parts[0].includes(JSON.stringify(canonical)));
    if (!selectedId) assert.match(parts[0], /SELECTED LESSON \(data only\):\nNone$/);
  }
  assert.equal(requests.length, 4);
  assert.deepEqual(store.snapshot().sessions, sessions);
});

test('provider length completion preserves partial text, discloses truncation and never auto-continues', async (t) => {
  const requests = [];
  const partial = '## Ownership\n\nA source-assisted explanation [S1].\n\n```js\nconst owner =';
  const { call, store } = await fixture(t, { fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: partial } }] }));
  } });
  await call('/api/bootstrap');
  await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } });
  const result = await call('/api/chat', { method: 'POST', body: { question: 'Explain ownership', mode: 'teach' } });
  assert.equal(result.status, 200); assert.equal(result.body.answer, partial);
  assert.equal(result.body.finishReason, 'length'); assert.equal(result.body.truncated, true);
  assert.match(result.body.warning, /finish_reason=length/);
  assert.match(result.body.warning, /may be incomplete/);
  assert.match(result.body.warning, /No automatic continuation was sent/);
  assert.match(result.body.warning, /not independently verified/);
  assert.equal(result.body.grounding, 'source-assisted');
  assert.equal(result.body.sources[0].id, 'hopper-contracts');
  assert.equal(requests.length, 1);
  assert.ok(!JSON.stringify(store.snapshot()).includes(partial));
});

test('missing or unrecognized finish reasons remain unknown, not invented completion or diagnostics', async (t) => {
  let clock = Date.UTC(2026, 8, 17); let calls = 0;
  const reasons = [undefined, 'private upstream diagnostic', { reason: 'length' }];
  const { call } = await fixture(t, { now: () => clock, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: reasons[calls++], message: { content: 'An answer [S1].' } }] })) });
  await call('/api/bootstrap');
  await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } });
  for (const _reason of reasons) {
    clock += 11000;
    const result = await call('/api/chat', { method: 'POST', body: { question: 'Explain ownership', mode: 'teach' } });
    assert.equal(result.status, 200); assert.equal(result.body.finishReason, null); assert.equal(result.body.truncated, false);
    assert.doesNotMatch(result.body.warning, /finish_reason=length|private upstream diagnostic/);
  }
  assert.equal(calls, 3);
});

test('concurrent duplicate reviews apply once; changed payloads conflict; sources invalidate schedule', async (t) => {
  const { call, store, dir } = await fixture(t); await call('/api/bootstrap');
  const body = { cardId: 'contracts-and-tests', rating: 'good', requestId: randomUUID() };
  const responses = await Promise.all([call('/api/review', { method: 'POST', body }), call('/api/review', { method: 'POST', body })]);
  assert.ok(responses.every((result) => result.status === 200));
  assert.deepEqual(responses[0].body, responses[1].body);
  assert.equal(store.snapshot().reviews[body.cardId].reps, 1);
  assert.equal((await call('/api/review', { method: 'POST', body: { ...body, rating: 'easy' } })).status, 409);
  await writeFile(path.join(dir, 'hopper/AGENTS.md'), 'Updated contract.');
  assert.equal((await call('/api/bootstrap')).body.reviews[body.cardId].due, 0);
});
test('chat is consent-gated, source-assisted, bounded, redacted and not persisted', async (t) => {
  const requests = [];
  const { call, store } = await fixture(t, { fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'A route coordinates UI state [S1].' } }] }));
  } });
  await call('/api/bootstrap');
  const body = { question: 'Explain route ownership', mode: 'teach', lessonId: 'state-and-routes', history: [] };
  assert.equal((await call('/api/chat', { method: 'POST', body })).status, 403); assert.equal(requests.length, 0);
  await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } });
  assert.equal((await call('/api/chat', { method: 'POST', body: { ...body, question: 'password=supersecret' } })).status, 400);
  const result = await call('/api/chat', { method: 'POST', body });
  assert.equal(result.status, 200); assert.equal(result.body.grounding, 'source-assisted');
  assert.equal(result.body.sources[0].id, 'hopper-contracts');
  assert.match(requests[0].messages[0].content, /UNTRUSTED DATA/);
  assert.ok(!JSON.stringify(store.snapshot()).includes('Explain route ownership'));
  assert.equal((await call('/api/chat', { method: 'POST', body })).status, 429);
});
test('provider errors are sanitized and capacity is released without retry', async (t) => {
  let clock = Date.now(); let calls = 0;
  const { call } = await fixture(t, { now: () => clock, fetchImpl: async () => { calls++; return new Response('secret upstream diagnostic', { status: 500 }); } });
  await call('/api/bootstrap'); await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } });
  const body = { question: 'Explain a contract', mode: 'teach' };
  const result = await call('/api/chat', { method: 'POST', body }); assert.equal(result.status, 502);
  assert.ok(!JSON.stringify(result.body).includes('secret')); assert.equal(calls, 1);
  clock += 11000; await call('/api/chat', { method: 'POST', body }); assert.equal(calls, 2);
});
test('timeout aborts the tutor and reports uncertainty', async (t) => {
  const { call } = await fixture(t, { requestTimeout: 20, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))) });
  await call('/api/bootstrap'); await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } });
  const result = await call('/api/chat', { method: 'POST', body: { question: 'Explain a contract', mode: 'teach' } });
  assert.equal(result.status, 504); assert.match(result.body.error, /may still finish/);
});
test('curated inbox preserves producer evidence and rejects replay conflicts or sensitive content', async (t) => {
  const { dir, store } = await fixture(t); const inboxPath = path.join(dir, 'inbox'); await mkdir(inboxPath);
  const inbox = createInbox(store, inboxPath);
  await writeFile(path.join(inboxPath, 'first-session.json'), JSON.stringify(recap));
  assert.equal((await inbox.scan()).imported, 1); await inbox.scan(); assert.equal(store.snapshot().sessions.length, 1);
  await writeFile(path.join(inboxPath, 'first-session.json'), JSON.stringify({ ...recap, summary: 'Conflicting rewrite.' }));
  assert.equal((await inbox.scan()).rejected, 1); assert.equal(store.snapshot().sessions[0].summary, recap.summary);
  assert.throws(() => validateSession({ ...recap, summary: 'password=supersecret' }, sourceIds));
  assert.throws(() => validateSession({ ...recap, sourceIds: ['unknown-source'] }, sourceIds));
  assert.match(sessionLesson(recap).sections.at(-1).body, /NOT-RUN/);
});

test('chat accepts exactly 2000 question characters and rejects 2001 without consuming provider capacity', async (t) => {
  const requests = [];
  const { call } = await fixture(t, { now: () => Date.UTC(2026, 8, 16), fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'A contract describes expected behaviour [S1].' } }] }));
  } });
  await call('/api/bootstrap');
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } })).status, 200);
  const body = { question: 'q'.repeat(2000), mode: 'teach', history: [] };
  assert.equal((await call('/api/chat', { method: 'POST', body: { ...body, question: `${body.question}q` } })).status, 400);
  assert.equal(requests.length, 0);
  assert.equal((await call('/api/chat', { method: 'POST', body })).status, 200);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].messages.at(-1), { role: 'user', content: body.question });
});

test('64-character session IDs remain distinct lesson and progress IDs while 65-character IDs are rejected', async (t) => {
  const prefix = 's'.repeat(63);
  const first = { ...recap, id: `${prefix}a` };
  const second = { ...recap, id: `${prefix}b`, title: 'A different recorded change' };
  for (const session of [first, second]) {
    assert.equal(session.id.length, 64);
    assert.equal(validateSession(session, sourceIds).id, session.id);
  }
  assert.throws(() => validateSession({ ...first, id: `${first.id}a` }, sourceIds));
  assert.equal(validateSession({ ...second, supersedes: first.id }, sourceIds).supersedes, first.id);
  assert.throws(() => validateSession({ ...second, supersedes: `${first.id}a` }, sourceIds));
  assert.equal(sessionLesson(first).id, `session-${first.id}`);
  assert.equal(sessionLesson(second).id, `session-${second.id}`);
  assert.notEqual(sessionLesson(first).id, sessionLesson(second).id);

  const { dir, store, call } = await fixture(t);
  const inboxPath = path.join(dir, 'inbox'); await mkdir(inboxPath);
  const inbox = createInbox(store, inboxPath);
  for (const session of [first, second]) await writeFile(path.join(inboxPath, `${session.id}.json`), JSON.stringify(session));
  const scan = await inbox.scan();
  assert.equal(scan.imported, 2); assert.equal(scan.rejected, 0);
  const bootstrap = await call('/api/bootstrap');
  assert.equal(bootstrap.status, 200);
  const imported = bootstrap.body.lessons.filter((lesson) => lesson.id.startsWith('session-'));
  assert.deepEqual(imported.map((lesson) => lesson.id), [`session-${first.id}`, `session-${second.id}`]);
  assert.equal((await call('/api/progress', { method: 'POST', body: { lessonId: imported[0].id, step: 'read' } })).status, 200);
  assert.equal((await call('/api/progress', { method: 'POST', body: { lessonId: imported[1].id, step: 'attempted' } })).status, 200);
  assert.deepEqual(store.snapshot().progress, { [imported[0].id]: { read: true }, [imported[1].id]: { attempted: true } });
});

test('session recall answers include actual evidence and status with or without supplied teaching', () => {
  const evidence = [
    { label: 'Ownership review', state: 'reported', reference: 'Review notes record a repository boundary.' },
    { label: 'Duplicate request check', state: 'verified', reference: 'Two attempts produced one stored entry.' },
    { label: 'Offline recovery check', state: 'failed', reference: 'The offline retry still lost the pending operation.' },
    { label: 'Device lifecycle check', state: 'not-run', reference: 'No device was available for recreation testing.' },
  ];
  const teaching = { plainExplanation: 'Give each operation one owner.', example: 'A route delegates saving to a repository.', checkQuestion: 'Who owns the saved data?', checkAnswer: 'The repository owns persisted data consistency.' };
  for (const status of ['complete', 'incomplete']) {
    for (const supplied of [undefined, teaching]) {
      const session = { ...recap, status, evidence, ...(supplied ? { teaching: supplied } : {}) };
      const answer = sessionLesson(session).answer;
      assert.ok(answer.includes(supplied ? supplied.checkAnswer : session.summary));
      assert.ok(answer.includes(session.why));
      assert.ok(answer.includes(`Status: ${status}.`));
      for (const item of evidence) assert.ok(answer.includes(`${item.state}: ${item.label} — ${item.reference}`));
      assert.match(answer, /not independent certification/);
    }
  }
});

test('linked immutable session imports replace active lessons but retain the complete supersededBy history', async (t) => {
  const { dir, store, call } = await fixture(t);
  const inboxPath = path.join(dir, 'inbox'); await mkdir(inboxPath);
  const inbox = createInbox(store, inboxPath);
  const replacement = { ...recap, id: 'second-session', supersedes: recap.id, status: 'complete', summary: 'The recorded boundary now has a passing check.' };
  const latest = { ...replacement, id: 'third-session', supersedes: replacement.id, summary: 'A later session records a lifecycle limitation.' };
  const chain = [recap, replacement, latest];
  for (let index = 0; index < chain.length; index++) {
    const session = chain[index];
    await writeFile(path.join(inboxPath, `${session.id}.json`), JSON.stringify(session));
    const scan = await inbox.scan();
    assert.equal(scan.imported, 1); assert.equal(scan.rejected, 0);
    const bootstrap = await call('/api/bootstrap');
    assert.equal(bootstrap.status, 200);
    assert.deepEqual(bootstrap.body.lessons.filter((lesson) => lesson.id.startsWith('session-')).map((lesson) => lesson.id), [`session-${session.id}`]);
    assert.deepEqual(bootstrap.body.sessions, chain.slice(0, index + 1).map((entry, historyIndex) => ({ ...entry, supersededBy: historyIndex < index ? chain[historyIndex + 1].id : null })));
    // Supersession is an append, never a rewrite of an accepted producer record.
    assert.deepEqual(store.snapshot().sessions, chain.slice(0, index + 1));
  }
  assert.equal((await inbox.scan()).imported, 0);
  assert.deepEqual((await createStore(path.join(dir, 'data'))).snapshot().sessions, chain);
  assert.equal((await call('/api/progress', { method: 'POST', body: { lessonId: `session-${recap.id}`, step: 'read' } })).status, 404);
  assert.equal((await call('/api/progress', { method: 'POST', body: { lessonId: `session-${latest.id}`, step: 'read' } })).status, 200);
});

test('session imports reject supersession branches, unknown references and rewrites without changing history', async (t) => {
  const { dir, store, call } = await fixture(t);
  const inboxPath = path.join(dir, 'inbox'); await mkdir(inboxPath);
  const inbox = createInbox(store, inboxPath);
  const replacement = { ...recap, id: 'replacement-session', supersedes: recap.id };
  for (const session of [recap, replacement]) {
    await writeFile(path.join(inboxPath, `${session.id}.json`), JSON.stringify(session));
    assert.equal((await inbox.scan()).imported, 1);
  }
  const before = store.snapshot();
  const history = (await call('/api/bootstrap')).body.sessions;
  for (const invalid of [
    { ...recap, id: 'branch-session', supersedes: recap.id },
    { ...recap, id: 'unknown-session', supersedes: 'never-imported' },
    { ...recap, summary: 'An attempted rewrite of immutable history.' },
  ]) {
    const file = path.join(inboxPath, `${invalid.id}.json`);
    await writeFile(file, JSON.stringify(invalid));
    const scan = await inbox.scan();
    assert.equal(scan.imported, 0); assert.equal(scan.rejected, 1);
    assert.deepEqual(store.snapshot(), before);
    const bootstrap = await call('/api/bootstrap');
    assert.equal(bootstrap.status, 200);
    assert.deepEqual(bootstrap.body.sessions, history);
    assert.deepEqual(bootstrap.body.lessons.filter((lesson) => lesson.id.startsWith('session-')).map((lesson) => lesson.id), [`session-${replacement.id}`]);
    await rm(file);
  }
  assert.deepEqual((await createStore(path.join(dir, 'data'))).snapshot(), before);
});

test('overlapping chat requests past the cooldown admit only one provider call and return 429 to the other', async (t) => {
  let clock = Date.UTC(2026, 8, 16); let providerCalls = 0;
  let enterProvider; let releaseProvider;
  const entered = new Promise((resolve) => { enterProvider = resolve; });
  const released = new Promise((resolve) => { releaseProvider = resolve; });
  const { call } = await fixture(t, { now: () => clock, fetchImpl: async () => {
    providerCalls++;
    // Only the first invocation waits. A broken capacity guard must fail an
    // assertion rather than deadlock a second invocation behind the same gate.
    if (providerCalls === 1) { enterProvider(); await released; }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Routes coordinate state [S1].' } }] }));
  } });
  await call('/api/bootstrap');
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } })).status, 200);
  const body = { question: 'Explain route ownership', mode: 'teach' };
  const first = call('/api/chat', { method: 'POST', body });
  try {
    await Promise.race([entered, first.then((response) => { assert.fail(`The first request finished before reaching the provider gate (${response.status}).`); })]);
    assert.equal(providerCalls, 1);
    // Make the second request rate-limit eligible while the first is still
    // unresolved; its rejection must come from in-flight capacity, not timing.
    clock += 11000;
    const second = call('/api/chat', { method: 'POST', body: { ...body, question: 'Explain repository ownership' } }).finally(() => releaseProvider());
    const [accepted, rejected] = await Promise.all([first, second]);
    assert.equal(accepted.status, 200);
    assert.equal(rejected.status, 429);
    assert.equal(providerCalls, 1);
  } finally {
    releaseProvider();
    await first.catch(() => {});
  }
});

test('missing sources return 503 and release chat capacity so repairing a source permits the next eligible request', async (t) => {
  let clock = Date.UTC(2026, 8, 16);
  const requests = [];
  const { dir, call } = await fixture(t, { now: () => clock, fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'The repaired source describes route ownership [S1].' } }] }));
  } });
  await call('/api/bootstrap');
  assert.equal((await call('/api/profile', { method: 'PUT', body: { ...profileDefault, aiConsent: true, expectedAiConsent: false } })).status, 200);
  const source = path.join(dir, 'hopper/AGENTS.md');
  await rm(source);
  const body = { question: 'Explain route ownership', mode: 'teach', lessonId: 'state-and-routes' };
  const unavailable = await call('/api/chat', { method: 'POST', body });
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.body.error, /sources are unavailable/);
  assert.equal(requests.length, 0);

  const repaired = 'Repaired source: routes coordinate state; repositories own durable data.';
  await writeFile(source, repaired);
  clock += 11000;
  const recovered = await call('/api/chat', { method: 'POST', body });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.grounding, 'source-assisted');
  assert.deepEqual(recovered.body.sources.map((entry) => entry.id), ['hopper-contracts']);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].messages[0].content.includes(repaired));
});