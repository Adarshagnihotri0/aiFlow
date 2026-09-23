#!/usr/bin/env node
// Explicit curated producer only. No log/model capture, listener, or getUpdates.
const { TextDecoder } = require('node:util');

async function readInput(stream, maxBytes = 16384) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) throw new Error('Input limit');
    chunks.push(buffer);
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'preview';
  if (args.length > 1 || !['preview', 'send'].includes(command)) throw new Error('Use preview or send with stdin');
  const { renderBriefing, publishBriefing, briefingLimits } = require('../dist/services/telegram-briefing');
  const input = await readInput(process.stdin, briefingLimits.inputBytes);
  const parts = renderBriefing(input); // Validate completely before reading config or reserving state.
  if (command === 'preview') {
    process.stdout.write(parts.join('\n\n---\n\n') + '\n');
    return;
  }
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const { sendProgressText } = require('../dist/services/telegram-forwarder');
  const result = await publishBriefing(input, sendProgressText);
  console.log(JSON.stringify(result));
  if (result.status === 'uncertain') process.exitCode = 2;
  if (result.status === 'deferred') process.exitCode = 3;
}
if (require.main === module) main().catch(() => {
  // Never echo rejected content, HTTP errors, paths, environment or credentials.
  console.error(JSON.stringify({ status: 'failed', reason: 'Invalid briefing, unavailable build/state/configuration, or busy lock; inspect locally.' }));
  process.exitCode = 1;
});
module.exports = { readInput };
