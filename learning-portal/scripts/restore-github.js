import { mkdir, lstat, readdir, open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { exportNotebook } from '../server/github-sync.js';
import { atomicJson } from '../server/store.js';
import { acquireOwnership } from '../server/ownership.js';

const PAYLOAD_LIMIT = 750 * 1024;
const RESPONSE_LIMIT = 1_200_000;
const TIMEOUT = 15_000;
const CONTENT_PATH = 'fieldnotes/notebook.json';
const messages = Object.freeze({
  configuration: 'Recovery configuration is invalid. Supply a repository, positive immutable repository ID, constrained branch, token and absolute destination.',
  destination: 'Recovery requires a brand-new destination with an existing parent directory. Existing destinations are never reused.',
  authentication: 'Recovery authentication is unavailable. Supply a server-only token or authenticate gh for github.com.',
  blocked: 'Recovery blocked: repository identity, privacy or remote notebook validation failed.',
  network: 'Recovery network request failed. No remote error details are displayed.',
  timeout: 'Recovery network deadline exceeded (15 seconds).',
  storage: 'Recovery storage operation failed. Inspect the reserved directory before any further action.',
});

class RestoreFault extends Error {
  constructor(code, reserved = false) {
    super(`${messages[code]}${reserved ? ' The reserved destination is retained; recovery will not reuse or delete it.' : ''}`);
    this.name = 'RestoreError';
    this.code = code;
    this.reserved = reserved;
  }
}
const fail = (code = 'blocked') => { throw new RestoreFault(code); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validConfiguration({ repo, repoId, branch, destination }) {
  return typeof repo === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repo) &&
    Number.isSafeInteger(repoId) && repoId > 0 &&
    typeof branch === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) &&
    !branch.includes('..') && branch.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock')) &&
    typeof destination === 'string' && path.isAbsolute(destination) && !destination.includes('\0');
}

function decodeNotebook(value) {
  if (!isObject(value) || value.type !== 'file' || value.path !== CONTENT_PATH || value.encoding !== 'base64' ||
      typeof value.sha !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(value.sha) || typeof value.content !== 'string') fail();
  // Only GitHub's LF/CRLF wrapping is permitted; round-trip rejects noncanonical padding.
  const encoded = value.content.replace(/\r?\n/g, '');
  if (encoded.length > Math.ceil(PAYLOAD_LIMIT / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail();
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > PAYLOAD_LIMIT || bytes.toString('base64') !== encoded) fail();
  const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  if (!isObject(envelope) || Object.keys(envelope).length !== 2 || envelope.format !== 'fieldnotes-notebook-v1' ||
      envelope.notebook?.profile?.aiConsent !== false) fail();
  const validated = exportNotebook(envelope.notebook);
  // exportNotebook also validates approved sources, sensitive content and the session graph.
  // Reject normalization (including trimmed text) rather than restoring a different state.
  if (!isDeepStrictEqual(envelope, validated)) fail();
  return validated.notebook;
}

async function requestJson(url, fetchImpl, token, signal) {
  const response = await fetchImpl(url, {
    method: 'GET', redirect: 'error', signal,
    headers: {
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fieldnotes-learning-portal-recovery', Authorization: `Bearer ${token}`,
    },
  });
  const discard = () => { try { void response.body?.cancel().catch(() => {}); } catch { /* Do not surface remote errors. */ } };
  if (signal.aborted) { discard(); fail('timeout'); }
  if (response.redirected || response.status !== 200) { discard(); fail(); }
  const declared = response.headers?.get('content-length');
  if (declared != null && (!/^\d+$/.test(declared) || Number(declared) >= RESPONSE_LIMIT)) { discard(); fail(); }
  if (!response.body || typeof response.body.getReader !== 'function') fail();
  const reader = response.body.getReader();
  const buffer = Buffer.alloc(RESPONSE_LIMIT);
  let size = 0;
  let ended = false;
  const cancel = () => { try { void reader.cancel().catch(() => {}); } catch { /* Sanitized at the boundary. */ } };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) fail('timeout');
      const { done, value } = await reader.read();
      if (signal.aborted) fail('timeout');
      if (done) { ended = true; break; }
      if (!(value instanceof Uint8Array) || size + value.byteLength >= RESPONSE_LIMIT) fail();
      buffer.set(value, size);
      size += value.byteLength;
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, size))); }
    catch { fail(); }
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!ended) cancel();
    reader.releaseLock();
  }
}

async function readRemote({ repo, repoId, branch, fetchImpl, token }) {
  const controller = new AbortController();
  let timeout;
  const expired = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new RestoreFault('timeout'));
    }, TIMEOUT);
  });
  const work = async () => {
    const url = `https://api.github.com/repos/${repo.split('/').map(encodeURIComponent).join('/')}`;
    const metadata = await requestJson(url, fetchImpl, token, controller.signal);
    const [owner, name] = repo.toLowerCase().split('/');
    if (!isObject(metadata) || metadata.private !== true || metadata.id !== repoId || metadata.archived !== false ||
        typeof metadata.owner?.login !== 'string' || metadata.owner.login.toLowerCase() !== owner ||
        typeof metadata.name !== 'string' || metadata.name.toLowerCase() !== name ||
        typeof metadata.full_name !== 'string' || metadata.full_name.toLowerCase() !== repo.toLowerCase()) fail();
    if (controller.signal.aborted) fail('timeout');
    const content = await requestJson(`${url}/contents/${CONTENT_PATH}?ref=${encodeURIComponent(branch)}`, fetchImpl, token, controller.signal);
    try { return decodeNotebook(content); } catch { fail(); }
  };
  // The race bounds even injected fetch implementations that ignore AbortSignal.
  // Only the winning result reaches local persistence; late work cannot write anything.
  try { return await Promise.race([work(), expired]); }
  catch (error) { if (error instanceof RestoreFault) throw error; fail('network'); }
  finally { clearTimeout(timeout); controller.abort(); }
}

/** Restore into a newly reserved directory under a trusted parent; never merge or overwrite.
 * token is required here. Only direct CLI invocation may acquire it from gh.
 * Errors contain fixed messages/code/reserved only, with no raw error causes.
 * The optional second argument injects persistence/directory I/O for durability boundary tests.
 */
export async function restoreGitHub(
  { repo, repoId, branch, destination, fetchImpl = globalThis.fetch, token } = {},
  { persist = atomicJson, openDirectory = open } = {},
) {
  if (!validConfiguration({ repo, repoId, branch, destination }) || typeof fetchImpl !== 'function' ||
      typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token) ||
      typeof persist !== 'function' || typeof openDirectory !== 'function') fail('configuration');
  let reserved = false;
  let phase = 'destination';
  let release;
  try {
    await mkdir(destination, { recursive: false, mode: 0o700 });
    reserved = true;
    phase = 'storage';
    release = await acquireOwnership(destination);
    const reservation = await lstat(destination);
    if (!reservation.isDirectory() || (reservation.mode & 0o077) !== 0) fail('storage');
    const lockPath = path.join(destination, 'owner.lock');
    const lock = await lstat(lockPath);
    phase = 'network';
    const notebook = await readRemote({ repo, repoId, branch, fetchImpl, token });
    phase = 'storage';
    const current = await lstat(destination);
    const entries = await readdir(destination);
    const currentLock = await lstat(lockPath);
    if (!current.isDirectory() || current.dev !== reservation.dev || current.ino !== reservation.ino ||
        (current.mode & 0o077) !== 0 || entries.length !== 1 || entries[0] !== 'owner.lock' ||
        !currentLock.isFile() || currentLock.dev !== lock.dev || currentLock.ino !== lock.ino) fail('storage');
    await persist(path.join(destination, 'notebook.json'), notebook);
    // atomicJson syncs the notebook and destination. Also make the newly reserved
    // directory's entry durable in its parent before relinquishing ownership.
    const parent = await openDirectory(path.dirname(path.resolve(destination)), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
    // No checkpoint: sync can acknowledge this exact validated state on first use.
    return {
      status: 'restored', sessions: notebook.sessions.length,
      reviews: Object.keys(notebook.reviews).length, progress: Object.keys(notebook.progress).length,
      receipts: notebook.receipts.length,
    };
  } catch (error) {
    throw new RestoreFault(error instanceof RestoreFault ? error.code : phase, reserved);
  } finally {
    if (release) {
      try { await release(); }
      catch { throw new RestoreFault('storage', reserved); }
    }
  }
}

async function cliToken() {
  if (process.env.PORTAL_GITHUB_TOKEN !== undefined) return process.env.PORTAL_GITHUB_TOKEN;
  try {
    // Capture stdout/stderr internally; never inherit stdio or include child errors in output.
    const { stdout } = await promisify(execFile)('gh', ['auth', 'token', '--hostname', 'github.com'], {
      encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 16 * 1024,
    });
    return stdout.trim();
  } catch { fail('authentication'); }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--destination') fail('configuration');
    const rawId = process.env.PORTAL_GITHUB_REPO_ID;
    if (!rawId || !/^[1-9]\d*$/.test(rawId)) fail('configuration');
    const options = {
      repo: process.env.PORTAL_GITHUB_REPO, repoId: Number(rawId),
      branch: process.env.PORTAL_GITHUB_BRANCH, destination: args[1],
    };
    if (!validConfiguration(options)) fail('configuration');
    const result = await restoreGitHub({ ...options, token: await cliToken() });
    console.log(`Recovery restored: ${result.sessions} sessions, ${result.reviews} reviews, ${result.progress} progress entries, ${result.receipts} receipts.`);
  } catch (error) {
    console.error(error instanceof RestoreFault ? error.message : 'Recovery failed. No error details are displayed; inspect any reserved destination and do not reuse it.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();