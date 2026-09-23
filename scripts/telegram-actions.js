#!/usr/bin/env node
// Local coordination only. No polling, networking, subprocesses or code execution.
const { inspectActions, transitionAction } = require('../dist/services/telegram-action-inbox');
async function main() {
  const [command, id, outcome] = process.argv.slice(2);
  let result;
  if (command === 'list' && !id) result = await inspectActions();
  else if (command === 'claim' && /^[a-f0-9]{16}$/.test(id ?? '') && !outcome) result = await transitionAction(id, 'in_progress');
  else if (command === 'finish' && /^[a-f0-9]{16}$/.test(id ?? '') && ['succeeded', 'failed', 'blocked'].includes(outcome)) result = await transitionAction(id, outcome);
  else throw new Error('Invalid local operation');
  console.log(JSON.stringify({ execution: 'none; local coordination only', result }));
}
main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', reason: 'Invalid operation, expired request, unsafe state or busy lock.' }));
  process.exitCode = 1;
});
