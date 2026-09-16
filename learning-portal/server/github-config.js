import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { createGitHubSync } from './github-sync.js';

const configSchema = z.object({
  repo: z.string().min(3).max(140), repoId: z.number().int().positive().safe(),
  branch: z.string().min(1).max(200).default('main'),
}).strict();

export async function githubToken(env = process.env, execute = promisify(execFile)) {
  if (env.PORTAL_GITHUB_TOKEN !== undefined) return env.PORTAL_GITHUB_TOKEN;
  // No shell, inherited stdio, credential files, or raw child-process error logging.
  const { stdout } = await execute('gh', ['auth', 'token', '--hostname', 'github.com'], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 16384,
  });
  return stdout.trim();
}

async function readConfig(directory) {
  let handle;
  try {
    handle = await open(path.join(directory, 'github-config.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 4096) throw new Error('Invalid configuration.');
    const buffer = Buffer.alloc(4097);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 4096) throw new Error('Invalid configuration.');
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } catch (error) {
    if (!handle && error.code === 'ENOENT') return null;
    throw error;
  } finally { await handle?.close(); }
}

function inactive(state, message, configured) {
  const status = () => ({ configured, state, message, lastSyncedAt: null });
  return { status, start() {}, async stop() {}, async sync() { return status(); } };
}

export async function configuredGitHubSync({ store, directory, env = process.env, getToken = githubToken, factory = createGitHubSync }) {
  try {
    if (env.PORTAL_GITHUB_ENABLED === 'false') return inactive('disabled', 'GitHub saving is disabled. Progress is saved on this Mac only.', false);
    const input = env.PORTAL_GITHUB_REPO !== undefined || env.PORTAL_GITHUB_REPO_ID !== undefined
      ? { repo: env.PORTAL_GITHUB_REPO, repoId: Number(env.PORTAL_GITHUB_REPO_ID), branch: env.PORTAL_GITHUB_BRANCH || 'main' }
      : await readConfig(directory);
    if (!input) return inactive('disabled', 'GitHub is not configured. Progress is saved on this Mac only.', false);
    const config = configSchema.parse(input);
    return await factory({ store, directory, ...config, token: await getToken(env) });
  } catch {
    return inactive('blocked', 'GitHub saving could not start. Check the private repository configuration and gh sign-in, then restart only Fieldnotes. Local work is preserved.', true);
  }
}