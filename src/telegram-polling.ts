import https from 'https';
import { STATIC_MODEL_ID } from './adapters';
import { invokeModelOpenAI } from './bedrock';
import { forwardTelegramThreadText } from './services/telegram-forwarder';
import {
  createPendingWork,
  PendingWork,
  resolveWorkspace,
  runWorkspaceAgent,
  runWorkspaceCheck,
  workspaceFingerprint,
} from './services/workspace-agent';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED !== 'false';
const MAX_PROMPT_LENGTH = 12000;
const MAX_HISTORY_MESSAGES = 20;
const TELEGRAM_REQUEST_TIMEOUT_MS = 35000;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

const histories = new Map<string, ConversationMessage[]>();
const pendingWork = new Map<string, PendingWork>();
let lastUpdateId = 0;
let isProcessing = false;
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
    return await telegramRequest<TelegramUpdate[]>(
      'getUpdates',
      {
        offset: lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ['message'],
      },
      TELEGRAM_REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    logTelegramError('Polling failed', error);
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
      { command: 'work', description: 'Plan project work for confirmation' },
      { command: 'confirm', description: 'Confirm a pending project change' },
      { command: 'cancel', description: 'Cancel a pending project change' },
      { command: 'check', description: 'Run a configured project check' },
      { command: 'clear', description: 'Clear this topic conversation' },
      { command: 'history', description: 'Show this topic history size' },
      { command: 'status', description: 'Show bot and model status' },
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
  return [
    '**Phone commands**',
    '',
    '`/ask <message>` - ask GLM-5 in this topic',
    '`/work <request>` - create an owner-only project plan',
    '`/confirm <token>` - approve the planned file changes',
    '`/cancel <token>` - cancel pending work',
    '`/check build` - run this workspace build check',
    '`/clear` - clear only this topic history',
    '`/history` - show this topic history size',
    '`/status` - show the active model',
    '`/help` - show these commands',
    '',
    'Project work is restricted to the group creator, the workspace mapped to this topic, and a 10-minute single-use confirmation.',
  ].join('\n');
}

async function isChatCreator(userId?: number): Promise<boolean> {
  if (!userId || !CHAT_ID) return false;
  const member = await telegramRequest<TelegramChatMember>('getChatMember', {
    chat_id: CHAT_ID,
    user_id: userId,
  });
  return member.status === 'creator';
}

function removeExpiredWork(): void {
  const now = Date.now();
  for (const [token, pending] of pendingWork) {
    if (pending.expiresAt <= now) pendingWork.delete(token);
  }
}

async function processWorkspaceCommand(
  command: string,
  argument: string,
  message: TelegramMessage,
): Promise<string> {
  const ownerId = message.from?.id;
  const threadId = message.message_thread_id;
  if (!(await isChatCreator(ownerId))) {
    return 'Project commands are restricted to the Telegram group creator.';
  }
  if (!ownerId || threadId === undefined) {
    return 'Run project commands inside a configured workspace topic.';
  }

  removeExpiredWork();
  if (command === 'cancel') {
    const pending = pendingWork.get(argument);
    if (!pending || pending.ownerId !== ownerId || pending.threadId !== threadId) {
      return 'No matching pending project request was found.';
    }
    pendingWork.delete(argument);
    return '**Project request cancelled.**';
  }

  if (command === 'confirm') {
    const pending = pendingWork.get(argument);
    if (!pending || pending.ownerId !== ownerId || pending.threadId !== threadId) {
      return 'No matching pending project request was found.';
    }
    pendingWork.delete(argument);
    const currentFingerprint = await workspaceFingerprint(pending.workspace);
    if (currentFingerprint !== pending.fingerprint) {
      return 'The workspace changed after the plan was created. Run `/work` again to review a fresh plan.';
    }
    const result = await runWorkspaceAgent(pending.workspace, pending.request, 'execute');
    return `**Project changes completed in ${pending.workspace.name}**\n\n${result}\n\nRun \`/check build\` to validate.`;
  }

  const workspace = await resolveWorkspace(threadId);
  if (!workspace) {
    return 'This topic is not enabled for project execution.';
  }

  if (command === 'check') {
    const checkName = argument || 'build';
    const result = await runWorkspaceCheck(workspace, checkName);
    return `**${workspace.name}: ${checkName} passed**\n\n${result}`;
  }

  if (!argument) return 'Usage: `/work describe the project change`';
  if (argument.length > MAX_PROMPT_LENGTH) {
    return `Request is too long. Keep it under **${MAX_PROMPT_LENGTH.toLocaleString()} characters**.`;
  }
  const fingerprint = await workspaceFingerprint(workspace);
  const plan = await runWorkspaceAgent(workspace, argument, 'plan');
  const pending = createPendingWork(argument, ownerId, threadId, workspace, fingerprint);
  pendingWork.set(pending.token, pending);
  return [
    `**Project plan for ${workspace.name}**`,
    '',
    plan,
    '',
    'No files have changed.',
    `Confirm within 10 minutes with \`/confirm ${pending.token}\``,
    `Cancel with \`/cancel ${pending.token}\``,
  ].join('\n');
}

async function processMessage(text: string, key: string, message: TelegramMessage): Promise<string> {
  const { command, argument } = parseCommand(text);

  if (command && ['work', 'confirm', 'cancel', 'check'].includes(command)) {
    return processWorkspaceCommand(command, argument, message);
  }

  if (command === 'help' || command === 'start') return helpText();
  if (command === 'status') {
    return `**Ready**\n\nModel: \`${STATIC_MODEL_ID}\`\nTopic history: ${histories.get(key)?.length ?? 0} messages`;
  }
  if (command === 'clear' || command === 'reset') {
    histories.delete(key);
    return '**Conversation cleared**\n\nOnly this Telegram topic was reset.';
  }
  if (command === 'history') {
    return `This topic currently has **${histories.get(key)?.length ?? 0}** conversation messages.`;
  }
  if (command && command !== 'ask') return helpText();

  const prompt = command === 'ask' ? argument : argument.replace(/^@Hopperchatbot\s*/i, '').trim();
  if (!prompt) return 'Usage: `/ask describe what you need`';
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return `Message is too long. Keep it under **${MAX_PROMPT_LENGTH.toLocaleString()} characters**.`;
  }

  const history = histories.get(key) || [];
  history.push({ role: 'user', content: prompt });
  if (history.length > MAX_HISTORY_MESSAGES) history.splice(0, history.length - MAX_HISTORY_MESSAGES);

  try {
    const response = await invokeModelOpenAI({
      messages: [
        {
          role: 'system',
          content: 'You are Hopper, a concise engineering assistant replying through Telegram. Use Markdown. You may analyze, explain, and plan, but do not claim to have edited files, run commands, or completed actions because this Telegram channel has no workspace tools.',
        },
        ...history,
      ],
      max_tokens: 2000,
      temperature: 0.4,
    });
    const choices = response['choices'] as Array<{ message?: { content?: string } }> | undefined;
    const responseText = choices?.[0]?.message?.content?.trim() || 'The model returned no text response.';
    history.push({ role: 'assistant', content: responseText });
    if (history.length > MAX_HISTORY_MESSAGES) history.splice(0, history.length - MAX_HISTORY_MESSAGES);
    histories.set(key, history);
    return responseText;
  } catch (error) {
    logTelegramError('Model request failed', error);
    history.pop();
    histories.set(key, history);
    return 'The model request failed. Please try again in a moment.';
  }
}

export async function startTelegramPolling(): Promise<void> {
  if (!TELEGRAM_ENABLED) {
    console.log('[Telegram] Inbound polling disabled by TELEGRAM_ENABLED=false');
    return;
  }
  if (!TOKEN || !CHAT_ID) {
    console.log('[Telegram] Inbound polling disabled: bot token and chat ID are required');
    return;
  }

  try {
    await discardPendingUpdates();
    await registerCommands();
  } catch (error) {
    logTelegramError('Startup synchronization failed', error);
  }

  console.log('[Telegram] Bidirectional topic polling started');
  console.log('[Telegram] Phone entry point: /ask <message>');

  while (true) {
    const updates = await getUpdates();
    for (const update of updates) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      const message = update.message;
      if (!message || message.from?.is_bot) continue;
      if (message.chat?.id?.toString() !== CHAT_ID) continue;
      const text = message.text?.trim();
      if (!text || isProcessing) continue;

      isProcessing = true;
      const messageThreadId = message.message_thread_id;
      const key = conversationKey(messageThreadId);
      const startedAt = Date.now();

      try {
        await sendTypingAction(messageThreadId).catch(() => undefined);
        const response = await processMessage(text, key, message);
        await forwardTelegramThreadText('Hopper | GLM-5', response, messageThreadId);
        console.log(`[Telegram] Replied in topic ${key} after ${Date.now() - startedAt}ms`);
      } catch (error) {
        logTelegramError('Message processing failed', error);
      } finally {
        isProcessing = false;
      }
    }
  }
}

export function clearHistory(): void {
  histories.clear();
}

export function getHistoryLength(): number {
  return Array.from(histories.values()).reduce((total, history) => total + history.length, 0);
}
