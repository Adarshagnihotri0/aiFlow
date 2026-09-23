import { createHash, randomBytes } from 'crypto';
import path from 'path';
import { telegramStateDirectory, withTelegramState } from './telegram-state';

export const actionCodes = ['review-comments', 'review-groups', 'review-reels', 'review-nearby', 'validate-compile', 'pause-work', 'resume-work'] as const;
type ActionCode = typeof actionCodes[number];
type Status = 'awaiting_confirmation' | 'queued' | 'in_progress' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'blocked';
interface Action {
  id: string; action: ActionCode; principal: string; confirmationHash: string;
  status: Status; createdAt: number; expiresAt: number;
}
interface State { version: 1; lastUpdate: number; actions: Action[] }
export interface ActionMessage {
  updateId: number; chatId: string; userId: string; threadId: number;
  isBot?: boolean; workspace: string; command: string; argument: string;
}
export interface InboxOptions {
  chatId: string;
  // Missing/empty explicit allowlist falls back to the configured chat's creator.
  allowedUsers: string[];
  isChatCreator: (userId: string) => Promise<boolean>;
  file?: string;
  now?: () => number;
}
export const actionHelp = [
  '**Hopper action inbox (no automatic execution)**',
  `/action <code> — ${actionCodes.join(', ')}`,
  '/confirm <request-id> <challenge> — queue the exact request within 10 minutes',
  '/cancel <request-id> — cancel an unstarted request',
  '/actions — show your latest requests in this topic',
  'Approved means queued, not running. A local main agent must explicitly pick it up.',
  'No free-text tasks, shell, deletion, publication, or secret operations are supported.',
].join('\n');
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const defaultFile = path.join(telegramStateDirectory, 'actions.json');
const terminal = new Set<Status>(['succeeded', 'failed', 'cancelled', 'expired', 'blocked']);
function validateState(state: State): void {
  if (state.version !== 1 || !Number.isSafeInteger(state.lastUpdate) || !Array.isArray(state.actions)
    || state.actions.length > 100 || state.actions.some(a => !actionCodes.includes(a.action)
      || !/^[a-f0-9]{16}$/.test(a.id) || !/^[a-f0-9]{64}$/.test(a.principal)
      || !['awaiting_confirmation', 'queued', 'in_progress', ...terminal].includes(a.status)
      || !Number.isFinite(a.expiresAt))) throw new Error('Invalid action state');
}
function expire(state: State, now: number): void {
  for (const action of state.actions) {
    if (!terminal.has(action.status) && now >= action.expiresAt) {
      action.status = action.status === 'in_progress' ? 'blocked' : 'expired';
      action.confirmationHash = '';
    }
  }
}
function publicAction(a: Action): { id: string; action: ActionCode; status: Status } {
  return { id: a.id, action: a.action, status: a.status };
}

export async function handleActionMessage(message: ActionMessage, options: InboxOptions): Promise<string> {
  // No message payload, chat/user identifiers, workspace paths or tokens enter logs/state.
  if (!options.chatId || message.chatId !== options.chatId || message.isBot
    || !/^\d+$/.test(message.userId) || !Number.isSafeInteger(message.threadId) || message.threadId < 1
    || !message.workspace || !Number.isSafeInteger(message.updateId) || message.updateId < 1) return 'Action access denied.';
  const permitted = options.allowedUsers.length > 0
    ? options.allowedUsers.includes(message.userId)
    : await options.isChatCreator(message.userId);
  if (!permitted) return 'Action access denied.';
  if (!['action', 'confirm', 'cancel', 'actions'].includes(message.command)) return actionHelp;
  if (message.argument.length > 160) return 'Invalid action command.';
  const now = options.now?.() ?? Date.now();
  const principal = digest(JSON.stringify([message.chatId, message.userId, message.threadId, message.workspace]));
  return withTelegramState<State, string>(options.file ?? defaultFile,
    () => ({ version: 1, lastUpdate: 0, actions: [] }), async (state, save) => {
      validateState(state);
      expire(state, now);
      // Telegram update IDs are monotonically consumed by the existing single poller.
      // Retain the high-water mark even when old terminal records are evicted.
      if (message.updateId <= state.lastUpdate) return 'Update already handled; use /actions for current status.';
      state.lastUpdate = message.updateId;
      let reply: string;
      if (message.command === 'actions') {
        const actions = state.actions.filter(a => a.principal === principal).slice(-10);
        reply = actions.length ? actions.map(a => `${a.id} | ${a.action} | ${a.status}`).join('\n') : 'No requests in this topic.';
      } else if (message.command === 'action') {
        if (!actionCodes.includes(message.argument as ActionCode)) {
          reply = actionHelp;
        } else if (state.actions.filter(a => !terminal.has(a.status)).length >= 32) {
          reply = 'Action inbox full; wait for local pickup or cancel an unstarted request.';
        } else {
          const existing = state.actions.find(a => a.principal === principal && a.action === message.argument && !terminal.has(a.status));
          if (existing) {
            reply = `${existing.id} | ${existing.action} | ${existing.status}. Use /cancel then /action if the confirmation was lost.`;
          } else {
            const id = randomBytes(8).toString('hex');
            const challenge = randomBytes(16).toString('hex');
            const action: Action = { id, action: message.argument as ActionCode, principal,
              confirmationHash: digest(`${id}:${principal}:${message.argument}:${challenge}`),
              status: 'awaiting_confirmation', createdAt: now, expiresAt: now + 600000 };
            state.actions.push(action);
            // Never evict active work. Only bounded terminal history can be dropped.
            while (state.actions.length > 100) state.actions.splice(state.actions.findIndex(a => terminal.has(a.status)), 1);
            reply = `Request ${id}: ${action.action}\nNo work has run. Confirm within 10 minutes:\n/confirm ${id} ${challenge}\nApproval queues work for explicit main-agent pickup only.`;
          }
        }
      } else {
        const parts = message.argument.split(/\s+/);
        const action = state.actions.find(a => a.id === parts[0] && a.principal === principal);
        if (!action) reply = 'No matching request for this user, topic and workspace.';
        else if (message.command === 'cancel') {
          if (parts.length !== 1 || !['awaiting_confirmation', 'queued'].includes(action.status)) reply = 'Request cannot be cancelled here; in-progress work needs local coordination.';
          else { action.status = 'cancelled'; action.confirmationHash = ''; reply = `${action.id} | cancelled`; }
        } else if (parts.length !== 2 || action.status !== 'awaiting_confirmation'
          || !/^[a-f0-9]{32}$/.test(parts[1])
          || digest(`${action.id}:${principal}:${action.action}:${parts[1]}`) !== action.confirmationHash) {
          reply = 'Confirmation invalid, expired, or already consumed.';
        } else {
          action.status = 'queued'; action.confirmationHash = ''; action.expiresAt = now + 86400000;
          reply = `${action.id} | ${action.action} | queued\nNot executing. Waiting for explicit main-agent pickup.`;
        }
      }
      await save();
      return reply;
    });
}

export async function readActionCursor(file = defaultFile): Promise<number> {
  return withTelegramState<State, number>(file, () => ({ version: 1, lastUpdate: 0, actions: [] }), async state => {
    validateState(state);
    return state.lastUpdate;
  });
}
export async function recordActionCursor(updateId: number, file = defaultFile): Promise<void> {
  if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error('Invalid polling cursor');
  return withTelegramState<State, void>(file, () => ({ version: 1, lastUpdate: 0, actions: [] }), async (state, save) => {
    validateState(state);
    state.lastUpdate = Math.max(state.lastUpdate, updateId);
    await save();
  });
}

// Local-only coordination API. These methods never spawn a process or execute an action.
export async function inspectActions(file = defaultFile, now = Date.now()): Promise<ReturnType<typeof publicAction>[]> {
  return withTelegramState<State, ReturnType<typeof publicAction>[]>(file,
    () => ({ version: 1, lastUpdate: 0, actions: [] }), async (state, save) => {
      validateState(state); expire(state, now); await save(); return state.actions.map(publicAction);
    });
}
export async function transitionAction(
  id: string, status: 'in_progress' | 'succeeded' | 'failed' | 'blocked', file = defaultFile, now = Date.now(),
): Promise<ReturnType<typeof publicAction>> {
  return withTelegramState<State, ReturnType<typeof publicAction>>(file,
    () => ({ version: 1, lastUpdate: 0, actions: [] }), async (state, save) => {
      validateState(state); expire(state, now);
      const action = state.actions.find(a => a.id === id);
      if (!action || (status === 'in_progress' ? action.status !== 'queued' : action.status !== 'in_progress')) throw new Error('Invalid action transition');
      if (!['in_progress', 'succeeded', 'failed', 'blocked'].includes(status)) throw new Error('Invalid action status');
      action.status = status;
      action.expiresAt = now + 30 * 60000;
      await save();
      return publicAction(action);
    });
}
