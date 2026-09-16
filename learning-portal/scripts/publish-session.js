import { readFile, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSession } from '../server/schema.js';
import { sourceIds } from '../server/catalog.js';

const file = process.argv[2];
if (!file || process.argv.length !== 3) throw new Error('Usage: npm run session:publish -- /absolute/path/to/curated-session.json');
const content = await readFile(file, 'utf8');
if (Buffer.byteLength(content) > 32000) throw new Error('Session exceeds 32KB.');
const session = validateSession(JSON.parse(content), sourceIds);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inbox = path.join(process.env.PORTAL_DATA_DIR || path.join(root, '.data'), 'inbox');
await mkdir(inbox, { recursive: true, mode: 0o700 });
const target = path.join(inbox, `${session.id}.json`);
let output;
try {
  output = await open(target, 'wx', 0o600);
  await output.writeFile(JSON.stringify(session, null, 2)); await output.sync();
  console.log('Curated session published. The portal will import it within 15 seconds.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  if (JSON.stringify(JSON.parse(await readFile(target, 'utf8'))) !== JSON.stringify(session)) throw new Error('Session ID already exists with different content. Use a new ID; do not rewrite history.');
  console.log('Identical session already published; no duplicate created.');
} finally { if (output) await output.close(); }