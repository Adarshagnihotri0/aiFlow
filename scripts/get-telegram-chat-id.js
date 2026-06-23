#!/usr/bin/env node

const https = require('https');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN required');
  console.error('Usage: TELEGRAM_BOT_TOKEN=your_token node scripts/get-telegram-chat-id.js');
  process.exit(1);
}

console.log('Checking for updates...');
console.log('Please send a message to your bot on Telegram...\n');

const path = `/bot${TOKEN}/getUpdates`;

https.get(`https://api.telegram.org${path}`, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      
      if (!json.ok) {
        console.error('Error:', json.description);
        process.exit(1);
      }
      
      if (!json.result || json.result.length === 0) {
        console.log('No messages found.');
        console.log('\nSteps:');
        console.log('1. Open Telegram');
        console.log('2. Search for your bot');
        console.log('3. Send any message to your bot');
        console.log('4. Run this script again');
        process.exit(0);
      }
      
      console.log('Found chats:\n');
      const seen = new Set();
      
      for (const update of json.result) {
        const chat = update.message?.chat;
        if (chat && !seen.has(chat.id)) {
          seen.add(chat.id);
          console.log(`Chat ID: ${chat.id}`);
          console.log(`  Type: ${chat.type}`);
          console.log(`  Title: ${chat.title || chat.first_name || 'Private chat'}`);
          console.log(`  Username: ${chat.username || 'N/A'}`);
          console.log('');
        }
      }
      
      console.log('\nAdd to your .env file:');
      console.log(`TELEGRAM_CHAT_ID=${Array.from(seen)[0]}`);
      
    } catch (error) {
      console.error('Parse error:', error);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err.message);
  process.exit(1);
});
