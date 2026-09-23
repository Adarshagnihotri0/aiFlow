import { constants, promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

export const telegramStateDirectory = path.join(os.homedir(), '.copilot', 'telegram-progress');
const MAX_BYTES = 128 * 1024;

async function acquireLock(file: string): Promise<Awaited<ReturnType<typeof fs.open>>> {
  for (let attempt = 0; ; attempt++) {
    try { return await fs.open(`${file}.lock`, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt >= 20) throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

// Single local owner, atomic durable writes, bounded reads. Never steal a stale lock:
// an interrupted owner requires local inspection, not a concurrent remote retry.
export async function withTelegramState<T, R>(
  file: string,
  initial: () => T,
  operation: (state: T, save: () => Promise<void>) => Promise<R>,
): Promise<R> {
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await fs.lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()
    || (directoryStat.mode & 0o077) !== 0
    || (process.getuid && directoryStat.uid !== process.getuid())) {
    throw new Error('Unsafe Telegram state directory');
  }
  const lock = await acquireLock(file);
  try {
    let state: T;
    try {
      const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_BYTES || (stat.mode & 0o077) !== 0
          || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe Telegram state file');
        state = JSON.parse(await handle.readFile('utf8')) as T;
      } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Telegram state unavailable');
      state = initial();
    }
    const save = async (): Promise<void> => {
      const data = JSON.stringify(state);
      if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('Telegram state capacity reached');
      const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally { await handle.close(); }
      try {
        await fs.rename(temporary, file);
        const dir = await fs.open(directory, 'r');
        try { await dir.sync(); } finally { await dir.close(); }
      } finally { await fs.unlink(temporary).catch(() => undefined); }
    };
    return await operation(state, save);
  } finally {
    await lock.close();
    await fs.unlink(`${file}.lock`);
  }
}
