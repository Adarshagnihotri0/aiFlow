import { open, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';

const messages = Object.freeze({
  locked: 'Directory ownership is unavailable. Inspect owner.lock manually; existing locks are never removed automatically.',
  storage: 'Directory ownership could not be acquired. Inspect the directory and any owner.lock manually.',
  release: 'Directory ownership could not be released safely. Inspect the directory and any owner.lock manually.',
});

class OwnershipFault extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = 'OwnershipError';
    this.code = code;
  }
}

/** Exclusively own an existing directory; never create it or reclaim stale locks.
 * Resolves to an idempotent async release function. Errors have fixed name/code/message,
 * without raw causes. A failed initialization retains its partial lock for manual inspection.
 * Cooperative same-user processes are supported; hostile same-user mutation is not.
 */
export async function acquireOwnership(directory) {
  let lockPath;
  let handle;
  try {
    lockPath = path.join(directory, 'owner.lock');
    handle = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    throw new OwnershipFault(error.code === 'EEXIST' ? 'locked' : 'storage');
  }

  let identity;
  try {
    identity = await handle.stat();
    await handle.writeFile(String(process.pid));
    await handle.sync();
  } catch {
    await handle.close().catch(() => {});
    // Never unlink on acquisition failure: no stale-PID guessing or foreign-lock cleanup.
    throw new OwnershipFault('storage');
  }

  let releasing;
  return async function release() {
    // Keep the original descriptor open until release, preventing inode reuse, and memoize
    // the outcome so repeated/concurrent release calls cannot remove a subsequent owner.
    releasing ??= (async () => {
      try {
        try {
          const current = await lstat(lockPath);
          if (!current.isFile() || current.dev !== identity.dev || current.ino !== identity.ino) {
            throw new OwnershipFault('release');
          }
          await unlink(lockPath);
        } finally {
          await handle.close();
        }
      } catch {
        throw new OwnershipFault('release');
      }
    })();
    await releasing;
  };
}