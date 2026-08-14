import 'dotenv/config';
import app from './server';
import { startTelegramPolling } from './telegram-polling';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  console.log('');
  console.log('  Bedrock proxy running');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  To use with Claude Code:');
  console.log(`    export ANTHROPIC_BASE_URL=http://localhost:${PORT}`);
  console.log('    export ANTHROPIC_API_KEY=dummy');
  console.log('    claude');
  console.log('');
});

// Inbound Telegram chat is a separate opt-in from outbound proxy forwarding.
if (process.env.TELEGRAM_POLLING_ENABLED === 'true') {
  startTelegramPolling().catch((error) => {
    console.error('[Telegram] Fatal polling error:', error);
  });
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n[Telegram] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Telegram] Shutting down...');
  process.exit(0);
}); 
