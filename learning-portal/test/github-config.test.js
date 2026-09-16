import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configuredGitHubSync, githubToken } from '../server/github-config.js';

test('GitHub configuration is optional, explicit, bound and secrets never enter error status', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fieldnotes-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let tokens = 0; let captured;
  const args = { directory, store: {}, env: {}, getToken: async () => { tokens++; return 'private-fixture'; }, factory: async (input) => { captured = input; return { status: () => ({ configured: true }) }; } };
  assert.equal((await configuredGitHubSync(args)).status().state, 'disabled');
  assert.equal(tokens, 0);
  await writeFile(path.join(directory, 'github-config.json'), JSON.stringify({ repo: 'Example/Data', repoId: 123, branch: 'main' }));
  assert.equal((await configuredGitHubSync(args)).status().configured, true);
  assert.equal(captured.repoId, 123);
  assert.equal(captured.token, 'private-fixture');
  assert.equal((await configuredGitHubSync({ ...args, env: { PORTAL_GITHUB_ENABLED: 'false' } })).status().state, 'disabled');
  const blocked = await configuredGitHubSync({ ...args, getToken: async () => { throw new Error('private-fixture'); } });
  assert.equal(blocked.status().state, 'blocked');
  assert.ok(!JSON.stringify(blocked.status()).includes('private-fixture'));
  await writeFile(path.join(directory, 'github-config.json'), '{bad');
  assert.equal((await configuredGitHubSync(args)).status().state, 'blocked');
  assert.equal((await configuredGitHubSync({ ...args, env: { PORTAL_GITHUB_REPO: 'Example/Other', PORTAL_GITHUB_REPO_ID: '456' } })).status().configured, true);
  assert.equal(captured.repoId, 456);
});

test('credential acquisition uses fixed non-shell gh command or explicit environment token', async () => {
  assert.equal(await githubToken({ PORTAL_GITHUB_TOKEN: 'fixture' }, () => { throw new Error('must not execute'); }), 'fixture');
  const token = await githubToken({}, async (file, args, options) => {
    assert.equal(file, 'gh'); assert.deepEqual(args, ['auth', 'token', '--hostname', 'github.com']);
    assert.equal(options.timeout, 15000); assert.equal(options.maxBuffer, 16384); assert.notEqual(options.shell, true);
    return { stdout: 'fixture\n' };
  });
  assert.equal(token, 'fixture');
});