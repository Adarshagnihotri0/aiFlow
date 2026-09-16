import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, lstat, symlink, rename, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireOwnership } from '../server/ownership.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-ownership-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, lock: path.join(directory, 'owner.lock') };
}

async function rejectsSafe(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, 'OwnershipError');
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.match(error.message, /manually/);
    assert.ok(!String(error.stack).includes('private-fixture-detail'));
    assert.ok(!JSON.stringify(error).includes('private-fixture-detail'));
    return true;
  });
}

test('ownership exports exactly acquireOwnership without startup side effects', async () => {
  const module = await import('../server/ownership.js');
  assert.deepEqual(Object.keys(module), ['acquireOwnership']);
  assert.equal(module.acquireOwnership, acquireOwnership);
});

test('simultaneous acquisitions are exclusive, private, and write the current PID', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => acquireOwnership(f.directory)));
  const winners = results.filter((result) => result.status === 'fulfilled');
  try {
    assert.equal(winners.length, 1);
    for (const result of results.filter((result) => result.status === 'rejected')) {
      assert.equal(result.reason.name, 'OwnershipError');
      assert.equal(result.reason.code, 'locked');
    }
    assert.equal(await readFile(f.lock, 'utf8'), String(process.pid));
    assert.equal((await lstat(f.lock)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(f.directory), ['owner.lock']);
  } finally {
    await Promise.all(winners.map((result) => result.value()));
  }
  assert.deepEqual(await readdir(f.directory), []);
});

test('existing live, stale and malformed locks are never reclaimed or changed', async (t) => {
  for (const contents of [String(process.pid), '2147483647', '', 'not-a-pid', '-1', '0', '1.5', 'private-fixture-detail']) {
    const f = await fixture(t);
    await writeFile(f.lock, contents, { mode: 0o600 });
    const before = await lstat(f.lock);
    await rejectsSafe(acquireOwnership(f.directory), 'locked');
    const after = await lstat(f.lock);
    assert.equal(after.ino, before.ino);
    assert.equal(after.dev, before.dev);
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(await readFile(f.lock, 'utf8'), contents);
  }
});

test('existing symlink and directory lock entries are not followed or deleted', async (t) => {
  for (const kind of ['symlink', 'dangling-symlink', 'directory']) {
    const f = await fixture(t);
    const target = path.join(f.directory, 'private-fixture-detail');
    if (kind === 'directory') await mkdir(f.lock);
    else {
      if (kind === 'symlink') await writeFile(target, 'untouched');
      await symlink(target, f.lock);
    }
    const before = await lstat(f.lock);
    await rejectsSafe(acquireOwnership(f.directory), 'locked');
    assert.equal((await lstat(f.lock)).ino, before.ino);
    if (kind === 'symlink') assert.equal(await readFile(target, 'utf8'), 'untouched');
    if (kind === 'dangling-symlink') await assert.rejects(lstat(target), { code: 'ENOENT' });
  }
});

test('directory must already exist and acquisition errors contain no raw filesystem details', async (t) => {
  const f = await fixture(t);
  const missing = path.join(f.directory, 'private-fixture-detail');
  await rejectsSafe(acquireOwnership(missing), 'storage');
  await assert.rejects(lstat(missing), { code: 'ENOENT' });
  await writeFile(missing, 'not-a-directory');
  await rejectsSafe(acquireOwnership(missing), 'storage');
  assert.equal(await readFile(missing, 'utf8'), 'not-a-directory');
});

test('release allows the next owner and repeated or concurrent old release cannot remove it', async (t) => {
  const f = await fixture(t);
  const release = await acquireOwnership(f.directory);
  await Promise.all([release(), release()]);
  const nextRelease = await acquireOwnership(f.directory);
  try {
    await Promise.all([release(), release()]);
    assert.equal(await readFile(f.lock, 'utf8'), String(process.pid));
    await rejectsSafe(acquireOwnership(f.directory), 'locked');
  } finally { await nextRelease(); }
  assert.deepEqual(await readdir(f.directory), []);
});

test('release refuses to remove another lock and repeated failed release remains safe', async (t) => {
  const f = await fixture(t);
  const release = await acquireOwnership(f.directory);
  const original = path.join(f.directory, 'original.lock');
  await rename(f.lock, original);
  await writeFile(f.lock, 'private-fixture-detail');
  await rejectsSafe(release(), 'release');
  await rejectsSafe(release(), 'release');
  assert.equal(await readFile(f.lock, 'utf8'), 'private-fixture-detail');
  assert.equal(await readFile(original, 'utf8'), String(process.pid));
});

test('PID is written before fsync; failed lock fsync retains the lock and fails closed', async (t) => {
  const f = await fixture(t);
  // Mock only FileHandle.sync in this isolated test; no ownership injection is needed.
  const probe = await open(path.join(f.directory, 'probe'), 'wx', 0o600);
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  let calls = 0;
  const sync = t.mock.method(prototype, 'sync', async function () {
    calls += 1;
    assert.equal(await readFile(f.lock, 'utf8'), String(process.pid));
    throw new Error('private-fixture-detail');
  });
  try {
    await rejectsSafe(acquireOwnership(f.directory), 'storage');
    assert.equal(calls, 1);
    assert.equal(await readFile(f.lock, 'utf8'), String(process.pid));
    await rejectsSafe(acquireOwnership(f.directory), 'locked');
  } finally { sync.mock.restore(); }
});