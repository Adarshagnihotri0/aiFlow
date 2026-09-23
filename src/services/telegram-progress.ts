import { createHash } from 'crypto';
import path from 'path';
import { telegramStateDirectory, withTelegramState } from './telegram-state';

export const progressCatalog = {
  phase: {
    review: 'Review in progress', implementation: 'Implementation in progress',
    validation: 'Validation in progress', blocked: 'Blocked', complete: 'Completed scoped work',
  },
  areas: {
    comments: 'comments', groups: 'groups', 'reel-playback': 'reel playback',
    'nearby-sync': 'nearby sync', telegram: 'Telegram integration',
  },
  decision: {
    'inspection-first': 'Inspect owning implementations before changing behavior.',
    'reuse-proxy': 'Reuse the existing proxy and single poller; preserve the running listener.',
    'queue-only': 'Queue approved requests for explicit agent pickup; no remote execution.',
    'focused-fix': 'Keep changes in the owning layer and validate the smallest contract first.',
    'await-evidence': 'Keep claims pending until executable evidence exists.',
  },
  check: {
    'android-compile': 'Android compilation', 'device-sync': 'Physical-device sync proof',
    'proxy-build': 'Proxy TypeScript build', 'proxy-tests': 'Isolated proxy tests',
    'telegram-delivery': 'Telegram delivery acknowledgement',
  },
  result: { pending: 'pending', passed: 'passed', failed: 'FAILED', 'not-run': 'not run' },
  blocker: {
    none: 'No blocker reported for this phase', 'compile-pending': 'Compilation validation pending',
    'compile-failed': 'Compilation failed; investigation required',
    'device-unverified': 'No device sync proof yet', 'tests-failed': 'Tests failed; repair required',
    'restart-required': 'Secure intake staged; authorized proxy restart required to activate',
    'agent-pickup': 'Approved work awaits explicit main-agent pickup',
    'delivery-uncertain': 'Delivery outcome uncertain; inspect before retrying',
  },
  next: {
    inspect: 'Continue targeted implementation review', implement: 'Apply focused changes',
    validate: 'Run focused validation', 'human-acceptance': 'Await human acceptance',
    'agent-pickup': 'Main agent must explicitly pick up queued work',
  },
} as const;

type Key<T> = keyof T;
export interface ProgressEvent {
  run: string;
  sequence: number;
  phase: Key<typeof progressCatalog.phase>;
  areas: Array<Key<typeof progressCatalog.areas>>;
  decision: Key<typeof progressCatalog.decision>;
  evidence: Array<{ check: Key<typeof progressCatalog.check>; result: Key<typeof progressCatalog.result> }>;
  blockers: Array<Key<typeof progressCatalog.blocker>>;
  next: Key<typeof progressCatalog.next>;
}
interface Entry { run: string; sequence: number; hash: string; at: number; status: 'sending' | 'delivered' | 'uncertain'; messageId?: number }
interface State { version: 1; entries: Entry[]; runs: Record<string, number> }
export interface DeliveryReceipt { messageId: number; topic: 'workspace' | 'general' }
export type ProgressResult = { status: 'delivered'; receipt: DeliveryReceipt } | { status: 'duplicate' | 'uncertain' | 'deferred'; retryAfterMs?: number };

function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw new Error('Invalid progress fields');
}
function member(value: unknown, catalog: object): void {
  if (typeof value !== 'string' || !Object.hasOwnProperty.call(catalog, value)) throw new Error('Unknown progress code');
}
export function validateProgress(value: unknown): ProgressEvent {
  exactKeys(value, ['run', 'sequence', 'phase', 'areas', 'decision', 'evidence', 'blockers', 'next']);
  if (typeof value.run !== 'string' || !/^hopper-\d{8}$/.test(value.run)
    || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1) throw new Error('Invalid progress identity');
  for (const field of ['phase', 'decision', 'next'] as const) member(value[field], progressCatalog[field]);
  for (const field of ['areas', 'blockers'] as const) {
    const values = value[field];
    if (!Array.isArray(values) || values.length < 1 || values.length > 5 || new Set(values).size !== values.length) throw new Error('Invalid progress list');
    for (const item of values) member(item, field === 'areas' ? progressCatalog.areas : progressCatalog.blocker);
  }
  if (!Array.isArray(value.evidence) || value.evidence.length > 5) throw new Error('Invalid evidence');
  const seen = new Set();
  for (const item of value.evidence) {
    exactKeys(item, ['check', 'result']);
    member(item.check, progressCatalog.check);
    member(item.result, progressCatalog.result);
    if (seen.has(item.check)) throw new Error('Duplicate evidence');
    seen.add(item.check);
  }
  return value as unknown as ProgressEvent;
}
export function renderProgress(event: ProgressEvent): string {
  const e = validateProgress(event);
  return [
    `**Hopper integration | ${progressCatalog.phase[e.phase]}**`,
    `Run: ${e.run} · Milestone ${e.sequence}`,
    `Scope: ${e.areas.map(a => progressCatalog.areas[a]).join(', ')}`,
    `Decision: ${progressCatalog.decision[e.decision]}`,
    'Evidence (reported by the producing agent):',
    ...e.evidence.map(x => `• ${progressCatalog.check[x.check]}: ${progressCatalog.result[x.result]}`),
    `Blockers: ${e.blockers.map(b => progressCatalog.blocker[b]).join('; ')}`,
    `Next: ${progressCatalog.next[e.next]}`,
  ].join('\n');
}

export async function publishProgress(
  input: unknown,
  send: (text: string) => Promise<DeliveryReceipt>,
  file = path.join(telegramStateDirectory, 'progress.json'),
  now = Date.now(),
): Promise<ProgressResult> {
  const event = validateProgress(input);
  const text = renderProgress(event);
  // Sequence numbers do not turn the same semantic update into a new message.
  const canonical = { phase: event.phase, areas: [...event.areas].sort(), decision: event.decision,
    evidence: [...event.evidence].sort((a, b) => a.check.localeCompare(b.check)), blockers: [...event.blockers].sort(), next: event.next };
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return withTelegramState<State, ProgressResult>(file, () => ({ version: 1, entries: [], runs: {} }), async (state, save) => {
    if (state.version !== 1 || !Array.isArray(state.entries) || state.entries.length > 128
      || !state.runs || Object.keys(state.runs).length > 8
      || Object.entries(state.runs).some(([run, sequence]) => !/^hopper-\d{8}$/.test(run) || !Number.isSafeInteger(sequence) || sequence < 1)
      || state.entries.some(e => !e || !/^hopper-\d{8}$/.test(e.run) || !Number.isSafeInteger(e.sequence)
        || e.sequence < 1 || !/^[a-f0-9]{64}$/.test(e.hash) || !Number.isFinite(e.at)
        || !['sending', 'delivered', 'uncertain'].includes(e.status))) throw new Error('Invalid progress state');
    const prior = state.entries.find(e => e.run === event.run && (e.sequence === event.sequence || e.hash === hash));
    if (prior && prior.sequence === event.sequence && prior.hash !== hash) throw new Error('Progress sequence conflict');
    if (prior) return { status: prior.status === 'delivered' ? 'duplicate' : 'uncertain' };
    if (event.sequence <= (state.runs[event.run] ?? 0)) return { status: 'duplicate' };
    if (!(event.run in state.runs) && Object.keys(state.runs).length >= 8) throw new Error('Progress run capacity reached; archive locally');
    const recent = state.entries.filter(e => now - e.at < 86400000);
    const latest = state.entries[state.entries.length - 1];
    if (recent.length >= 120) return { status: 'deferred', retryAfterMs: Math.max(1, 86400000 - (now - recent[0].at)) };
    if (latest && now - latest.at < 30000) return { status: 'deferred', retryAfterMs: 30000 - (now - latest.at) };
    const entry: Entry = { run: event.run, sequence: event.sequence, hash, at: now, status: 'sending' };
    state.entries.push(entry);
    state.entries = state.entries.slice(-128);
    state.runs[event.run] = event.sequence;
    await save(); // Reserve before the network side effect; ambiguous failures must not auto-retry.
    try {
      const receipt = await send(text);
      if (!Number.isSafeInteger(receipt.messageId) || receipt.messageId <= 0) throw new Error('Missing Telegram acknowledgement');
      entry.status = 'delivered';
      entry.messageId = receipt.messageId;
      await save();
      return { status: 'delivered', receipt };
    } catch {
      entry.status = 'uncertain';
      await save();
      return { status: 'uncertain' };
    }
  });
}
