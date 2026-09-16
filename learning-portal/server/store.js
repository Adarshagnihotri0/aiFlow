import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { profileDefault, stateSchema } from './schema.js';

export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomUUID()}.tmp`;
  let handle;
  let committed = false;
  try {
    handle = await open(tmp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2));
    await handle.sync(); await handle.close(); handle = null;
    await rename(tmp, file);
    committed = true;
    const directory = await open(path.dirname(file), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) {
    error.committed = committed;
    throw error;
  } finally {
    if (handle) await handle.close();
    await unlink(tmp).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function createStore(directory, { persist = atomicJson } = {}) {
  const file = path.join(directory, 'notebook.json');
  let state;
  try { state = stateSchema.parse(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Notebook is unreadable. Restore it from backup; refusing to overwrite progress.');
    state = { version: 1, profile: { ...profileDefault }, reviews: {}, progress: {}, receipts: [], sessions: [] };
    await atomicJson(file, state);
  }
  let queue = Promise.resolve();
  let writeFault = false;
  return {
    snapshot: () => structuredClone(state),
    update(mutator) {
      const next = queue.then(async () => {
        if (writeFault) throw new Error('Notebook writes stopped after a storage failure. Restart only after checking storage.');
        const draft = structuredClone(state);
        const result = mutator(draft);
        stateSchema.parse(draft);
        try { await persist(file, draft); }
        catch (error) {
          if (error.committed) state = draft;
          writeFault = true;
          throw error;
        }
        state = draft;
        return result;
      });
      queue = next.catch(() => {});
      return next;
    },
  };
}

export function scheduleReview(previous, rating, now = Date.now(), fingerprint = '') {
  const day = 86_400_000;
  const old = previous?.fingerprint === fingerprint ? previous : undefined;
  const intervals = { again: 10 * 60_000, hard: Math.max(day, (old?.interval || day) * 1.2), good: Math.max(day, (old?.interval || day / 2) * 2), easy: Math.max(4 * day, (old?.interval || day) * 2.5) };
  if (!Object.hasOwn(intervals, rating)) throw new Error('Invalid review rating');
  const interval = Math.min(intervals[rating], 180 * day);
  return { due: now + interval, interval, reps: (old?.reps || 0) + 1, fingerprint };
}