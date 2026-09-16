import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdir } from 'node:fs/promises';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { createInbox } from './sessions.js';
import { configuredGitHubSync } from './github-config.js';
import { acquireOwnership } from './ownership.js';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.resolve(process.env.PORTAL_DATA_DIR || path.join(directory, '.data'));
const port = Number(process.env.PORTAL_PORT || 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 2999 || port === 3000) throw new Error('Choose an independent portal port (default 3210), never 2999 or 3000.');
await mkdir(data, { recursive: true, mode: 0o700 });
// Startup and recovery share this lock. Stale locks require manual inspection.
const releaseOwnership = await acquireOwnership(data);
let server; let timer; let github; let inboxWork = Promise.resolve();
try {
  await mkdir(path.join(data, 'inbox'), { recursive: true, mode: 0o700 });
  const store = await createStore(data);
  const inbox = createInbox(store, path.join(data, 'inbox'));
  await inbox.scan();
  github = await configuredGitHubSync({ store, directory: data });
  const app = createApp({ store, inbox, github, roots: { proxy: path.resolve(directory, '..'), hopper: process.env.HOPPER_ROOT || path.join(os.homedir(), 'Desktop/grasshopper/bitchat-android') }, publicDirectory: path.join(directory, 'public'), localAuthority: `127.0.0.1:${port}`, publicOrigin: process.env.PORTAL_PUBLIC_ORIGIN || '', proxyUrl: process.env.PORTAL_PROXY_URL || 'http://127.0.0.1:2999', model: process.env.PORTAL_MODEL || 'zai.glm-5', proxyKey: process.env.PORTAL_PROXY_KEY || '', chatEnabled: process.env.PORTAL_CHAT_ENABLED !== 'false' });
  server = app.listen(port, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  timer = setInterval(() => { inboxWork = inbox.scan().catch(() => console.warn('Session inbox unavailable; existing notebook preserved.')); }, 15000); timer.unref();
  github.start();
  console.log(`Fieldnotes ready: http://127.0.0.1:${port}`);
  console.log('Existing model proxy lifecycle unchanged. Choose Connect phone in the local browser.');
  if (process.env.PORTAL_PUBLIC_ORIGIN) console.log(`Phone URL: ${process.env.PORTAL_PUBLIC_ORIGIN}`);
} catch (error) { await github?.stop(); await releaseOwnership(); throw error; }
let closing = false;
async function stop() {
  if (closing) return; closing = true; clearInterval(timer);
  const deadline = setTimeout(() => process.exit(1), 20000); deadline.unref();
  try {
    await Promise.all([github.stop(), inboxWork, new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))]);
    await releaseOwnership();
    process.exit(0);
  } catch { console.error('Fieldnotes stopped with an ownership or storage error; inspect the data directory before restarting.'); process.exit(1); }
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);