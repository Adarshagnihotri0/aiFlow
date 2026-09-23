#!/usr/bin/env node
// One-shot producer using the existing proxy sender. No listener or getUpdates.
const path = require('node:path');
const { publishProgress, progressCatalog } = require('../dist/services/telegram-progress');

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 8192) throw new Error('Input limit');
  }
  return JSON.parse(input);
}
async function main() {
  const command = process.argv[2];
  if (command === 'catalog') {
    console.log(JSON.stringify(progressCatalog, null, 2));
    return;
  }
  if (!['send', 'initial'].includes(command)) throw new Error('Use send, initial or catalog');
  const event = command === 'send' ? await readInput() : {
    run: `hopper-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
    sequence: 1, phase: 'review',
    areas: ['comments', 'groups', 'reel-playback', 'nearby-sync'], decision: 'inspection-first',
    evidence: [{ check: 'android-compile', result: 'pending' }, { check: 'device-sync', result: 'not-run' }],
    blockers: ['compile-pending', 'device-unverified'], next: 'inspect',
  };
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { sendProgressText } = require('../dist/services/telegram-forwarder');
  const result = await publishProgress(event, sendProgressText);
  console.log(JSON.stringify(result));
  if (result.status === 'uncertain') process.exitCode = 2;
  if (result.status === 'deferred') process.exitCode = 3;
}
main().catch(() => {
  // Never emit raw input, exception messages, HTTP URLs or configuration.
  console.error(JSON.stringify({ status: 'failed', reason: 'Invalid input, unavailable state, busy lock, or missing build/configuration; inspect locally.' }));
  process.exitCode = 1;
});
