import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { atomicJson } from './store.js';
import { stateSchema, validateSession } from './schema.js';
import { sourceIds } from './catalog.js';

const API = 'https://api.github.com';
const CONTENT_PATH = 'fieldnotes/notebook.json';
const FORMAT = 'fieldnotes-notebook-v1';
const PAYLOAD_LIMIT = 750 * 1024;
const RESPONSE_LIMIT = 1_200_000; // Strictly less than 1.2 MB, including streamed bodies.
const CHECKPOINT_LIMIT = 16 * 1024;
const TIMEOUT = 15_000;
const MAX_BACKOFF = 15 * 60_000;
const MISSING = Symbol('missing content');
const messages = Object.freeze({
  pending: 'Notebook changes are waiting to sync.',
  synced: 'Notebook is synced to the private repository.',
  offline: 'GitHub sync is unavailable; local work is preserved.',
  blocked: 'GitHub sync is blocked. Check configuration, permissions and checkpoint storage before restarting.',
  conflict: 'Remote notebook changed independently. Sync stopped; local work is preserved.',
});

class SyncFault extends Error {
  constructor(state) { super(messages[state]); this.state = state; }
}
const fail = (state = 'blocked') => { throw new SyncFault(state); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const shaSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const checkpointSchema = z.object({
  version: z.literal(1), repoId: z.number().int().positive().safe(),
  repo: z.string(), branch: z.string(), path: z.literal(CONTENT_PATH),
  ack: z.object({ hash: hashSchema, sha: shaSchema, at: z.number().finite().nonnegative() }).strict().nullable(),
  pending: z.object({ hash: hashSchema, baseSha: shaSchema.nullable() }).strict().nullable(),
}).strict();

// Sort object keys recursively; array order is part of the notebook contract.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) fail();
  return JSON.stringify(value);
}

function validateGraph(sessions) {
  const byId = new Map();
  const replaced = new Set();
  for (const session of sessions) {
    if (byId.has(session.id)) fail();
    byId.set(session.id, session);
  }
  for (const session of sessions) {
    if (!session.supersedes) continue;
    if (!byId.has(session.supersedes) || replaced.has(session.supersedes)) fail();
    replaced.add(session.supersedes);
    const seen = new Set([session.id]);
    let cursor = session.supersedes;
    while (cursor) {
      if (seen.has(cursor)) fail();
      seen.add(cursor);
      cursor = byId.get(cursor)?.supersedes;
    }
  }
}

/** Strict allowlist: progress and curated sessions, never source excerpts or auth.
 * Consent is local-only. This function never mutates the supplied state.
 */
export function exportNotebook(state) {
  try {
    const notebook = stateSchema.parse(state);
    notebook.sessions = notebook.sessions.map((session) => validateSession(session, sourceIds));
    validateGraph(notebook.sessions);
    notebook.profile.aiConsent = false;
    const result = { format: FORMAT, notebook };
    if (Buffer.byteLength(canonical(result)) > PAYLOAD_LIMIT) fail();
    return result;
  } catch { fail(); }
}

function payload(state) {
  const text = canonical(exportNotebook(state));
  return { text, hash: createHash('sha256').update(text).digest('hex') };
}

function decodeContent(value) {
  if (!isObject(value) || value.type !== 'file' || value.path !== CONTENT_PATH ||
      value.encoding !== 'base64' || !shaSchema.safeParse(value.sha).success || typeof value.content !== 'string') fail();
  // GitHub wraps base64 with newlines. No other whitespace or noncanonical padding is accepted.
  const encoded = value.content.replace(/\r?\n/g, '');
  if (encoded.length > Math.ceil(PAYLOAD_LIMIT / 3) * 4 || encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail();
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > PAYLOAD_LIMIT || bytes.toString('base64') !== encoded) fail();
  try {
    const object = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!isObject(object) || Object.keys(object).length !== 2 || object.format !== FORMAT ||
        object.notebook?.profile?.aiConsent !== false) fail();
    const valid = exportNotebook(object.notebook);
    // Validation must not silently trim, strip or change remote content before acknowledgement.
    const text = canonical(valid);
    if (canonical(object) !== text) fail();
    return { sha: value.sha, hash: createHash('sha256').update(text).digest('hex') };
  } catch { fail(); }
}

function validBranch(branch) {
  return typeof branch === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) &&
    !branch.includes('..') && branch.split('/').every((part) => part && !part.startsWith('.') &&
      !part.endsWith('.') && !part.endsWith('.lock'));
}

async function loadCheckpoint(file) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > CHECKPOINT_LIMIT) fail();
    const buffer = Buffer.alloc(CHECKPOINT_LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > CHECKPOINT_LIMIT) fail();
    return checkpointSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))));
  } catch (error) {
    if (!handle && error.code === 'ENOENT') return null;
    fail();
  } finally { if (handle) await handle.close(); }
}

/** One adapter instance owns one checkpoint. Parent must not run multiple process writers.
 * No restore, browser credentials, service startup or store.update calls live here.
 */
export async function createGitHubSync({
  store, directory, repo, branch = 'main', token, fetchImpl = fetch,
  now = Date.now, persist = atomicJson, intervalMs = 60_000, repoId,
}) {
  if (!store || typeof store.snapshot !== 'function' || typeof directory !== 'string' || !directory ||
      typeof repo !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repo) ||
      !validBranch(branch) || !Number.isSafeInteger(repoId) || repoId <= 0 ||
      typeof token !== 'string' || !token.trim() || !/^[\x21-\x7e]+$/.test(token) ||
      typeof fetchImpl !== 'function' || typeof persist !== 'function' || typeof now !== 'function' ||
      !Number.isFinite(intervalMs) || intervalMs < 1) fail();

  const binding = { version: 1, repoId, repo: repo.toLowerCase(), branch, path: CONTENT_PATH };
  const checkpointFile = path.join(directory, 'github-sync.json');
  const repoURL = `${API}/repos/${repo.split('/').map(encodeURIComponent).join('/')}`;
  const contentURL = `${repoURL}/contents/${CONTENT_PATH}`;
  let checkpoint = { ...binding, ack: null, pending: null };
  let state = 'pending';
  let fenced = false;
  let active = null;
  let controller = null;
  let timer = null;
  let running = false;
  let generation = 0;
  let failures = 0;
  let retryAfterMs = 0;

  try {
    const loaded = await loadCheckpoint(checkpointFile);
    if (loaded) {
      if (Object.keys(binding).some((key) => loaded[key] !== binding[key]) ||
          (loaded.pending && loaded.pending.baseSha !== (loaded.ack?.sha ?? null) &&
           loaded.pending.hash !== loaded.ack?.hash)) fail();
      checkpoint = loaded;
    }
  } catch { state = 'blocked'; fenced = true; }

  function status() {
    if (state === 'synced') {
      try { if (payload(store.snapshot()).hash !== checkpoint.ack?.hash) state = 'pending'; }
      catch { state = 'blocked'; fenced = true; }
    }
    return { configured: true, state, lastSyncedAt: checkpoint.ack?.at ?? null, message: messages[state], repo, branch };
  }

  async function request(url, options, signal, allowMissing = false) {
    const deadline = new AbortController();
    const combined = AbortSignal.any([signal, deadline.signal]);
    const timeout = setTimeout(() => deadline.abort(), TIMEOUT);
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new SyncFault('offline'));
      if (combined.aborted) onAbort();
      else combined.addEventListener('abort', onAbort, { once: true });
    });
    const work = async () => {
      if (combined.aborted) fail('offline');
      const response = await fetchImpl(url, {
        ...options, redirect: 'error', signal: combined,
        headers: {
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'fieldnotes-learning-portal', Authorization: `Bearer ${token}`,
          ...(options.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      const discard = () => { try { response.body?.cancel().catch(() => {}); } catch { /* Never surface remote errors. */ } };
      if (combined.aborted) { discard(); fail('offline'); }
      if (response.redirected || (response.status >= 300 && response.status < 400)) { discard(); fail(); }
      if (response.status === 404 && allowMissing) { discard(); return MISSING; }
      const retryAfter = response.headers?.get('retry-after');
      const rateLimited = response.status === 429 || (response.status === 403 &&
        (response.headers?.get('x-ratelimit-remaining') === '0' || /^\d{1,6}$/.test(retryAfter || '')));
      if (rateLimited) {
        const reset = response.headers?.get('x-ratelimit-reset');
        const requested = /^\d{1,6}$/.test(retryAfter || '') ? Number(retryAfter) * 1000
          : /^\d{1,12}$/.test(reset || '') ? Number(reset) * 1000 - now() : 60000;
        retryAfterMs = Math.max(60000, Math.min(MAX_BACKOFF, requested));
        discard(); fail('offline');
      }
      if (response.status === 401 || response.status === 403) { discard(); fail(); }
      if (response.status === 409 || response.status === 422) { discard(); fail('conflict'); }
      if (response.status >= 500 && response.status <= 599) { discard(); fail('offline'); }
      if (response.status !== 200 && !(options.method === 'PUT' && response.status === 201)) { discard(); fail(); }
      const declared = response.headers?.get('content-length');
      if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) >= RESPONSE_LIMIT)) { discard(); fail(); }
      if (!response.body || typeof response.body.getReader !== 'function') fail();
      const reader = response.body.getReader();
      // One fixed buffer bounds allocations even for a stream of one-byte chunks.
      const buffer = Buffer.alloc(RESPONSE_LIMIT);
      let size = 0;
      let ended = false;
      const cancelReader = () => { reader.cancel().catch(() => {}); };
      combined.addEventListener('abort', cancelReader, { once: true });
      try {
        while (true) {
          if (combined.aborted) fail('offline');
          const { done, value } = await reader.read();
          if (combined.aborted) fail('offline');
          if (done) { ended = true; break; }
          if (!(value instanceof Uint8Array)) fail();
          if (size + value.byteLength >= RESPONSE_LIMIT) fail();
          buffer.set(value, size);
          size += value.byteLength;
        }
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))); }
        catch { fail(); }
      } finally {
        combined.removeEventListener('abort', cancelReader);
        if (!ended) cancelReader();
        reader.releaseLock();
      }
    };
    try { return await Promise.race([work(), aborted]); }
    catch (error) { if (error instanceof SyncFault) throw error; fail('offline'); }
    finally {
      clearTimeout(timeout);
      combined.removeEventListener('abort', onAbort);
      deadline.abort();
    }
  }

  function checkActive(signal) { if (signal.aborted) fail('offline'); }

  async function save(next) {
    try { await persist(checkpointFile, structuredClone(next)); }
    catch { fenced = true; fail(); }
    checkpoint = next;
  }

  async function acknowledge(hash, sha, signal) {
    checkActive(signal);
    const at = now();
    if (!Number.isFinite(at) || at < 0) { fenced = true; fail(); }
    // Keep the last intent as a journal record even in the acknowledgement write.
    // Thus a persist failure *after rename* cannot erase the original intent.
    // ack.hash === pending.hash marks that record completed; it is not recoverable again.
    await save({ ...checkpoint, ack: { hash, sha, at } });
  }

  async function attempt() {
    if (fenced || state === 'conflict') return status();
    controller = new AbortController();
    const signal = controller.signal;
    try {
      // Capture/validate before the first await, and acknowledge only this immutable payload.
      const captured = payload(store.snapshot());
      const metadata = await request(repoURL, { method: 'GET' }, signal);
      checkActive(signal);
      const [owner, name] = binding.repo.split('/');
      if (!isObject(metadata) || metadata.private !== true || metadata.id !== repoId || metadata.archived !== false ||
          typeof metadata.owner?.login !== 'string' || metadata.owner.login.toLowerCase() !== owner ||
          typeof metadata.name !== 'string' || metadata.name.toLowerCase() !== name ||
          typeof metadata.full_name !== 'string' || metadata.full_name.toLowerCase() !== binding.repo) fail();

      const remoteValue = await request(`${contentURL}?ref=${encodeURIComponent(branch)}`, { method: 'GET' }, signal, true);
      checkActive(signal);
      const remote = remoteValue === MISSING ? null : decodeContent(remoteValue);
      const { ack, pending } = checkpoint;
      const unresolved = pending && pending.hash !== ack?.hash;
      if (unresolved && remote?.hash === pending.hash) {
        await acknowledge(pending.hash, remote.sha, signal);
        // Recovery is its own attempt: never chain a second PUT after ambiguity.
      } else {
        if (ack) {
          if (!remote || remote.sha !== ack.sha || remote.hash !== ack.hash) fail('conflict');
        } else if (remote) {
          if (pending || remote.hash !== captured.hash) fail('conflict');
          await acknowledge(captured.hash, remote.sha, signal);
        }
        if (unresolved && (remote?.sha ?? null) !== pending.baseSha) fail('conflict');
        if (!remote || captured.hash !== remote.hash) {
          checkActive(signal);
          const intent = { hash: captured.hash, baseSha: remote?.sha ?? null };
          await save({ ...checkpoint, pending: intent });
          checkActive(signal);
          const result = await request(contentURL, {
            method: 'PUT', body: JSON.stringify({
              message: 'Sync Fieldnotes notebook', branch,
              content: Buffer.from(captured.text).toString('base64'),
              ...(intent.baseSha === null ? {} : { sha: intent.baseSha }),
            }),
          }, signal);
          checkActive(signal);
          if (!isObject(result) || !isObject(result.content) || !shaSchema.safeParse(result.content.sha).success ||
              result.content.path !== CONTENT_PATH) fail();
          await acknowledge(captured.hash, result.content.sha, signal);
        }
      }
      checkActive(signal);
      state = payload(store.snapshot()).hash === checkpoint.ack?.hash ? 'synced' : 'pending';
      failures = 0;
      retryAfterMs = 0;
    } catch (error) {
      state = error instanceof SyncFault ? error.state : 'blocked';
      if (state === 'blocked') fenced = true;
      if (state === 'offline') failures = Math.min(failures + 1, 20);
    } finally { controller = null; }
    return status();
  }

  function sync() {
    if (!active) active = attempt().finally(() => { active = null; });
    return active;
  }

  function start() {
    if (running) return;
    running = true;
    const epoch = ++generation;
    const tick = () => {
      if (!running || epoch !== generation) return;
      timer = null;
      void sync().finally(() => {
        if (!running || epoch !== generation || fenced || state === 'conflict') return;
        const delay = Math.min(MAX_BACKOFF, Math.max(retryAfterMs, intervalMs * (2 ** failures)));
        timer = setTimeout(tick, delay);
        timer.unref?.();
      });
    };
    tick();
  }

  function stop() {
    running = false;
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller?.abort();
    return active ?? Promise.resolve(status());
  }

  return { sync, start, stop, status };
}