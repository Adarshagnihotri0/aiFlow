import https from 'https';
import { STATIC_MODEL_ID } from './adapters';
import { forwardTelegramThreadText } from './services/telegram-forwarder';
import {
  createPendingWork, PendingWork, resolveWorkspace, runWorkspaceAgent, runWorkspaceCheck, workspaceFingerprint,
} from './services/workspace-agent';
import { actionHelp, handleActionMessage, readActionCursor, recordActionCursor } from './services/telegram-action-inbox';
import { TelegramInference } from './services/telegram-inference';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED !== 'false';
const MAX_PROMPT_LENGTH = 12000;
const TELEGRAM_REQUEST_TIMEOUT_MS = 35000;
const LEGACY_COMMANDS = ['work', 'workconfirm', 'workcancel', 'check'];

interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  text?: string;
  from?: {
    id?: number;
    is_bot?: boolean;
  };
  chat?: {
    id?: number;
  };
}

interface TelegramChatMember {
  status?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

const inference = new TelegramInference();
const pendingWork = new Map<string, PendingWork>();
const allowedActionUsers = (process.env.TELEGRAM_ACTION_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
let lastUpdateId = 0;
let isProcessing = false;
let pollingStarted = false;
let pollRetryDelayMs = 1000;
let lastTelegramError = 0;
const ERROR_LOG_INTERVAL_MS = 60000;

function logTelegramError(context: string, error: unknown): void {
  const now = Date.now();
  if (now - lastTelegramError <= ERROR_LOG_INTERVAL_MS) return;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Telegram] ${context}: ${message}`);
  lastTelegramError = now;
}

function telegramRequest<T>(method: string, payload: Record<string, unknown>, timeout = 10000): Promise<T> {
  if (!TOKEN) return Promise.reject(new Error('TELEGRAM_BOT_TOKEN is not configured'));
  const body = JSON.stringify(payload);

  return new Promise<T>((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}/${method}`,
        method: 'POST',
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let responseBody = '';
        response.on('data', (chunk) => {
          responseBody += String(chunk);
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody) as {
              ok?: boolean;
              result?: T;
              description?: string;
            };
            if (parsed.ok && parsed.result !== undefined) {
              resolve(parsed.result);
              return;
            }
            reject(new Error(parsed.description || `Telegram API returned HTTP ${response.statusCode ?? 'unknown'}`));
          } catch {
            reject(new Error(`Telegram API returned HTTP ${response.statusCode ?? 'unknown'}`));
          }
        });
      },
    );

    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Telegram request timed out')));
    request.end(body);
  });
}

async function getUpdates(): Promise<TelegramUpdate[]> {
  try {
    const updates = await telegramRequest<TelegramUpdate[]>(
      'getUpdates',
      {
        offset: lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ['message'],
      },
      TELEGRAM_REQUEST_TIMEOUT_MS,
    );
    pollRetryDelayMs = 1000;
    return updates;
  } catch {
    logTelegramError('Polling unavailable; retrying with bounded backoff', new Error('Transport failure'));
    await new Promise(resolve => setTimeout(resolve, pollRetryDelayMs));
    pollRetryDelayMs = Math.min(30000, pollRetryDelayMs * 2);
    return [];
  }
}

async function discardPendingUpdates(): Promise<void> {
  const pending = await telegramRequest<TelegramUpdate[]>('getUpdates', {
    offset: -1,
    timeout: 0,
    allowed_updates: ['message'],
  });
  for (const update of pending) {
    lastUpdateId = Math.max(lastUpdateId, update.update_id);
  }
}

async function registerCommands(): Promise<void> {
  await telegramRequest<boolean>('setMyCommands', {
    commands: [
      { command: 'ask', description: 'Ask GLM-5 in this workspace topic' },
      { command: 'action', description: 'Request an allowlisted action for local agent pickup' },
      { command: 'actions', description: 'Show your action request statuses' },
      { command: 'confirm', description: 'Queue an exact request; does not execute it' },
      { command: 'cancel', description: 'Cancel an unstarted action request' },
      { command: 'work', description: 'Creator only: plan workspace changes' },
      { command: 'workconfirm', description: 'Creator only: execute a pending workspace plan' },
      { command: 'workcancel', description: 'Creator only: cancel a pending workspace plan' },
      { command: 'check', description: 'Creator only: run a configured workspace check' },
      { command: 'clear', description: 'Clear this topic conversation' },
      { command: 'history', description: 'Show this topic history size' },
      { command: 'status', description: 'Show last actual question inference outcome' },
      { command: 'help', description: 'Show available phone commands' },
    ],
  });
}

async function sendTypingAction(messageThreadId?: number): Promise<void> {
  if (!CHAT_ID) return;
  const payload: Record<string, unknown> = {
    chat_id: CHAT_ID,
    action: 'typing',
  };
  if (messageThreadId !== undefined) payload['message_thread_id'] = messageThreadId;
  await telegramRequest<boolean>('sendChatAction', payload);
}

function conversationKey(messageThreadId?: number): string {
  return messageThreadId === undefined ? 'general' : String(messageThreadId);
}

function parseCommand(text: string): { command?: string; argument: string } {
  const match = text.trim().match(/^\/([a-z]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return { argument: text.trim() };
  return {
    command: match[1].toLowerCase(),
    argument: (match[2] || '').trim(),
  };
}

function helpText(): string {
  return [actionHelp, '', '**Separate creator-only workspace commands**',
    '/work <request> — read-only plan in this mapped workspace topic',
    '/workconfirm <token> — execute that plan; single use, expires in 10 minutes',
    '/workcancel <token> — cancel that plan (not an inbox request)',
    '/check <name> — run only an administrator-configured check; defaults to build',
    '/confirm and /cancel are inbox-only; they never execute a workspace plan.', '',
    '/ask <message> — independent model conversation, no workspace tools or VS Code session access',
    '/clear — clear topic conversation', '/history — history size', '/status — last actual question inference',
    'The inbox requires explicit local pickup; it does not control the current VS Code session.'].join('\n');
}

async function isChatCreator(userId?: number): Promise<boolean> {
  if (!userId || !CHAT_ID) return false;
  const member = await telegramRequest<TelegramChatMember>('getChatMember', {
    chat_id: CHAT_ID,
    user_id: userId,
  });
  return member.status === 'creator';
}

async function isAuthorizedUser(userId?: number): Promise<boolean> {
  if (!userId) return false;
  return allowedActionUsers.length > 0
    ? allowedActionUsers.includes(String(userId))
    : isChatCreator(userId);
}

async function processWorkspaceCommand(
  command: string, argument: string, message: TelegramMessage, updateId: number,
): Promise<string> {
  if (!(await isAuthorizedUser(message.from?.id))) return 'Action access denied.';
  const workspace = await resolveWorkspace(message.message_thread_id);
  if (!workspace) return 'This topic is not enabled for action intake.';
  // This integration is intentionally scoped to Hopper, never another mapped repository.
  if (workspace.root !== '/Users/adarshagnihotri/Desktop/grasshopper/bitchat-android') {
    return 'This inbox supports only the configured Hopper workspace.';
  }
  return handleActionMessage({
    updateId, chatId: String(message.chat?.id ?? ''), userId: String(message.from?.id ?? ''),
    threadId: message.message_thread_id ?? 0, workspace: workspace.root,
    isBot: message.from?.is_bot, command, argument,
  }, { chatId: CHAT_ID ?? '', allowedUsers: allowedActionUsers, isChatCreator: id => isChatCreator(Number(id)) });
}

// Restored HEAD workspace-agent flow. It is deliberately separate from the durable action inbox.
// Called only after creator authorization in handleTelegramMessage.
async function processLegacyWorkspaceCommand(command: string, argument: string, message: TelegramMessage): Promise<string> {
  const ownerId = message.from!.id!;
  const threadId = message.message_thread_id;
  if (threadId === undefined) return 'Run project commands inside a configured workspace topic.';
  for (const [token, pending] of pendingWork) {
    if (pending.expiresAt <= Date.now()) pendingWork.delete(token);
  }

  if (command === 'workcancel' || command === 'workconfirm') {
    const pending = pendingWork.get(argument);
    if (!pending || pending.ownerId !== ownerId || pending.threadId !== threadId) {
      return 'No matching pending project request was found (wrong owner/topic, expired, or consumed).';
    }
    pendingWork.delete(argument); // Consume before any asynchronous work; failure never makes a token reusable.
    if (command === 'workcancel') return '**Project request cancelled.**';
    const workspace = await resolveWorkspace(threadId);
    if (!workspace || workspace.root !== pending.workspace.root || workspace.topicId !== pending.threadId) {
      return 'Workspace binding changed or disabled. Run /work again for a fresh plan.';
    }
    const currentFingerprint = await workspaceFingerprint(workspace);
    if (pending.expiresAt <= Date.now()) return 'Project confirmation expired. Run /work again for a fresh plan.';
    if (currentFingerprint !== pending.fingerprint) {
      return 'The workspace changed after the plan was created. Run /work again to review a fresh plan.';
    }
    const result = await runWorkspaceAgent(workspace, pending.request, 'execute');
    return `**Workspace agent returned for ${workspace.name}**\n\n${result}\n\nReview reported changes; completion is not independently verified. Run /check build to validate.`;
  }

  const workspace = await resolveWorkspace(threadId);
  if (!workspace) return 'This topic is not enabled for project execution.';
  if (command === 'check') {
    const checkName = argument || 'build';
    const result = await runWorkspaceCheck(workspace, checkName);
    return `**${workspace.name}: ${checkName} check exited successfully**\n\n${result}`;
  }
  if (!argument) return 'Usage: `/work describe the project change`';
  if (argument.length > MAX_PROMPT_LENGTH) return `Request is too long. Keep it under ${MAX_PROMPT_LENGTH} characters.`;
  const fingerprint = await workspaceFingerprint(workspace);
  const plan = await runWorkspaceAgent(workspace, argument, 'plan');
  const pending = createPendingWork(argument, ownerId, threadId, workspace, fingerprint);
  pendingWork.set(pending.token, pending);
  return [
    `**Project plan for ${workspace.name}**`, '', plan, '',
    'Read-only planning completed; no edit execution was requested.',
    `Confirm within 10 minutes with /workconfirm ${pending.token}`,
    `Cancel with /workcancel ${pending.token}`,
    '/confirm and /cancel apply only to the separate action inbox.',
  ].join('\n');
}

async function processMessage(text: string, key: string, message: TelegramMessage, updateId: number): Promise<string> {
  const { command, argument } = parseCommand(text);

  if (command && ['action', 'actions', 'confirm', 'cancel'].includes(command)) {
    return processWorkspaceCommand(command, argument, message, updateId);
  }
  if (command && LEGACY_COMMANDS.includes(command)) {
    try {
      return await processLegacyWorkspaceCommand(command, argument, message);
    } catch {
      // A subprocess error can contain private workspace text; never relay/log it.
      console.error('[Telegram] Workspace operation failed; completion unverified');
      return 'Workspace operation failed; completion is not confirmed. A /workconfirm token is consumed even on failure. Review locally before requesting a new plan.';
    }
  }
  if (command === 'help' || command === 'start') return helpText();
  if (command === 'status') return `Model: \`${STATIC_MODEL_ID}\`\n\n${inference.status(key)}`;
  if (command === 'clear' || command === 'reset') {
    inference.clear(key);
    return '**Conversation cleared**\n\nOnly this Telegram topic history was reset; inference outcomes are retained.';
  }
  if (command === 'history') return `This topic currently has **${inference.historyLength(key)}** conversation messages.`;
  if (command && command !== 'ask') return helpText();

  const prompt = command === 'ask' ? argument : argument.replace(/^@Hopperchatbot\s*/i, '').trim();
  if (!prompt) return 'Usage: `/ask describe what you need`';
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return `Message is too long. Keep it under **${MAX_PROMPT_LENGTH.toLocaleString()} characters**.`;
  }
  return inference.ask(key, prompt);
}

/** Single-message dispatch, also usable by offline tests without starting a poller. */
export async function handleTelegramMessage(message: TelegramMessage, updateId: number): Promise<string | undefined> {
  if (message.from?.is_bot || !CHAT_ID || message.chat?.id?.toString() !== CHAT_ID || !message.text?.trim()) return undefined;
  const { command } = parseCommand(message.text);
  let authorized = false;
  try {
    authorized = command && LEGACY_COMMANDS.includes(command)
      ? await isChatCreator(message.from?.id)
      : await isAuthorizedUser(message.from?.id);
  } catch {
    // Membership lookup failure denies access without workspace/model effects or raw API diagnostics.
    return undefined;
  }
  if (!authorized) return undefined;
  await sendTypingAction(message.message_thread_id).catch(() => undefined);
  return processMessage(message.text.trim(), conversationKey(message.message_thread_id), message, updateId);
}

export async function startTelegramPolling(): Promise<void> {
  if (pollingStarted) return;
  if (!TELEGRAM_ENABLED) {
    console.log('[Telegram] Inbound polling disabled by TELEGRAM_ENABLED=false');
    return;
  }
  if (!TOKEN || !CHAT_ID) {
    console.log('[Telegram] Inbound polling disabled: bot token and chat ID are required');
    return;
  }
  pollingStarted = true;
  // State must be readable before consuming any updates. No startup catch-and-continue.
  lastUpdateId = await readActionCursor();
  if (lastUpdateId === 0) {
    await discardPendingUpdates();
    await recordActionCursor(lastUpdateId);
  }
  await registerCommands();
  console.log('[Telegram] Single-consumer polling started; inbox queue-only; legacy workspace commands creator-only');

  while (true) {
    const updates = await getUpdates();
    for (const update of updates) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      const message = update.message;
      if (!message || isProcessing) {
        await recordActionCursor(lastUpdateId);
        continue;
      }
      isProcessing = true;
      try {
        const response = await handleTelegramMessage(message, update.update_id);
        if (response !== undefined) {
          await forwardTelegramThreadText('Hopper', response, message.message_thread_id);
          console.log('[Telegram] Authorized response processed');
        }
      } finally {
        isProcessing = false;
      }
      // If processing/persistence fails, stop polling rather than advancing an unrecorded action.
      await recordActionCursor(lastUpdateId);
    }
  }
}

export function clearHistory(): void {
  inference.clear();
}

export function getHistoryLength(): number {
  return inference.historyLength();
}
