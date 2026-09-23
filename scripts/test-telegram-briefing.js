const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
// Fail closed if any unit check accidentally reaches a real transport.
require('node:https').request = () => { throw new Error('Real network forbidden in briefing tests'); };
const { validateBriefing, renderBriefing, publishBriefing, briefingLimits } = require('../dist/services/telegram-briefing');
const { formatTelegramRichText } = require('../dist/services/telegram-forwarder');
const { readInput } = require('./telegram-briefing');
const example = require('./fixtures/telegram-briefing.example.json');
const clone = () => structuredClone(example);
const ack = async () => ({ messageId: 123, topic: 'workspace' });
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-briefing-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'briefings.json');
}
function changed(sequence = 2) { const e = clone(); e.sequence = sequence; e.executive.impact = `Reviewed milestone ${sequence}.`; return e; }

test('example is truthful, detached, strictly typed and includes all requested report sections', () => {
  const validated = validateBriefing(example);
  assert.deepEqual(validated, example);
  assert.notEqual(validated.agents, example.agents);
  const report = renderBriefing(example).join('\n');
  for (const section of ['CEO SUMMARY', 'PROGRAMMER / SUBAGENT UPDATE', 'DECISIONS / TRADEOFFS',
    'ARCHITECTURE', 'RESEARCH / UNKNOWNS', 'NEXT ACTIONS', 'Impact:', 'Why selected:', 'Owner:', 'STAGED']) assert.ok(report.includes(section));
  assert.match(report, /earlier compile failed/i);
  assert.match(report, /repair remains unverified/);
  assert.match(report, /runtime behavior has not been proven/);
  assert.match(report, /Main agent \| Android validation coordination/);
  const live = clone(); live.deployment.state = 'live'; assert.match(renderBriefing(live)[0], /LIVE/);
});

test('unknown and raw fields are rejected at every object level', () => {
  const paths = [[], ['deployment'], ['executive'], ['agents', 0], ['agents', 0, 'findings', 0],
    ['agents', 0, 'findings', 0, 'evidence'], ['decisions', 0], ['decisions', 0, 'options', 0],
    ['architecture', 0], ['research', 0], ['actions', 0]];
  for (const keys of paths) for (const key of ['extra', 'transcript', 'reasoning', 'token', 'rawResponse', 'location']) {
    const e = clone(); let target = e; for (const part of keys) target = target[part]; target[key] = 'private';
    assert.throws(() => validateBriefing(e), /fields/);
  }
  const missing = clone(); delete missing.research; assert.throws(() => validateBriefing(missing));
  const polluted = clone(); Object.setPrototypeOf(polluted.executive, { token: 'secret' }); assert.throws(() => validateBriefing(polluted));
  assert.throws(() => validateBriefing({ ...example, version: 2 }));
  for (const sequence of [0, -1, NaN, Infinity, 1.5, '1']) assert.throws(() => validateBriefing({ ...example, sequence }));
  for (const run of ['', '../private', 'bad space']) assert.throws(() => validateBriefing({ ...example, run }));
  const selected = clone(); selected.decisions[0].selected = 'missing'; assert.throws(() => validateBriefing(selected));
  const duplicate = clone(); duplicate.decisions[0].options[1].id = duplicate.decisions[0].options[0].id; assert.throws(() => validateBriefing(duplicate));
  const code = clone(); code.agents[0].findings[0].evidence.state = 'proven'; assert.throws(() => validateBriefing(code));
});

test('controls, markup injection, known credentials, private paths and location patterns fail closed', () => {
  const unsafe = ['line\nbreak', 'tab\there', 'hidden\u202e', 'zero\u200b', 'bad\u0000', 'bad\ud800', '**bold**', '`code`',
    'Bearer abcdefghijklmnop', '123456789:abcdefghijklmnopqrstuvwxyz', 'AKIA1234567890ABCDEF', 'ASIA1234567890ABCDEF',
    'sk-abcdefghijklmnopqrstuvwxyz', 'ghp_abcdefghijklmnopqrstuvwxyz', 'password=hidden',
    'eyJabcdef.abcdefgh.abcdefgh', '-----BEGIN PRIVATE KEY----- x -----END PRIVATE KEY-----',
    '/Users/private/project', '/home/private/project', 'C:\\Users\\private', '~/private', '../private',
    '.env', '.ssh/config', '.aws/credentials', '.copilot/cache', 'file:///private', 'https://example.invalid',
    'path:/Users/private', '[C:\\Users\\private]', '\\\\server\\private',
    'person@example.invalid', 'latitude: 12.34', 'geohash=private', '12.345, 67.890'];
  for (const value of unsafe) {
    const e = clone(); e.executive.summary = value;
    assert.throws(() => validateBriefing(e), undefined, `Guard failed for synthetic case`);
  }
  const e = clone(); e.agents[0].findings[0].evidence.reference = 'src/services/telegram-briefing.ts';
  assert.doesNotThrow(() => validateBriefing(e));
});

test('numbered mobile parts fit sender and escaped HTML budgets without splitting diagrams', () => {
  const e = clone(); e.executive.summary = 'Markup <&> is escaped; emoji 😀 stays intact.';
  e.architecture[0].lines = ['[Producer] <--> [Sender]', 'A & B -> C'];
  const parts = renderBriefing(e);
  assert.ok(parts.length > 1 && parts.length <= briefingLimits.parts);
  for (const [i, part] of parts.entries()) {
    assert.ok(part.length <= briefingLimits.partCharacters && part.length <= 3000);
    assert.ok(Buffer.byteLength(`<b>Hopper progress</b>\n\n${formatTelegramRichText(part)}`) <= briefingLimits.wireBytes);
    assert.ok(part.includes(`Part ${i + 1}/${parts.length}`));
    assert.equal((part.match(/^```$/gm) || []).length % 2, 0);
  }
  const diagramPart = parts.find(part => part.includes('[Producer]'));
  assert.match(formatTelegramRichText(diagramPart), /<pre><code>\[Producer\] &lt;--&gt; \[Sender\]\nA &amp; B -&gt; C<\/code><\/pre>/);
  assert.match(formatTelegramRichText(parts[0]), /Markup &lt;&amp;&gt;/);
  assert.ok(parts[0].includes('😀'));
});

test('all size limits reject rather than truncate or split oversized blocks', () => {
  for (const lines of [['x'.repeat(49)], ['unicode 😀'], ['```'], Array(17).fill('x')]) {
    const e = clone(); e.architecture[0].lines = lines; assert.throws(() => renderBriefing(e));
  }
  const text = clone(); text.executive.summary = 'x'.repeat(361); assert.throws(() => renderBriefing(text));
  const bytes = clone(); bytes.unknown = 'x'.repeat(16384); assert.throws(() => validateBriefing(bytes), /input limit/);
  const items = clone(); items.actions = Array(6).fill(items.actions[0]); assert.throws(() => validateBriefing(items));
  const full = clone();
  full.agents = Array.from({ length: 4 }, (_, i) => ({ name: `Agent ${i}`, role: 'r'.repeat(64), status: 'working',
    findings: Array.from({ length: 3 }, () => ({ summary: 'x'.repeat(240), evidence: { state: 'reported', reference: 'r'.repeat(180) } })) }));
  full.decisions = Array.from({ length: 2 }, () => ({ question: 'q'.repeat(160), selected: 'one', why: 'w'.repeat(240),
    options: ['one', 'two', 'three'].map(id => ({ id, label: 'l'.repeat(80), benefits: 'b'.repeat(160), costs: 'c'.repeat(160) })) }));
  assert.throws(() => renderBriefing(full), /part limit/);
  const expanded = clone(); expanded.decisions[0].options.push({ ...expanded.decisions[0].options[1], id: 'third' });
  expanded.decisions[0].options.forEach(option => { option.benefits = '&'.repeat(160); option.costs = '<'.repeat(160); });
  assert.throws(() => renderBriefing(expanded), /block exceeds part limit/);
  const total = clone(); total.architecture = Array.from({ length: 2 }, () => ({ title: 'Diagram', lines: Array(16).fill('x') }));
  total.agents = full.agents; total.decisions = full.decisions; total.research = Array(3).fill(total.research[0]); total.actions = Array(5).fill(total.actions[0]);
  assert.throws(() => validateBriefing(total), /item limit/);
  const sparse = clone(); sparse.actions = Array(2); assert.throws(() => validateBriefing(sparse));
  const extra = clone(); extra.actions.token = 'private'; assert.throws(() => validateBriefing(extra));
  assert.throws(() => validateBriefing({ ...example, run: 'sk-abcdefghijklmnopqrstuv' }));
});

test('durable reservation precedes every send; acknowledgements and metadata are private and replay-safe', async t => {
  const file = await fixture(t); let calls = 0;
  const send = async () => {
    const state = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(state.entries[0].status, 'sending');
    assert.equal(state.entries[0].receipts.length, calls);
    calls++; return { messageId: calls, topic: 'workspace' };
  };
  const result = await publishBriefing(example, send, file, 100000);
  assert.equal(result.status, 'delivered'); assert.equal(calls, renderBriefing(example).length);
  assert.equal(result.receipts.length, calls);
  assert.equal((await publishBriefing(example, send, file, 200000)).status, 'duplicate');
  const same = Object.fromEntries(Object.entries({ ...example, sequence: 2 }).reverse());
  assert.equal((await publishBriefing(same, send, file, 200000)).status, 'duplicate');
  assert.equal(calls, result.receipts.length);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  const stored = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(stored, /executive|Android|findings|Main agent|summary/);
  await assert.rejects(publishBriefing(changed(1), send, file, 200000), /conflict/);
});

test('partial or missing acknowledgements stop delivery and block replay and subsequent sequence', async t => {
  for (const failure of ['throw', 'bad-id', 'bad-topic']) {
    const file = path.join(path.dirname(await fixture(t)), `${failure}.json`); let calls = 0;
    const send = async () => {
      calls++;
      if (calls === 1) return { messageId: 1, topic: 'workspace' };
      if (failure === 'throw') throw new Error('Do not disclose raw transport failure');
      return { messageId: failure === 'bad-id' ? 0 : 2, topic: failure === 'bad-topic' ? 'unknown' : 'general' };
    };
    const result = await publishBriefing(example, send, file, 100000);
    assert.deepEqual(result, { status: 'uncertain', acknowledgedParts: 1 }); assert.equal(calls, 2);
    const noSend = async () => assert.fail('Ambiguous sends must not retry');
    assert.equal((await publishBriefing(example, noSend, file, 200000)).status, 'uncertain');
    assert.equal((await publishBriefing(changed(), noSend, file, 200000)).status, 'uncertain');
  }
});

test('crash-left sending reservation is not retried; corrupt or unsafe state fails closed', async t => {
  const file = await fixture(t); await publishBriefing(example, ack, file, 100000);
  const original = JSON.parse(await fs.readFile(file, 'utf8'));
  const crash = structuredClone(original); crash.entries[0].status = 'sending'; crash.entries[0].receipts = [];
  await fs.writeFile(file, JSON.stringify(crash));
  const noSend = async () => assert.fail('No unsafe side effect');
  assert.equal((await publishBriefing(example, noSend, file, 200000)).status, 'uncertain');
  const mutations = [s => { s.extra = true; }, s => { s.entries[0].parts = 7; }, s => { s.entries[0].at = -1; },
    s => { s.entries[0].receipts = []; }, s => { s.runs[0].sequence = 0; }, s => { s.entries[0].receipts[0].topic = 'bad'; }];
  for (const mutate of mutations) { const state = structuredClone(original); mutate(state); await fs.writeFile(file, JSON.stringify(state));
    await assert.rejects(publishBriefing(changed(), noSend, file, 200000)); }
  await fs.writeFile(file, 'broken'); await assert.rejects(publishBriefing(example, noSend, file));
  await fs.chmod(file, 0o644); await assert.rejects(publishBriefing(example, noSend, file));
  await fs.unlink(file); await fs.symlink(path.join(path.dirname(file), 'missing'), file);
  await assert.rejects(publishBriefing(example, noSend, file));
});

test('overlapping publishers serialize to one report and stale locks are not stolen', async t => {
  const file = await fixture(t); let release; let started;
  const ready = new Promise(resolve => { started = resolve; }); let calls = 0;
  const first = publishBriefing(example, async () => { calls++; if (calls === 1) { started(); await new Promise(resolve => { release = resolve; }); } return ack(); }, file, 100000);
  await ready;
  const second = publishBriefing(example, async () => assert.fail('Duplicate overlapping sender'), file, 100000);
  release();
  assert.equal((await first).status, 'delivered'); assert.equal((await second).status, 'duplicate');
  await fs.writeFile(`${file}.lock`, '', { mode: 0o600 });
  await assert.rejects(publishBriefing(changed(), ack, file, 200000));
  assert.ok(await fs.stat(`${file}.lock`));
});

test('rate budget counts all reserved parts, clock rollback defers, and daily budget recovers', async t => {
  const file = await fixture(t); await publishBriefing(example, ack, file, 100000);
  const noSend = async () => assert.fail('Rate-limited sender must not run');
  assert.equal((await publishBriefing(changed(), noSend, file, 100001)).status, 'deferred');
  assert.equal((await publishBriefing(changed(), noSend, file, 90000)).status, 'deferred');
  assert.equal((await publishBriefing(changed(), ack, file, 130000)).status, 'delivered');
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  const base = state.entries[0];
  state.entries = Array.from({ length: 120 }, (_, i) => ({ ...base, sequence: i + 1, hash: i.toString(16).padStart(64, '0'),
    parts: 1, receipts: [{ messageId: i + 1, topic: 'general' }] }));
  state.runs[0].sequence = 120;
  await fs.writeFile(file, JSON.stringify(state));
  const result = await publishBriefing(changed(121), noSend, file, 200000);
  assert.equal(result.status, 'deferred'); assert.ok(result.retryAfterMs > 0);
  assert.equal((await publishBriefing(changed(121), ack, file, 86500000)).status, 'delivered');
});

test('bounded state retains unresolved entries, evicts only old delivered entries and preserves sequence watermark', async t => {
  const file = await fixture(t); await publishBriefing(example, ack, file, 100000);
  const state = JSON.parse(await fs.readFile(file, 'utf8')); const base = state.entries[0];
  state.entries = Array.from({ length: 128 }, (_, i) => ({ ...base, sequence: i + 1, hash: i.toString(16).padStart(64, '0') }));
  state.runs[0].sequence = 128;
  await fs.writeFile(file, JSON.stringify(state));
  assert.equal((await publishBriefing(changed(129), ack, file, 86500000)).status, 'delivered');
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).entries.length, 128);
  assert.equal((await publishBriefing(example, ack, file, 86600000)).status, 'duplicate');
  state.entries = []; state.runs = Array.from({ length: 8 }, (_, i) => ({ run: `run-${i}`, sequence: 1 }));
  await fs.writeFile(file, JSON.stringify(state));
  await assert.rejects(publishBriefing(example, ack, file, 200000), /capacity/);
});

test('reservation failure prevents sends and final checkpoint failure never causes automatic resend', async t => {
  const file = await fixture(t); const rename = fs.rename; let calls = 0;
  try {
    fs.rename = async () => { throw new Error('Mock durable write failure'); };
    await assert.rejects(publishBriefing(example, async () => { calls++; return ack(); }, file, 100000));
    assert.equal(calls, 0);
    fs.rename = async (from, to) => {
      const state = JSON.parse(await fs.readFile(from, 'utf8'));
      if (state.entries[0].status === 'delivered') throw new Error('Mock final checkpoint failure');
      return rename(from, to);
    };
    const result = await publishBriefing(example, async () => { calls++; return ack(); }, file, 100000);
    assert.equal(result.status, 'uncertain'); assert.equal(calls, renderBriefing(example).length);
    fs.rename = rename;
    assert.equal((await publishBriefing(example, async () => assert.fail('No replay after checkpoint failure'), file, 200000)).status, 'uncertain');
  } finally { fs.rename = rename; }
});

test('stream input is bounded in bytes and rejects invalid UTF-8', async () => {
  assert.deepEqual(await readInput(Readable.from([Buffer.from(JSON.stringify(example))])), example);
  await assert.rejects(readInput(Readable.from(['x'.repeat(16385)])), /limit/);
  await assert.rejects(readInput(Readable.from([Buffer.from([0xff])])));
});

test('CLI defaults to side-effect-free preview; explicit send uses existing sender with mocked HTTPS only', async t => {
  const file = await fixture(t); const home = path.dirname(file);
  const preload = path.join(home, 'mock.cjs');
  await fs.writeFile(preload, `
    const assert = require('node:assert/strict');
    const { EventEmitter } = require('node:events');
    require(${JSON.stringify(require.resolve('dotenv'))}).config = () => ({});
    let calls = 0;
    require('node:https').request = (options, callback) => {
      assert.equal(process.env.MOCK_SEND, 'yes', 'Preview attempted network');
      assert.equal(options.hostname, 'api.telegram.org');
      assert.match(options.path, /\\/sendMessage$/);
      const request = new EventEmitter();
      request.end = body => {
        const payload = JSON.parse(body);
        assert.equal(payload.parse_mode, 'HTML');
        assert.ok(Buffer.byteLength(payload.text) <= 3800);
        assert.ok(payload.text.includes('Part '));
        process.nextTick(() => {
          const response = new EventEmitter(); response.statusCode = 200; callback(response);
          response.emit('data', JSON.stringify({ ok: true, result: { message_id: ++calls } })); response.emit('end');
        });
      };
      return request;
    };
  `);
  const env = { ...process.env, HOME: home, TELEGRAM_BOT_TOKEN: 'mock-only', TELEGRAM_CHAT_ID: 'mock-only' };
  const invoke = (args, input = JSON.stringify(example), extra = {}) => spawnSync(process.execPath,
    ['--require', preload, path.join(__dirname, 'telegram-briefing.js'), ...args], { input, encoding: 'utf8', env: { ...env, ...extra } });
  const preview = invoke([]); assert.equal(preview.status, 0, preview.stderr); assert.match(preview.stdout, /CEO SUMMARY/);
  await assert.rejects(fs.stat(path.join(home, '.copilot')), { code: 'ENOENT' });
  assert.equal(invoke(['preview']).stdout, preview.stdout);
  for (const args of [['invalid'], ['send', 'extra']]) assert.equal(invoke(args).status, 1);
  const bad = invoke([], JSON.stringify({ ...example, token: 'DO_NOT_ECHO' }));
  assert.equal(bad.status, 1); assert.doesNotMatch(bad.stdout + bad.stderr, /DO_NOT_ECHO/);
  const sent = invoke(['send'], JSON.stringify(example), { MOCK_SEND: 'yes' });
  assert.equal(sent.status, 0, sent.stderr); assert.equal(JSON.parse(sent.stdout).status, 'delivered');
  const replay = invoke(['send']); assert.equal(replay.status, 0, replay.stderr); assert.equal(JSON.parse(replay.stdout).status, 'duplicate');
});
