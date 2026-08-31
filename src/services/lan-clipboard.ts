import { execFile } from 'child_process';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const CLIPBOARD_DIR = path.join(os.homedir(), '.copilot', 'lan-clipboard');
const TOKEN_FILE = path.join(CLIPBOARD_DIR, 'token');
const FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isPrivateClient(request: Request): boolean {
  const address = (request.ip ?? '').replace(/^::ffff:/, '').toLowerCase();
  return address === '::1'
    || address === '127.0.0.1'
    || address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address)
    || address.startsWith('fc')
    || address.startsWith('fd')
    || address.startsWith('fe80:');
}

async function getPairingToken(): Promise<string> {
  const configured = process.env.LAN_CLIPBOARD_TOKEN?.trim();
  if (configured) {
    if (configured.length < 16) throw new Error('LAN_CLIPBOARD_TOKEN must contain at least 16 characters');
    return configured;
  }

  await fs.mkdir(CLIPBOARD_DIR, { recursive: true, mode: 0o700 });
  try {
    return (await fs.readFile(TOKEN_FILE, 'utf8')).trim();
  } catch {
    const token = randomBytes(16).toString('hex');
    await fs.writeFile(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
    return token;
  }
}

function tokenMatches(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

function requireClipboardAuth(tokenPromise: Promise<string>) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    if (!isPrivateClient(request)) {
      response.status(403).json({ error: 'Private LAN access only' });
      return;
    }
    const authorization = request.get('authorization') ?? '';
    const candidate = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!tokenMatches(candidate, await tokenPromise)) {
      response.status(401).json({ error: 'Invalid pairing token' });
      return;
    }
    next();
  };
}

function safeFilename(value: string): string {
  let decoded = 'clipboard-file';
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const basename = path.basename(decoded).replace(/[\u0000-\u001f/:]/g, '_').trim();
  return basename || 'clipboard-file';
}

async function cleanOldFiles(): Promise<void> {
  const entries = await fs.readdir(CLIPBOARD_DIR, { withFileTypes: true });
  const cutoff = Date.now() - FILE_MAX_AGE_MS;
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || entry.name === path.basename(TOKEN_FILE)) return;
    const filePath = path.join(CLIPBOARD_DIR, entry.name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }));
}

async function copyText(text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = execFile('/usr/bin/pbcopy', (error) => error ? reject(error) : resolve());
    process.stdin?.end(text);
  });
}

async function readText(): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/pbpaste', [], {
    encoding: 'utf8',
    maxBuffer: MAX_UPLOAD_BYTES,
  });
  return stdout;
}

async function copyFile(filePath: string, mimeType: string): Promise<void> {
  if (mimeType === 'image/png') {
    await execFileAsync('/usr/bin/osascript', [
      '-e',
      'on run argv\nset the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)\nend run',
      filePath,
    ]);
    return;
  }
  if (mimeType === 'image/jpeg') {
    await execFileAsync('/usr/bin/osascript', [
      '-e',
      'on run argv\nset the clipboard to (read (POSIX file (item 1 of argv)) as JPEG picture)\nend run',
      filePath,
    ]);
    return;
  }
  await execFileAsync('/usr/bin/osascript', [
    '-e',
    'on run argv\nset the clipboard to POSIX file (item 1 of argv)\nend run',
    filePath,
  ]);
}

function pageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Mac Clipboard</title>
<style>
:root{color-scheme:light;--ink:#16201d;--muted:#65716d;--paper:#f2f5ef;--panel:#fff;--line:#d7ded8;--accent:#087f5b;--accent2:#e7f5ee;--danger:#b42318}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 0%,#d9eee4 0,transparent 35%),var(--paper);color:var(--ink);font-family:Avenir Next,Avenir,sans-serif}.shell{width:min(680px,100%);margin:auto;padding:calc(24px + env(safe-area-inset-top)) 18px calc(32px + env(safe-area-inset-bottom))}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}h1{font-size:26px;letter-spacing:0;margin:0}.online{font-size:12px;color:var(--accent);font-weight:700}.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;margin-bottom:14px;box-shadow:0 12px 28px rgba(24,48,39,.07)}label{display:block;font-weight:700;font-size:13px;margin-bottom:8px}input,textarea,button{font:inherit}input[type=password],textarea{width:100%;border:1px solid var(--line);border-radius:6px;background:#fbfcfa;padding:12px;color:var(--ink)}textarea{min-height:150px;resize:vertical}.row{display:flex;gap:10px;margin-top:12px}.primary,.fileButton{border:0;border-radius:6px;padding:12px 16px;font-weight:700;cursor:pointer}.primary{background:var(--accent);color:#fff}.fileButton{display:block;text-align:center;background:var(--accent2);color:var(--accent);border:1px solid #b9ddcd}.primary:disabled{opacity:.5}.fileButton input{display:none}.status{min-height:22px;margin:16px 2px 0;color:var(--muted);font-size:13px}.status.error{color:var(--danger)}.fileName{margin:10px 0 0;color:var(--muted);font-size:13px;overflow-wrap:anywhere}@media(max-width:480px){.shell{padding-left:12px;padding-right:12px}.panel{padding:15px}.row{flex-direction:column}.primary{width:100%}}
</style>
</head>
<body><main class="shell"><header><h1>Mac Clipboard</h1><span class="online">LAN CONNECTED</span></header>
<section class="panel"><label for="token">Pairing token</label><input id="token" type="password" autocomplete="off" placeholder="Token from the Mac"><div class="row"><button class="primary" id="saveToken">Save token</button></div></section>
<section class="panel"><label for="macText">Received from Mac</label><textarea id="macText" readonly placeholder="Mac clipboard text appears here"></textarea><div class="row"><button class="primary" id="refreshMacText">Refresh from Mac</button><button class="fileButton" id="copyMacText" disabled>Copy on phone</button></div></section>
<section class="panel"><label for="text">Send to Mac</label><textarea id="text" placeholder="Tap here and paste"></textarea><div class="row"><button class="primary" id="sendText">Copy text to Mac</button></div></section>
<section class="panel"><label>Send image or file to Mac</label><div class="row"><label class="fileButton" for="screenshot">Choose recent screenshot<input id="screenshot" type="file" accept="image/*"></label><label class="fileButton" for="file">Choose file<input id="file" type="file"></label></div><p class="fileName" id="fileName">No file selected</p></section>
<p class="status" id="status"></p></main>
<script>
const tokenInput=document.querySelector('#token');const macText=document.querySelector('#macText');const copyMacText=document.querySelector('#copyMacText');const textInput=document.querySelector('#text');const screenshotInput=document.querySelector('#screenshot');const fileInput=document.querySelector('#file');const status=document.querySelector('#status');
function sessionValue(key){try{return sessionStorage.getItem(key)||''}catch{return ''}}
function saveSessionValue(key,value){try{sessionStorage.setItem(key,value)}catch{}}
const pairingToken=new URLSearchParams(location.hash.slice(1)).get('token')||'';
if(pairingToken){saveSessionValue('lanClipboardToken',pairingToken);history.replaceState(null,'',location.pathname+location.search)}
tokenInput.value=sessionValue('lanClipboardToken');
macText.value=sessionValue('lanClipboardMacText');
textInput.value=sessionValue('lanClipboardPhoneText');
copyMacText.disabled=!macText.value;
textInput.addEventListener('input',()=>saveSessionValue('lanClipboardPhoneText',textInput.value));
function setStatus(message,error=false){status.textContent=message;status.className='status'+(error?' error':'')}
function auth(){return {'Authorization':'Bearer '+tokenInput.value.trim()}}
async function responseError(response){const body=await response.text();try{return JSON.parse(body).error||'Request failed'}catch{return 'Request failed'}}
async function loadMacText(){try{setStatus('Reading Mac clipboard...');const response=await fetch('/v1/clipboard/text',{headers:auth(),cache:'no-store'});if(!response.ok)throw new Error(await responseError(response));const body=await response.json();macText.value=body.text;saveSessionValue('lanClipboardMacText',body.text);copyMacText.disabled=!body.text;setStatus(body.text?'Received text from Mac.':'The Mac clipboard has no text.')}catch(error){setStatus(error.message,true)}}
document.querySelector('#saveToken').onclick=()=>{saveSessionValue('lanClipboardToken',tokenInput.value.trim());void loadMacText()};
document.querySelector('#refreshMacText').onclick=loadMacText;
copyMacText.onclick=async()=>{if(!macText.value)return;try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(macText.value)}else{macText.focus();macText.select();macText.setSelectionRange(0,macText.value.length);if(!document.execCommand('copy'))throw new Error('Copy is unavailable in this browser')}setStatus('Copied on your phone.')}catch(error){setStatus(error.message,true)}};
document.querySelector('#sendText').onclick=async()=>{try{setStatus('Sending text...');const response=await fetch('/v1/clipboard/text',{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body:JSON.stringify({text:textInput.value})});if(!response.ok)throw new Error(await responseError(response));setStatus('Text is ready to paste on your Mac.')}catch(error){setStatus(error.message,true)}};
async function sendSelectedFile(input){const file=input.files[0];if(!file)return;const fileName=document.querySelector('#fileName');fileName.textContent=file.name+' · '+Math.ceil(file.size/1024)+' KB';try{setStatus('Sending '+file.name+'...');const response=await fetch('/v1/clipboard/file',{method:'POST',headers:{...auth(),'Content-Type':file.type||'application/octet-stream','X-Clipboard-Filename':encodeURIComponent(file.name)},body:file});if(!response.ok)throw new Error(await responseError(response));setStatus(file.name+' is ready to paste on your Mac.');input.value=''}catch(error){setStatus(error.message,true)}}
screenshotInput.onchange=()=>sendSelectedFile(screenshotInput);
fileInput.onchange=()=>sendSelectedFile(fileInput);
if(pairingToken)void loadMacText();
</script></body></html>`;
}

export function installLanClipboardRoutes(app: Express): void {
  if (process.platform !== 'darwin') {
    console.log('[LAN Clipboard] Disabled: macOS is required');
    return;
  }

  const tokenPromise = getPairingToken();
  const requireAuth = requireClipboardAuth(tokenPromise);
  void fs.mkdir(CLIPBOARD_DIR, { recursive: true, mode: 0o700 })
    .then(cleanOldFiles)
    .catch((error) => console.error('[LAN Clipboard] Cleanup failed:', error));

  app.get('/clipboard', (request, response) => {
    if (!isPrivateClient(request)) {
      response.status(403).send('Private LAN access only');
      return;
    }
    response.type('html').send(pageHtml());
  });

  app.get(
    '/v1/clipboard/text',
    requireAuth,
    async (_request: Request, response: Response) => {
      try {
        const text = await readText();
        response.set('Cache-Control', 'no-store').json({ ok: true, type: 'text', text });
      } catch (error) {
        console.error('[LAN Clipboard] Text read failed:', error);
        response.status(500).json({ error: 'Could not read the Mac clipboard' });
      }
    },
  );

  app.post(
    '/v1/clipboard/text',
    requireAuth,
    expressJsonBody(),
    async (request: Request, response: Response) => {
      const text = typeof request.body?.text === 'string' ? request.body.text : '';
      if (!text || Buffer.byteLength(text) > MAX_UPLOAD_BYTES) {
        response.status(400).json({ error: 'Text is empty or exceeds 25 MB' });
        return;
      }
      try {
        await copyText(text);
        response.json({ ok: true, type: 'text', bytes: Buffer.byteLength(text) });
      } catch (error) {
        console.error('[LAN Clipboard] Text copy failed:', error);
        response.status(500).json({ error: 'Could not update the Mac clipboard' });
      }
    },
  );

  app.post(
    '/v1/clipboard/file',
    requireAuth,
    expressRawBody(),
    async (request: Request, response: Response) => {
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        response.status(400).json({ error: 'File is empty' });
        return;
      }
      let filePath: string | undefined;
      try {
        await fs.mkdir(CLIPBOARD_DIR, { recursive: true, mode: 0o700 });
        const filename = safeFilename(request.get('x-clipboard-filename') || 'clipboard-file');
        filePath = path.join(CLIPBOARD_DIR, `${Date.now()}-${randomBytes(8).toString('hex')}-${filename}`);
        await fs.writeFile(filePath, request.body, { mode: 0o600, flag: 'wx' });
        const mimeType = request.get('content-type') || 'application/octet-stream';
        await copyFile(filePath, mimeType);
        if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
          await fs.unlink(filePath);
          filePath = undefined;
        }
        await cleanOldFiles();
        response.json({ ok: true, type: 'file', name: filename, bytes: request.body.length });
      } catch (error) {
        if (filePath) await fs.unlink(filePath).catch(() => undefined);
        console.error('[LAN Clipboard] File copy failed:', error);
        response.status(500).json({ error: 'Could not update the Mac clipboard' });
      }
    },
  );

  console.log(`[LAN Clipboard] Ready at http://localhost:${process.env.PORT ?? '3000'}/clipboard`);
}

function expressJsonBody() {
  const express = require('express') as typeof import('express');
  return express.json({ limit: MAX_UPLOAD_BYTES });
}

function expressRawBody() {
  const express = require('express') as typeof import('express');
  return express.raw({ type: '*/*', limit: MAX_UPLOAD_BYTES });
}
