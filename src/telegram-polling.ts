import https from 'https';
import { invokeModelOpenAI } from './bedrock';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let lastUpdateId = 0;
let isProcessing = false;
let messageHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// Rate-limit error logging
let lastTelegramError = 0;
const ERROR_LOG_INTERVAL = 60000; // Only log once per minute

function logTelegramError(context: string, error: Error | string): void {
  const now = Date.now();
  if (now - lastTelegramError > ERROR_LOG_INTERVAL) {
    console.error(`[Telegram] ${context}:`, typeof error === 'string' ? error : error.message);
    lastTelegramError = now;
  }
}

// Track Telegram API health
let telegramAvailable = true;
let lastTelegramCheck = 0;
const CHECK_INTERVAL = 300000; // Check every 5 minutes

async function checkTelegramAvailability(): Promise<boolean> {
  const now = Date.now();
  if (now - lastTelegramCheck < CHECK_INTERVAL) {
    return telegramAvailable;
  }
  
  lastTelegramCheck = now;
  
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 5000,
      agent: false,
    }, (res) => {
      telegramAvailable = res.statusCode === 200 || res.statusCode === 401;
      resolve(telegramAvailable);
    });
    
    req.on('error', () => {
      telegramAvailable = false;
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      telegramAvailable = false;
      resolve(false);
    });
    
    req.end();
  });
}

/**
 * Fetch updates from Telegram API with retry logic
 */
async function getUpdates(): Promise<any[]> {
  // Check if Telegram is available before making request
  const available = await checkTelegramAvailability();
  if (!available) {
    return []; // Skip polling if Telegram is unreachable
  }
  
  return new Promise((resolve) => {
    const path = `/bot${TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: path,
      method: 'GET',
      timeout: 35000,
      agent: false, // Disable connection pooling
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok && Array.isArray(json.result)) {
            telegramAvailable = true; // Mark as available on success
            resolve(json.result);
          } else {
            logTelegramError('Invalid response', json.description || 'Unknown error');
            resolve([]);
          }
        } catch (error) {
          logTelegramError('Parse error', error as Error);
          resolve([]);
        }
      });
    });
    
    req.on('error', (err) => {
      telegramAvailable = false;
      logTelegramError('Fetch error', err);
      resolve([]);
    });
    
    req.on('timeout', () => {
      telegramAvailable = false;
      logTelegramError('Request timeout', 'long polling timeout');
      req.destroy();
      resolve([]);
    });
    
    req.end();
  });
}

/**
 * Send message to Telegram with retry logic
 */
async function sendTelegramMessage(text: string, retries = 3): Promise<boolean> {
  // Check if Telegram is available before making request
  const available = await checkTelegramAvailability();
  if (!available) {
    logTelegramError('Send skipped', 'Telegram API unreachable');
    return false;
  }
  
  const maxLen = 4000;
  const textToSend = text.length > maxLen 
    ? text.substring(0, maxLen) + '...\n[truncated]'
    : text;
  
  // Use parse_mode=Markdown for better formatting
  const path = `/bot${TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(textToSend)}&parse_mode=Markdown`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const success = await new Promise<boolean>((resolve) => {
        const req = https.request({
          hostname: 'api.telegram.org',
          port: 443,
          path: path,
          method: 'GET',
          timeout: 10000, // 10 second timeout
          agent: false, // Disable connection pooling
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.ok) {
                telegramAvailable = true; // Mark as available on success
                resolve(true);
              } else {
                logTelegramError('Send failed', json.description);
                resolve(false);
              }
            } catch {
              resolve(false);
            }
          });
        });
        
        req.on('error', (err) => {
          telegramAvailable = false;
          if (attempt === retries) {
            logTelegramError(`Send error after ${retries} attempts`, err);
          }
          resolve(false);
        });
        
        req.on('timeout', () => {
          telegramAvailable = false;
          if (attempt === retries) {
            logTelegramError('Send timeout', `gave up after ${retries} attempts`);
          }
          req.destroy();
          resolve(false);
        });
        
        req.end();
      });
      
      if (success) return true;
      
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    } catch (error) {
      if (attempt === retries) {
        logTelegramError(`Send error after ${retries} attempts`, error as Error);
      }
    }
  }
  
  return false;
}

/**
 * Send typing indicator to Telegram
 */
async function sendTypingAction(): Promise<void> {
  const path = `/bot${TOKEN}/sendChatAction?chat_id=${CHAT_ID}&action=typing`;
  const req = https.get({
    hostname: 'api.telegram.org',
    port: 443,
    path: path,
    method: 'GET',
    timeout: 5000
  }, (res) => {
    // Consume response to avoid memory leaks
    res.on('data', () => {});
    res.on('error', (err) => {
      console.error('[Telegram Typing Action Error]', err.message);
    });
  });
  
  req.on('error', (err) => {
    console.error('[Telegram Typing Action Error]', err.message);
  });
  
  req.on('timeout', () => {
    req.destroy();
    console.error('[Telegram Typing Action Error] Request timeout');
  });
  
  req.end();
}

/**
 * Process incoming Telegram message
 */
async function processMessage(text: string): Promise<string> {
// Handle special commands
if (text === '/clear' || text === '/reset') {
messageHistory = [];
return '✅ Conversation history cleared. Starting fresh!';
}

if (text === '/history') {
if (messageHistory.length === 0) {
return 'No conversation history yet.';
}

return `Conversation history (${messageHistory.length} messages):\n\n${messageHistory
  .map(
    (m, i) =>
      `${i + 1}. ${m.role}: ${m.content.substring(0, 100)}...`
  )
  .join('\n')}`;
}

// Add user message to history
messageHistory.push({
role: 'user',
content: text,
});

// Keep only last 20 messages
if (messageHistory.length > 20) {
messageHistory = messageHistory.slice(-20);
}

try {
const response = await invokeModelOpenAI({
messages: messageHistory,
max_tokens: 2000,
temperature: 0.7,
});

const choices = response.choices as Array<{
  message?: { content?: string };
}>;

const responseText =
  choices?.[0]?.message?.content ??
  'Sorry, I could not process that.';

// Save assistant response
messageHistory.push({
  role: 'assistant',
  content: responseText,
});

return responseText;

} catch (error) {
console.error('[Telegram] Error processing message:', error);

return 'Sorry, an error occurred while processing your message.';

}
}

/**
 * Start Telegram polling loop
 */
export async function startTelegramPolling(): Promise<void> {
  if (!TOKEN || !CHAT_ID) {
    console.log('⚠️  Telegram polling disabled: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required');
    return;
  }
  
  console.log('✓ Telegram polling started');
  console.log(`  Chat ID: ${CHAT_ID}`);
  console.log('');
  console.log('  Commands:');
  console.log('    /clear - Clear conversation history');
  console.log('    /reset - Same as /clear');
  console.log('    /history - View conversation history');
  console.log('');
  
  // Continuous polling loop
  while (true) {
    try {
      // Skip if still processing previous message
      if (isProcessing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Get updates
      const updates = await getUpdates();
      
      for (const update of updates) {
        // Update the last update ID
        lastUpdateId = update.update_id;
        
        // Validate chat ID
        if (update.message?.chat?.id?.toString() !== CHAT_ID) {
          console.log(`[Telegram] Ignoring message from different chat: ${update.message?.chat?.id}`);
          continue;
        }
        
        const text = update.message?.text;
        
        // Skip empty messages
        if (!text) {
          continue;
        }
        
        // Log all messages including commands
        console.log(`[Telegram] Received: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        // Skip very short messages (likely accidental)
        if (text.trim().length < 2 && !text.startsWith('/')) {
          continue;
        }
        
        // Mark as processing
        isProcessing = true;
        
        // Send typing indicator
        sendTypingAction().catch(() => {});
        
        // Process and respond
        const startTime = Date.now();
        const response = await processMessage(text);
        const elapsed = Date.now() - startTime;
        
        // Send response
        const sent = await sendTelegramMessage(response);
        
        if (sent) {
          console.log(`[Telegram] Replied in ${elapsed}ms (${response.length} chars)`);
        }
        
        // Add small delay before processing next message
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Release processing lock
        isProcessing = false;
      }
      
      // Small delay between polls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('[Telegram] Polling error:', error);
      // Wait longer on error to avoid spam
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Clear conversation history (exported for potential external use)
 */
export function clearHistory(): void {
  messageHistory = [];
  console.log('[Telegram] Conversation history cleared');
}

/**
 * Get current history length (exported for potential external use)
 */
export function getHistoryLength(): number {
  return messageHistory.length;
}
