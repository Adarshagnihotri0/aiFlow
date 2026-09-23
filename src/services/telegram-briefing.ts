import { createHash } from 'crypto';
import path from 'path';
import { formatTelegramRichText, redactSensitiveText } from './telegram-forwarder';
import { telegramStateDirectory, withTelegramState } from './telegram-state';
import type { DeliveryReceipt } from './telegram-progress';

export const briefingLimits = Object.freeze({ inputBytes: 16384, items: 64, parts: 6,
  partCharacters: 2200, wireBytes: 3800, diagramColumns: 48, diagramLines: 16,
  dailyMessages: 120, intervalMs: 30000 });
export type EvidenceState = 'reported' | 'verified' | 'failed' | 'not-run';
export interface TelegramBriefing {
  version: 1;
  run: string;
  sequence: number;
  title: string;
  deployment: { state: 'live' | 'staged'; detail: string };
  executive: { summary: string; impact: string };
  agents: Array<{ name: string; role: string; status: 'working' | 'blocked' | 'done';
    findings: Array<{ summary: string; evidence: { state: EvidenceState; reference: string } }> }>;
  decisions: Array<{ question: string; options: Array<{ id: string; label: string; benefits: string; costs: string }>;
    selected: string; why: string }>;
  architecture: Array<{ title: string; lines: string[] }>;
  research: Array<{ question: string; why: string; nextEvidence: string; owner: string }>;
  actions: Array<{ action: string; owner: string; state: 'next' | 'in-progress' | 'blocked' }>;
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error('Invalid briefing fields');
  return value as Record<string, unknown>;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error('Invalid briefing code');
  return value as T;
}
function text(value: unknown, max = 240, diagram = false): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max
    || (!diagram && value !== value.trim()) || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
    || (diagram ? /[^\x20-\x7e]|`/ : /[`*_~]/).test(value)) throw new Error('Invalid briefing text');
  // These are rejection guards, NOT guaranteed redaction. Producers must curate every field.
  if (redactSensitiveText(value) !== value
    || /\b(?:ASIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/.test(value)
    || /(?:^|[\s("'=:,;\[\]{}])(?:\/|~[\\/]|[A-Za-z]:[\\/]|\\\\)/.test(value)
    || /(?:\.env\b|\.ssh\b|\.aws\b|\.copilot\b|\.\.[\\/]|[a-z][a-z0-9+.-]*:\/\/)/i.test(value)
    || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)
    || /\b(?:latitude|longitude|lat|lon|lng|geohash|gps|location)\s*[:=]/i.test(value)
    || /[-+]?\d{1,3}\.\d+\s*[,/]\s*[-+]?\d{1,3}\.\d+/.test(value)) throw new Error('Unsafe briefing text');
  return value;
}
const RUN = /^[a-z][a-z0-9-]{2,47}$/;
function runId(value: unknown): string {
  if (typeof value !== 'string' || !RUN.test(value)) throw new Error('Invalid briefing run');
  return text(value, 48);
}
function sequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('Invalid briefing sequence');
  return Number(value);
}

/** Strict schema; returns a detached canonical snapshot. Never pass raw model output here. */
export function validateBriefing(input: unknown): TelegramBriefing {
  // The CLI bounds bytes before parsing. This also bounds the public adapter input.
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > briefingLimits.inputBytes) throw new Error('Briefing input limit');
  let items = 0;
  function list<T>(value: unknown, min: number, max: number, parse: (item: unknown) => T): T[] {
    if (!Array.isArray(value) || value.length < min || value.length > max
      || Reflect.ownKeys(value).length !== value.length + 1
      || Array.from({ length: value.length }, (_, index) => index).some(index => !Object.prototype.hasOwnProperty.call(value, index))
      || (items += value.length) > briefingLimits.items) throw new Error('Briefing item limit');
    return value.map(parse);
  }
  const root = record(input, ['version', 'run', 'sequence', 'title', 'deployment', 'executive',
    'agents', 'decisions', 'architecture', 'research', 'actions']);
  if (root.version !== 1) throw new Error('Invalid briefing version');
  const deployment = record(root.deployment, ['state', 'detail']);
  const executive = record(root.executive, ['summary', 'impact']);
  return {
    version: 1, run: runId(root.run), sequence: sequence(root.sequence), title: text(root.title, 80),
    deployment: { state: choice(deployment.state, ['live', 'staged']), detail: text(deployment.detail) },
    executive: { summary: text(executive.summary, 360), impact: text(executive.impact) },
    agents: list(root.agents, 1, 4, item => {
      const agent = record(item, ['name', 'role', 'status', 'findings']);
      return { name: text(agent.name, 48), role: text(agent.role, 64), status: choice(agent.status, ['working', 'blocked', 'done']),
        findings: list(agent.findings, 1, 3, value => {
          const finding = record(value, ['summary', 'evidence']);
          const evidence = record(finding.evidence, ['state', 'reference']);
          return { summary: text(finding.summary), evidence: {
            state: choice(evidence.state, ['reported', 'verified', 'failed', 'not-run']), reference: text(evidence.reference, 180),
          } };
        }) };
    }),
    decisions: list(root.decisions, 1, 2, item => {
      const decision = record(item, ['question', 'options', 'selected', 'why']);
      const options = list(decision.options, 2, 3, value => {
        const option = record(value, ['id', 'label', 'benefits', 'costs']);
        return { id: runId(option.id), label: text(option.label, 80), benefits: text(option.benefits, 160), costs: text(option.costs, 160) };
      });
      if (new Set(options.map(option => option.id)).size !== options.length) throw new Error('Duplicate decision option');
      const selected = choice(decision.selected, options.map(option => option.id));
      return { question: text(decision.question, 160), options, selected, why: text(decision.why) };
    }),
    architecture: list(root.architecture, 1, 2, item => {
      const diagram = record(item, ['title', 'lines']);
      return { title: text(diagram.title, 80), lines: list(diagram.lines, 1, briefingLimits.diagramLines,
        line => text(line, briefingLimits.diagramColumns, true)) };
    }),
    research: list(root.research, 1, 3, item => {
      const research = record(item, ['question', 'why', 'nextEvidence', 'owner']);
      return { question: text(research.question, 160), why: text(research.why, 180),
        nextEvidence: text(research.nextEvidence, 180), owner: text(research.owner, 48) };
    }),
    actions: list(root.actions, 1, 5, item => {
      const action = record(item, ['action', 'owner', 'state']);
      return { action: text(action.action, 180), owner: text(action.owner, 48), state: choice(action.state, ['next', 'in-progress', 'blocked']) };
    }),
  };
}

export function renderBriefing(input: unknown): string[] {
  const e = validateBriefing(input);
  // Atomic blocks: never split findings, decisions, research items, or code fences.
  const blocks = [
    `## CEO SUMMARY\n${e.executive.summary}\nImpact: ${e.executive.impact}\nDeployment: ${e.deployment.state.toUpperCase()} - ${e.deployment.detail}`,
    ...e.agents.flatMap(agent => agent.findings.map(finding =>
      `## PROGRAMMER / SUBAGENT UPDATE\n### ${agent.name} | ${agent.role} | ${agent.status}\nFinding: ${finding.summary}\nEvidence [${finding.evidence.state}]: ${finding.evidence.reference}`)),
    ...e.decisions.map(decision => `## DECISIONS / TRADEOFFS\n### ${decision.question}\n${decision.options.map(option =>
      `${option.id === decision.selected ? 'SELECTED' : 'Alternative'}: ${option.label}\nBenefit: ${option.benefits}\nCost: ${option.costs}`).join('\n')}\nWhy selected: ${decision.why}`),
    ...e.architecture.map(diagram => `## ARCHITECTURE\n### ${diagram.title}\n\`\`\`\n${diagram.lines.join('\n')}\n\`\`\``),
    ...e.research.map(research => `## RESEARCH / UNKNOWNS\n### ${research.question}\nWhy important: ${research.why}\nNext evidence: ${research.nextEvidence}\nOwner: ${research.owner}`),
    `## NEXT ACTIONS\n${e.actions.map(action => `- [${action.state}] ${action.action}\n  Owner: ${action.owner}`).join('\n')}`,
  ];
  const header = (part: number, total: number): string =>
    `# ${e.title}\nRun ${e.run} | Update ${e.sequence} | Part ${part}/${total}\nCurated producer report; evidence states are not independently certified.\n\n`;
  const fits = (body: string): boolean => {
    const candidate = header(6, 6) + body;
    // Include the exact current sender envelope. Budget escaped HTML bytes conservatively,
    // not merely Telegram's post-entity character limit. The sender receives Markdown once.
    return candidate.length <= briefingLimits.partCharacters
      && Buffer.byteLength(`<b>Hopper progress</b>\n\n${formatTelegramRichText(candidate)}`) <= briefingLimits.wireBytes;
  };
  const pages: string[] = [];
  let body = '';
  for (const block of blocks) {
    if (!fits(block)) throw new Error('Briefing block exceeds part limit');
    const next = body ? `${body}\n\n${block}` : block;
    if (fits(next)) body = next;
    else { pages.push(body); body = block; }
  }
  if (body) pages.push(body);
  if (pages.length > briefingLimits.parts) throw new Error('Briefing part limit');
  return pages.map((page, index) => header(index + 1, pages.length) + page);
}

interface Entry {
  run: string; sequence: number; hash: string; at: number; parts: number;
  status: 'sending' | 'delivered' | 'uncertain'; receipts: DeliveryReceipt[];
}
interface State { version: 1; entries: Entry[]; runs: Array<{ run: string; sequence: number }> }
export type BriefingResult = { status: 'delivered'; receipts: DeliveryReceipt[] }
  | { status: 'duplicate' | 'uncertain' | 'deferred'; acknowledgedParts: number; retryAfterMs?: number };
function receipt(value: unknown): DeliveryReceipt {
  const r = record(value, ['messageId', 'topic']);
  return { messageId: sequence(r.messageId), topic: choice(r.topic, ['workspace', 'general']) };
}
function validateState(state: State): void {
  record(state, ['version', 'entries', 'runs']);
  if (state.version !== 1 || !Array.isArray(state.entries) || state.entries.length > 128
    || !Array.isArray(state.runs) || state.runs.length > 8) throw new Error('Invalid briefing state');
  const runs = new Map<string, number>();
  for (const run of state.runs) {
    record(run, ['run', 'sequence']); runId(run.run); sequence(run.sequence);
    if (runs.has(run.run)) throw new Error('Invalid briefing state');
    runs.set(run.run, run.sequence);
  }
  const keys = new Set<string>();
  let last = 0;
  for (const entry of state.entries) {
    record(entry, ['run', 'sequence', 'hash', 'at', 'parts', 'status', 'receipts']);
    runId(entry.run); sequence(entry.sequence);
    choice(entry.status, ['sending', 'delivered', 'uncertain']);
    const key = `${entry.run}:${entry.sequence}`;
    if (keys.has(key) || !runs.has(entry.run) || entry.sequence > runs.get(entry.run)!
      || typeof entry.hash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.hash)
      || !Number.isSafeInteger(entry.at) || entry.at < last
      || !Number.isInteger(entry.parts) || entry.parts < 1 || entry.parts > briefingLimits.parts
      || !Array.isArray(entry.receipts) || entry.receipts.length > entry.parts
      || (entry.status === 'delivered' && entry.receipts.length !== entry.parts)) throw new Error('Invalid briefing state');
    entry.receipts.forEach(receipt); keys.add(key); last = entry.at;
  }
}

/** One-shot explicit producer adapter. No log/model scraping, poller, retry worker or server lifecycle. */
export async function publishBriefing(
  input: unknown,
  send: (text: string) => Promise<DeliveryReceipt>,
  file = path.join(telegramStateDirectory, 'briefings.json'),
  now = Date.now(),
): Promise<BriefingResult> {
  const event = validateBriefing(input);
  const parts = renderBriefing(event);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid briefing clock');
  const { run: _run, sequence: _sequence, ...semantic } = event;
  const hash = createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
  return withTelegramState<State, BriefingResult>(file, () => ({ version: 1, entries: [], runs: [] }), async (state, save) => {
    validateState(state);
    const sameSequence = state.entries.find(entry => entry.run === event.run && entry.sequence === event.sequence);
    if (sameSequence && sameSequence.hash !== hash) throw new Error('Briefing sequence conflict');
    const unresolved = state.entries.find(entry => entry.run === event.run && entry.status !== 'delivered');
    if (unresolved) return { status: 'uncertain', acknowledgedParts: unresolved.receipts.length };
    const prior = sameSequence ?? state.entries.find(entry => entry.run === event.run && entry.hash === hash);
    if (prior) return { status: 'duplicate', acknowledgedParts: prior.receipts.length };
    let run = state.runs.find(item => item.run === event.run);
    if (event.sequence <= (run?.sequence ?? 0)) return { status: 'duplicate', acknowledgedParts: 0 };
    if (!run && state.runs.length >= 8) throw new Error('Briefing run capacity reached; inspect locally');
    const latest = state.entries[state.entries.length - 1];
    if (latest && now - latest.at < briefingLimits.intervalMs) return {
      status: 'deferred', acknowledgedParts: 0, retryAfterMs: briefingLimits.intervalMs - (now - latest.at),
    };
    const recent = state.entries.filter(entry => now - entry.at < 86400000);
    if (recent.reduce((sum, entry) => sum + entry.parts, 0) + parts.length > briefingLimits.dailyMessages) return {
      status: 'deferred', acknowledgedParts: 0, retryAfterMs: Math.max(1, 86400000 - (now - recent[0].at)),
    };
    // Retain semantic dedup history until bounded capacity; never evict an unresolved reservation.
    if (state.entries.length === 128) {
      const oldest = state.entries.findIndex(entry => entry.status === 'delivered' && now - entry.at >= 86400000);
      if (oldest < 0) throw new Error('Briefing state capacity reached; inspect locally');
      state.entries.splice(oldest, 1);
    }
    const entry: Entry = { run: event.run, sequence: event.sequence, hash, at: now, parts: parts.length,
      status: 'sending', receipts: [] };
    state.entries.push(entry);
    if (run) run.sequence = event.sequence;
    else { run = { run: event.run, sequence: event.sequence }; state.runs.push(run); }
    await save(); // All part budget and identity are durable BEFORE the first side effect.
    try {
      for (const part of parts) {
        entry.receipts.push(receipt(await send(part)));
        await save(); // Persist each acknowledgement; partial reports are not silently completed on replay.
      }
      entry.status = 'delivered';
      await save();
      return { status: 'delivered', receipts: [...entry.receipts] };
    } catch {
      entry.status = 'uncertain';
      await save();
      return { status: 'uncertain', acknowledgedParts: entry.receipts.length };
    }
  });
}
