import https from 'https';
import { invokeModelOpenAI } from './bedrock';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let lastUpdateId = 0;
let isProcessing = false;
let messageHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

/**
 * Fetch updates from Telegram API
 */
async function getUpdates(): Promise<any[]> {
  return new Promise((resolve) => {
    const path = `/bot${TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    
    https.get({
      hostname: 'api.telegram.org',
      port: 443,
      path: path,
      method: 'GET',
      timeout: 35000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok && Array.isArray(json.result)) {
            resolve(json.result);
          } else {
            console.error('[Telegram] Invalid response:', json.description || 'Unknown error');
            resolve([]);
          }
        } catch (error) {
          console.error('[Telegram] Parse error:', error);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.error('[Telegram] Fetch error:', err.message);
      resolve([]);
    }).on('timeout', () => {
      console.error('[Telegram] Request timeout');
      resolve([]);
    });
  });
}

/**
 * Send message to Telegram
 */
async function sendTelegramMessage(text: string): Promise<boolean> {
  const maxLen = 4000;
  const textToSend = text.length > maxLen 
    ? text.substring(0, maxLen) + '...\n[truncated]'
    : text;
  
  // Use parse_mode=Markdown for better formatting
  const path = `/bot${TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(textToSend)}&parse_mode=Markdown`;
  
  return new Promise((resolve) => {
    https.get({
      hostname: 'api.telegram.org',
      port: 443,
      path: path,
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            resolve(true);
          } else {
            console.error('[Telegram] Send failed:', json.description);
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.error('[Telegram] Send error:', err.message);
      resolve(false);
    });
  });
}

/**
 * Send typing indicator to Telegram
 */
async function sendTypingAction(): Promise<void> {
  const path = `/bot${TOKEN}/sendChatAction?chat_id=${CHAT_ID}&action=typing`;
  https.get({
    hostname: 'api.telegram.org',
    port: 443,
    path: path,
    method: 'GET',
  }).end();
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
    return `Conversation history (${messageHistory.length} messages):\n\n${messageHistory.map((m, i) => `${i + 1}. ${m.role}: ${m.content.substring(0, 100)}...`).join('\n')}`;
  }
  
  // Add user message to history
  messageHistory.push({ role: 'user', content: text });
  
  // Keep only last 20 messages to stay within token limits
  if (messageHistory.length > 20) {
    messageHistory = messageHistory.slice(-20);
  }
  
  try {
    // Call Bedrock with conversation history
    const response = await invokeModelOpenAI({
      messages: messageHistory,
      max_tokens: 2000,
      temperature: 0.7,
    });
    
    // Extract response text with proper type assertion
    const choices = response.choices as Array<{ message?: { content?: string } }>;
    const responseText = (choices?.[0]?.message?.content) || 'Sorry, I could not process that.';
    
    // Add assistant response to history
    messageHistory.push({ role: 'assistant', content: responseText });
    
    return responseText;
  } catch (error) {
    console.error('Error calling Bedrock:', error);
    return 'Sorry, an error occurred while processing your message.';
  } finally {
    isProcessing = false;
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
