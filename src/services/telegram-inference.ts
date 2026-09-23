import { invokeModelOpenAI } from '../bedrock';

export const TELEGRAM_MODEL_TIMEOUT_MS = 60_000;
const MAX_HISTORY_MESSAGES = 20;
const SAFE_CAUSE_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'EMPTY_RESPONSE',
]);

type Turn = { role: 'user' | 'assistant'; content: string };
type InferenceResult = { outcome: 'success' | 'failure'; at: string; durationMs: number; code?: string; httpStatus?: number };
type TopicState = { history: Turn[]; last?: InferenceResult; lastSuccess?: string; lastFailure?: string; pending: boolean };
type Invoke = (body: Record<string, unknown>, signal?: AbortSignal) => Promise<Record<string, unknown>>;

// Never use an upstream message, stack, URL, body, or arbitrary cause.code in diagnostics.
export function safeInferenceFailure(error: unknown, timedOut: boolean): { code: string; httpStatus?: number } {
  if (timedOut) return { code: 'TIMEOUT' };
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const fields = current as { code?: unknown; status?: unknown; cause?: unknown; name?: unknown };
    if (typeof fields.status === 'number' && Number.isInteger(fields.status) && fields.status >= 400 && fields.status <= 599) {
      return { code: 'HTTP_ERROR', httpStatus: fields.status };
    }
    if (typeof fields.code === 'string' && SAFE_CAUSE_CODES.has(fields.code)) return { code: fields.code };
    if (fields.name === 'AbortError') return { code: 'ABORTED' };
    if (fields.name === 'SyntaxError') return { code: 'INVALID_RESPONSE' };
    current = fields.cause;
  }
  return { code: 'UNKNOWN' };
}

/** Process-local question state only; no workspace tools, retry worker, or Telegram I/O. */
export class TelegramInference {
  private readonly topics = new Map<string, TopicState>();

  constructor(private readonly invoke: Invoke = invokeModelOpenAI, private readonly timeoutMs = TELEGRAM_MODEL_TIMEOUT_MS) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TELEGRAM_MODEL_TIMEOUT_MS) {
      throw new Error('Invalid Telegram inference timeout');
    }
  }

  clear(key?: string): void {
    // Clear conversation only: actual inference outcomes remain truthful until process restart.
    for (const [topic, state] of this.topics) {
      if (key === undefined || topic === key) state.history = [];
    }
  }

  historyLength(key?: string): number {
    if (key !== undefined) return this.topics.get(key)?.history.length ?? 0;
    return Array.from(this.topics.values()).reduce((total, state) => total + state.history.length, 0);
  }

  status(key: string): string {
    const state = this.topics.get(key);
    const last = state?.last;
    return [
      'Telegram question inference (this topic; current process only)',
      `In progress: ${state?.pending ? 'yes' : 'no'}`,
      last ? `Last completed: ${last.outcome} at ${last.at} (${last.durationMs}ms)${last.code ? `; ${last.code}` : ''}${last.httpStatus ? `; HTTP ${last.httpStatus}` : ''}`
        : 'Last completed: none — no inference observed',
      `Last success: ${state?.lastSuccess ?? 'none observed'}`,
      `Last failure: ${state?.lastFailure ?? 'none observed'}`,
      `Topic history: ${state?.history.length ?? 0} messages`,
      `Question timeout: ${this.timeoutMs / 1000}s; no automatic retries`,
    ].join('\n');
  }

  async ask(key: string, prompt: string): Promise<string> {
    const state = this.topics.get(key) ?? { history: [], pending: false };
    if (state.pending) return 'A question is already in progress in this topic.';
    this.topics.set(key, state);
    state.pending = true;
    const originalHistory = state.history;
    // Retain complete pairs; never evict or mutate committed history on a failed request.
    const requestHistory: Turn[] = [...originalHistory.slice(-(MAX_HISTORY_MESSAGES - 2)), { role: 'user', content: prompt }];
    const controller = new AbortController();
    const startedAt = Date.now();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('Telegram inference deadline'));
      }, this.timeoutMs);
    });
    try {
      // Race also bounds a non-cooperative transport. Late resolution cannot commit history/status.
      const response = await Promise.race([this.invoke({
        messages: [
          { role: 'system', content: 'You are Hopper, a concise engineering assistant replying through Telegram. Use Markdown. This question conversation is independent of any VS Code session and has no workspace tools. You may analyze, explain, and plan, but never claim to have edited files, run commands, or completed workspace actions.' },
          ...requestHistory,
        ],
        max_tokens: 2000,
        temperature: 0.4,
      }, controller.signal), deadline]);
      const choices = response?.['choices'] as Array<{ message?: { content?: unknown } }> | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw Object.assign(new Error('No text response'), { code: 'EMPTY_RESPONSE' });
      }
      const text = content.trim();
      if (state.history === originalHistory) state.history = [...requestHistory, { role: 'assistant', content: text }];
      const at = new Date().toISOString();
      state.last = { outcome: 'success', at, durationMs: Date.now() - startedAt };
      state.lastSuccess = at;
      return text;
    } catch (error) {
      const failure = safeInferenceFailure(error, timedOut);
      const at = new Date().toISOString();
      state.last = { outcome: 'failure', at, durationMs: Date.now() - startedAt, ...failure };
      state.lastFailure = at;
      console.error('[Telegram] Question inference failed', state.last);
      return `The model request ${timedOut ? 'timed out' : 'failed'} (${failure.code}${failure.httpStatus ? `; HTTP ${failure.httpStatus}` : ''}). No conversation turn was saved. Please try again.`;
    } finally {
      clearTimeout(timer);
      state.pending = false;
    }
  }
}
