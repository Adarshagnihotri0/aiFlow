import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';

const TELEGRAM_MESSAGE_LIMIT = 3700;
const TELEGRAM_TOPIC_NAME_LIMIT = 128;
const TELEGRAM_TIMEOUT_MS = 10000;
const DEFAULT_STREAM_UPDATE_MS = 1000;
const MIN_STREAM_UPDATE_MS = 750;
const WORKSPACE_TOPICS_FILE = path.join(os.homedir(), '.copilot', 'telegram-workspace-topics.json');

export interface ChatForwardMetadata {
  model: string;
  route: string;
}

export interface AssistantStreamForwarder {
  append(text: string): void;
  finish(finalText?: string): Promise<void>;
}

interface TelegramMessage {
  message_id: number;
}

interface TelegramForumTopic {
  message_thread_id: number;
}

interface WorkspaceTopicState {
  topics: Record<string, number>;
}

let deliveryQueue: Promise<void> = Promise.resolve();

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (!block || typeof block !== 'object') return '';
      const record = block as Record<string, unknown>;
      if (record['type'] === 'text' || record['type'] === 'input_text' || record['type'] === 'output_text') {
        return typeof record['text'] === 'string' ? record['text'] : '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function extractLatestUserText(body: Record<string, unknown>): string {
  const messages = body['messages'];
  if (Array.isArray(messages)) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message || typeof message !== 'object') continue;
      const record = message as Record<string, unknown>;
      if (record['role'] === 'user') {
        const text = contentToText(record['content']).trim();
        if (text) return text;
      }
    }
  }

  if (typeof body['prompt'] === 'string') return body['prompt'].trim();
  if (typeof body['input'] === 'string') return body['input'].trim();
  return '';
}

export function extractAssistantText(response: Record<string, unknown>): string {
  const anthropicText = contentToText(response['content']).trim();
  if (anthropicText) return anthropicText;

  const choices = response['choices'];
  if (Array.isArray(choices)) {
    const firstChoice = choices[0];
    if (firstChoice && typeof firstChoice === 'object') {
      const message = (firstChoice as Record<string, unknown>)['message'];
      if (message && typeof message === 'object') {
        const text = contentToText((message as Record<string, unknown>)['content']).trim();
        if (text) return text;
      }
    }
  }

  return '[No text response; the model may have requested a tool.]';
}

export function redactSensitiveText(text: string): string {
  const sensitiveAssignment = /((?:["']?[A-Za-z0-9_.-]*)?(?:api[_-]?key|token|password|secret|private[_-]?key|access[_-]?key|database[_-]?url|redis[_-]?url|connection[_-]?string)(?:[A-Za-z0-9_.-]*["']?)\s*[:=]\s*)(["']?)([^\s,"'}]+)\2/gi;

  return text
    .replace(
      /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
      '[REDACTED_PRIVATE_KEY]',
    )
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
    .replace(/\b(?:sk-(?:proj-)?|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_API_TOKEN]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(sensitiveAssignment, (_match, prefix: string, quote: string) =>
      `${prefix}${quote}[REDACTED]${quote}`,
    );
}

export function chunkTelegramText(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  const codePoints = Array.from(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < codePoints.length; offset += limit) {
    chunks.push(codePoints.slice(offset, offset + limit).join(''));
  }
  return chunks;
}

function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMarkdown(text: string): string {
  const replacements: string[] = [];
  const preserve = (html: string): string => {
    const marker = `\u0000${replacements.length}\u0000`;
    replacements.push(html);
    return marker;
  };

  let source = text
    .replace(/`([^`\n]+)`/g, (_match, code: string) => preserve(`<code>${escapeTelegramHtml(code)}</code>`))
    .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:|tg:\/\/)[^\s)]+)\)/g, (_match, label: string, url: string) =>
      preserve(`<a href="${escapeTelegramHtml(url)}">${escapeTelegramHtml(label)}</a>`),
    );

  source = escapeTelegramHtml(source)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?;:)])/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?;:)])/g, '$1<i>$2</i>');

  return source.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => replacements[Number(index)] ?? '');
}

export function formatTelegramRichText(markdown: string): string {
  const output: string[] = [];
  let codeLanguage = '';
  let codeLines: string[] | undefined;

  for (const line of markdown.split('\n')) {
    const fence = line.match(/^```\s*([A-Za-z0-9_+-]{0,32})\s*$/);
    if (fence) {
      if (codeLines) {
        const languageClass = codeLanguage ? ` class="language-${codeLanguage}"` : '';
        output.push(`<pre><code${languageClass}>${escapeTelegramHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = undefined;
        codeLanguage = '';
      } else {
        codeLines = [];
        codeLanguage = fence[1] ?? '';
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const quote = line.match(/^>\s?(.*)$/);
    const unorderedItem = line.match(/^\s*[-+*]\s+(.+)$/);
    const orderedItem = line.match(/^\s*(\d+)\.\s+(.+)$/);

    if (heading) output.push(`<b>${formatInlineMarkdown(heading[1])}</b>`);
    else if (quote) output.push(`<blockquote>${formatInlineMarkdown(quote[1])}</blockquote>`);
    else if (unorderedItem) output.push(`• ${formatInlineMarkdown(unorderedItem[1])}`);
    else if (orderedItem) output.push(`${orderedItem[1]}. ${formatInlineMarkdown(orderedItem[2])}`);
    else output.push(formatInlineMarkdown(line));
  }

  if (codeLines) {
    const languageClass = codeLanguage ? ` class="language-${codeLanguage}"` : '';
    output.push(`<pre><code${languageClass}>${escapeTelegramHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return output.join('\n');
}

function formatTelegramMessage(label: string, text: string, sequence = '', cursor = ''): string {
  const header = `<b>${escapeTelegramHtml(label + sequence)}</b>`;
  return `${header}\n\n${formatTelegramRichText(text)}${cursor}`;
}

function forwardingConfig(requireOutboundEnabled = true): { token: string; chatId: string } | undefined {
  if (requireOutboundEnabled && process.env.TELEGRAM_FORWARD_CHATS !== 'true') return undefined;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return undefined;
  return { token, chatId };
}

async function telegramRequest<T>(token: string, method: string, payload: Record<string, unknown>): Promise<T> {
  const body = JSON.stringify(payload);

  return new Promise<T>((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${method}`,
        method: 'POST',
        timeout: TELEGRAM_TIMEOUT_MS,
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
            const parsed = JSON.parse(responseBody) as { ok?: boolean; result?: T; description?: string };
            if (
              response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300 &&
              parsed.ok &&
              parsed.result !== undefined
            ) {
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

async function sendTelegramChunk(
  token: string,
  chatId: string,
  text: string,
  messageThreadId?: number,
): Promise<number> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (messageThreadId !== undefined) payload['message_thread_id'] = messageThreadId;

  const message = await telegramRequest<TelegramMessage>(token, 'sendMessage', payload);
  return message.message_id;
}

async function editTelegramChunk(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
): Promise<void> {
  await telegramRequest<TelegramMessage>(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  });
}

function reportDeliveryError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[Telegram Forward]', message);
}

function enqueueTask(task: () => Promise<void>): Promise<void> {
  deliveryQueue = deliveryQueue.then(task).catch(reportDeliveryError);
  return deliveryQueue;
}

function readWorkspaceTopics(): WorkspaceTopicState {
  try {
    const parsed = JSON.parse(fs.readFileSync(WORKSPACE_TOPICS_FILE, 'utf8')) as Partial<WorkspaceTopicState>;
    if (parsed.topics && typeof parsed.topics === 'object') {
      return { topics: parsed.topics };
    }
  } catch {
    // The topic map is created after the first workspace delivery.
  }
  return { topics: {} };
}

function writeWorkspaceTopics(state: WorkspaceTopicState): void {
  fs.mkdirSync(path.dirname(WORKSPACE_TOPICS_FILE), { recursive: true });
  const temporaryFile = `${WORKSPACE_TOPICS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryFile, WORKSPACE_TOPICS_FILE);
}

function workspaceTopicName(workspace: string): string {
  const normalized = workspace.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown workspace';
  return `Workspace | ${Array.from(normalized).slice(0, TELEGRAM_TOPIC_NAME_LIMIT - 12).join('')}`;
}

async function ensureWorkspaceTopic(token: string, chatId: string, workspace: string): Promise<number | undefined> {
  const topicName = workspaceTopicName(workspace);
  const state = readWorkspaceTopics();
  const existingThreadId = state.topics[topicName];
  if (Number.isInteger(existingThreadId)) return existingThreadId;

  try {
    const topic = await telegramRequest<TelegramForumTopic>(token, 'createForumTopic', {
      chat_id: chatId,
      name: topicName,
    });
    state.topics[topicName] = topic.message_thread_id;
    writeWorkspaceTopics(state);
    return topic.message_thread_id;
  } catch (error) {
    reportDeliveryError(error);
    return undefined;
  }
}

async function deliver(
  label: string,
  text: string,
  messageThreadId?: number,
  requireOutboundEnabled = true,
): Promise<void> {
  const config = forwardingConfig(requireOutboundEnabled);
  if (!config || !text.trim()) return;

  const safeText = redactSensitiveText(text.trim());
  const chunks = chunkTelegramText(safeText);

  for (let index = 0; index < chunks.length; index += 1) {
    const sequence = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : '';
    await sendTelegramChunk(
      config.token,
      config.chatId,
      formatTelegramMessage(label, chunks[index], sequence),
      messageThreadId,
    );
  }
}

function enqueue(label: string, text: string): void {
  void enqueueTask(() => deliver(label, text));
}

export function forwardUserPrompt(body: Record<string, unknown>, metadata: ChatForwardMetadata): void {
  const text = extractLatestUserText(body);
  if (text) enqueue(`User | ${metadata.model} | ${metadata.route}`, text);
}

export function forwardAssistantResponse(
  response: Record<string, unknown>,
  metadata: ChatForwardMetadata,
): void {
  enqueue(`Assistant | ${metadata.model} | ${metadata.route}`, extractAssistantText(response));
}

export function forwardAssistantText(text: string, metadata: ChatForwardMetadata): void {
  enqueue(`Assistant | ${metadata.model} | ${metadata.route}`, text || '[No text response]');
}

export function forwardExternalText(label: string, text: string): Promise<void> {
  return enqueueTask(() => deliver(label, text));
}

export function forwardTelegramThreadText(
  label: string,
  text: string,
  messageThreadId?: number,
): Promise<void> {
  return enqueueTask(() => deliver(label, text, messageThreadId, false));
}

export function forwardWorkspaceText(workspace: string, text: string): Promise<void> {
  return enqueueTask(async () => {
    const config = forwardingConfig();
    if (!config || !text.trim()) return;
    const messageThreadId = await ensureWorkspaceTopic(config.token, config.chatId, workspace);
    await deliver('VS Code Agent', text, messageThreadId);
  });
}

export function beginAssistantStream(metadata: ChatForwardMetadata): AssistantStreamForwarder {
  const config = forwardingConfig();
  if (!config) {
    return {
      append: () => undefined,
      finish: async () => undefined,
    };
  }

  const configuredInterval = Number(process.env.TELEGRAM_STREAM_UPDATE_MS ?? DEFAULT_STREAM_UPDATE_MS);
  const updateInterval = Math.max(
    MIN_STREAM_UPDATE_MS,
    Number.isFinite(configuredInterval) ? configuredInterval : DEFAULT_STREAM_UPDATE_MS,
  );
  const label = `Assistant | ${metadata.model} | ${metadata.route}`;
  const messageIds: number[] = [];
  const renderedMessages: string[] = [];
  let rawText = '';
  let finished = false;
  let updateTimer: NodeJS.Timeout | undefined;
  let lastUpdateQueuedAt = 0;

  const renderMessages = (): string[] => {
    const safeText = redactSensitiveText((rawText || '[No text response]').trim());
    const chunks = chunkTelegramText(safeText);
    return chunks.map((chunk, index) => {
      const sequence = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : '';
      const cursor = !finished && index === chunks.length - 1 ? '\n\n▌' : '';
      return formatTelegramMessage(label, chunk, sequence, cursor);
    });
  };

  const flush = async (): Promise<void> => {
    const messages = renderMessages();
    for (let index = 0; index < messages.length; index += 1) {
      const text = messages[index];
      if (messageIds[index] === undefined) {
        messageIds[index] = await sendTelegramChunk(config.token, config.chatId, text);
      } else if (renderedMessages[index] !== text) {
        await editTelegramChunk(config.token, config.chatId, messageIds[index], text);
      }
      renderedMessages[index] = text;
    }
  };

  const queueFlush = (): Promise<void> => {
    lastUpdateQueuedAt = Date.now();
    return enqueueTask(flush);
  };

  const scheduleFlush = (): void => {
    if (updateTimer) return;
    const delay = Math.max(0, updateInterval - (Date.now() - lastUpdateQueuedAt));
    updateTimer = setTimeout(() => {
      updateTimer = undefined;
      void queueFlush();
    }, delay);
  };

  return {
    append(text: string): void {
      if (!text || finished) return;
      rawText += text;
      scheduleFlush();
    },
    async finish(finalText?: string): Promise<void> {
      if (finished) return;
      if (finalText !== undefined && finalText !== rawText) rawText = finalText;
      finished = true;
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = undefined;
      }
      await queueFlush();
    },
  };
}
