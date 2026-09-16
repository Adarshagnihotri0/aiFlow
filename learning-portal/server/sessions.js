import { readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sourceIds } from './catalog.js';
import { validateSession } from './schema.js';

export function createInbox(store, directory) {
  let active = null;
  const accepted = new Map();
  let health = { imported: 0, rejected: 0, checkedAt: null };
  async function scan() {
    let files;
    try { files = await readdir(directory); }
    catch (error) { if (error.code === 'ENOENT') return health; throw error; }
    let imported = 0; let rejected = 0;
    for (const filename of files.filter((name) => /^[a-z][a-z0-9-]{1,79}\.json$/.test(name)).sort().slice(0, 200)) {
      try {
        const target = path.join(directory, filename);
        const info = await lstat(target);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 32000) throw new Error('Unsafe inbox item');
        const raw = await readFile(target, 'utf8');
        const hash = createHash('sha256').update(raw).digest('hex');
        if (accepted.get(filename) === hash) continue;
        const session = validateSession(JSON.parse(raw), sourceIds);
        if (filename !== `${session.id}.json`) throw new Error('Mismatched session ID');
        await store.update((state) => {
          const prior = state.sessions.find((entry) => entry.id === session.id);
          if (prior) {
            if (JSON.stringify(prior) !== JSON.stringify(session)) throw new Error('Conflicting session replay');
          } else {
            if (state.sessions.length >= 200) throw new Error('Session capacity reached');
            if (session.supersedes && (!state.sessions.some((item) => item.id === session.supersedes) || state.sessions.some((item) => item.supersedes === session.supersedes))) throw new Error('Supersession must reference one existing, not already superseded session.');
            state.sessions.push(session);
          }
        });
        accepted.set(filename, hash); imported += 1;
      } catch { rejected += 1; }
    }
    health = { imported, rejected, checkedAt: new Date().toISOString() };
    return health;
  }
  return { scan() { if (!active) active = scan().finally(() => { active = null; }); return active; }, status: () => ({ ...health }) };
}

export function sessionLesson(session) {
  return {
    id: `session-${session.id}`, title: session.title, summary: session.summary,
    concepts: session.concepts, sourceIds: session.sourceIds,
    sections: [
      { title: 'The recorded problem and outcome', body: session.summary },
      { title: 'What changed', body: session.changes.join('\n\n') },
      { title: 'Recorded rationale—not hidden reasoning', body: session.why },
      ...(session.teaching ? [{ title: 'In plain language', body: session.teaching.plainExplanation }, { title: 'A worked example', body: session.teaching.example }] : [{ title: 'Connect this to the basics', body: 'This recap has no producer-supplied beginner example yet. Start with the Contracts and tests lesson, then identify the input, expected output, owner and failure case for this change. Do not treat unfamiliar terms as understood just because the change was completed.' }]),
      { title: 'Evidence and limitations', body: session.evidence.map((item) => `${item.state.toUpperCase()} · ${item.label}\n${item.reference}`).join('\n\n') + '\n\nThese are producer-supplied evidence labels, not independent certification. Session status: ' + session.status },
    ],
    question: session.teaching?.checkQuestion || `Explain the problem, recorded decision and one evidence limitation in “${session.title}”.`,
    answer: `${session.teaching?.checkAnswer || session.summary}\n\nRationale: ${session.why}\n\nStatus: ${session.status}.\n${session.evidence.map((item) => `${item.state}: ${item.label} — ${item.reference}`).join('\n')}\nThese are recorded evidence labels, not independent certification or proof of complete correctness.`,
    exercise: session.exercise,
    interview: `Explain the work in “${session.title}”. Separate the agent’s contribution from your own and discuss one tradeoff and one test.`,
  };
}