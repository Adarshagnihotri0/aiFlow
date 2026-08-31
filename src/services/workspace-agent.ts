import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { redactSensitiveText } from './telegram-forwarder';

const REGISTRY_PATH = process.env.TELEGRAM_WORKSPACE_REGISTRY
  ?? path.join(os.homedir(), '.copilot', 'telegram-workspace-topics.json');
const CLAUDE_PATH = process.env.CLAUDE_CODE_PATH ?? path.join(os.homedir(), '.local', 'bin', 'claude');
const AGENT_MODEL = process.env.TELEGRAM_AGENT_MODEL ?? 'zai.glm-5';
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_LIMIT_BYTES = 64 * 1024;

export interface WorkspaceCheck {
  executable: string;
  args: string[];
}

export interface WorkspaceBinding {
  name: string;
  root: string;
  topicId: number;
  checks: Record<string, WorkspaceCheck>;
}

interface WorkspaceRegistry {
  workspaces?: Record<string, {
    name?: string;
    root?: string;
    enabled?: boolean;
    checks?: Record<string, WorkspaceCheck>;
  }>;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
}

export interface PendingWork {
  token: string;
  request: string;
  ownerId: number;
  threadId: number;
  workspace: WorkspaceBinding;
  fingerprint: string;
  expiresAt: number;
}

function safeOutputText(text: string): string {
  return redactSensitiveText(text.trim() || 'No response was produced.');
}

async function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = AGENT_TIMEOUT_MS,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let timedOut = false;

    const capture = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      if (outputBytes >= OUTPUT_LIMIT_BYTES) return;
      const remaining = OUTPUT_LIMIT_BYTES - outputBytes;
      outputBytes += chunk.length;
      const value = chunk.toString('utf8', 0, Math.max(0, remaining));
      if (target === 'stdout') stdout += value;
      else stderr += value;
    };

    child.stdout.on('data', (chunk: Buffer) => capture('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => capture('stderr', chunk));
    child.on('error', reject);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error('Workspace operation timed out'));
        return;
      }
      if (code !== 0) {
        reject(new Error(safeOutputText(stderr || stdout || `Process exited with code ${code ?? 'unknown'}`)));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function resolveWorkspace(threadId?: number): Promise<WorkspaceBinding | undefined> {
  if (threadId === undefined) return undefined;
  const registryStat = await fs.stat(REGISTRY_PATH);
  if ((registryStat.mode & 0o077) !== 0) throw new Error('Workspace registry must use mode 600');
  if (typeof process.getuid === 'function' && registryStat.uid !== process.getuid()) {
    throw new Error('Workspace registry must be owned by the proxy user');
  }

  const registry = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf8')) as WorkspaceRegistry;
  const configured = registry.workspaces?.[String(threadId)];
  if (!configured?.enabled || !configured.root || !configured.name) return undefined;

  const requestedRoot = path.resolve(configured.root);
  const realRoot = await fs.realpath(requestedRoot);
  if (requestedRoot !== realRoot) throw new Error('Symlinked workspace roots are not allowed');
  const rootStat = await fs.stat(realRoot);
  if (!rootStat.isDirectory()) throw new Error('Configured workspace root is not a directory');
  if (typeof process.getuid === 'function' && rootStat.uid !== process.getuid()) {
    throw new Error('Configured workspace must be owned by the proxy user');
  }

  return {
    name: configured.name,
    root: realRoot,
    topicId: threadId,
    checks: configured.checks ?? {},
  };
}

export async function workspaceFingerprint(workspace: WorkspaceBinding): Promise<string> {
  const status = await runProcess(
    '/usr/bin/git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    workspace.root,
    { PATH: '/usr/bin:/bin' },
    15000,
  );
  const diff = await runProcess(
    '/usr/bin/git',
    ['diff', '--binary', 'HEAD', '--', '.'],
    workspace.root,
    { PATH: '/usr/bin:/bin' },
    15000,
  );
  const untracked = await runProcess(
    '/usr/bin/git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    workspace.root,
    { PATH: '/usr/bin:/bin' },
    15000,
  );

  const fingerprint = createHash('sha256').update(status.stdout).update('\0').update(diff.stdout);
  for (const relativePath of untracked.stdout.split('\0').filter(Boolean).sort()) {
    const absolutePath = path.resolve(workspace.root, relativePath);
    if (!absolutePath.startsWith(`${workspace.root}${path.sep}`)) {
      throw new Error('Git returned an untracked path outside the workspace');
    }
    const fileStat = await fs.lstat(absolutePath);
    fingerprint.update('\0').update(relativePath).update('\0').update(String(fileStat.mode));
    if (fileStat.isSymbolicLink()) {
      fingerprint.update('\0').update(await fs.readlink(absolutePath));
    } else if (fileStat.isFile()) {
      fingerprint.update('\0').update(await fs.readFile(absolutePath));
    }
  }
  return fingerprint.digest('hex');
}

function claudeArgs(request: string, mode: 'plan' | 'execute'): string[] {
  const tools = mode === 'plan'
    ? ['Read', 'Glob', 'Grep']
    : ['Read', 'Glob', 'Grep', 'Edit', 'Write'];
  const task = mode === 'plan'
    ? `Inspect this repository and propose a concise implementation plan for the request below. Do not edit files or run commands.\n\nRequest:\n${request}`
    : `Implement the confirmed request below in this repository. You may read and edit files, but you cannot run shell commands. Keep changes focused and report changed files and remaining validation.\n\nConfirmed request:\n${request}`;

  return [
    '-p', task,
    '--model', AGENT_MODEL,
    '--setting-sources', '',
    '--output-format', 'text',
    '--no-session-persistence',
    '--tools', ...tools,
    '--allowedTools', ...tools,
    '--permission-mode', mode === 'plan' ? 'plan' : 'acceptEdits',
  ];
}

export async function runWorkspaceAgent(
  workspace: WorkspaceBinding,
  request: string,
  mode: 'plan' | 'execute',
): Promise<string> {
  const result = await runProcess(
    CLAUDE_PATH,
    claudeArgs(request, mode),
    workspace.root,
    {
      HOME: os.homedir(),
      PATH: `${path.dirname(CLAUDE_PATH)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
      LANG: 'en_US.UTF-8',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:2999',
      ANTHROPIC_API_KEY: 'dummy',
    },
  );
  return safeOutputText(result.stdout || result.stderr);
}

export async function runWorkspaceCheck(workspace: WorkspaceBinding, checkName: string): Promise<string> {
  const check = workspace.checks[checkName];
  if (!check || !path.isAbsolute(check.executable) || !Array.isArray(check.args)) {
    throw new Error(`Unknown workspace check: ${checkName}`);
  }
  const result = await runProcess(
    check.executable,
    check.args,
    workspace.root,
    { HOME: os.homedir(), PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', LANG: 'en_US.UTF-8' },
  );
  return safeOutputText(result.stdout || result.stderr || `${checkName} passed.`);
}

export function createPendingWork(
  request: string,
  ownerId: number,
  threadId: number,
  workspace: WorkspaceBinding,
  fingerprint: string,
): PendingWork {
  return {
    token: randomBytes(16).toString('hex'),
    request,
    ownerId,
    threadId,
    workspace,
    fingerprint,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
}
