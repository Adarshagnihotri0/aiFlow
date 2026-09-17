import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';

const publicUrl = 'https://pairing-fixture.example.test';
const codes = ['Ab9_-Cd2Ef3G', 'Zy8_-Xw7Vu6T', 'Mn4_-Op5Qr6S'];
const lifetime = 5 * 60 * 1000;
const qrName = 'Scan with your phone camera to connect to your private notebook';
const qrCanvas = page => page.getByRole('img', { name: qrName, exact: true });
const manualConnection = page => page.locator('details').filter({ has: page.locator('summary', { hasText: /^Manual connection$/ }) });
const manualLogin = page => page.locator('details').filter({ has: page.locator('summary', { hasText: /^Enter a code instead$/ }) });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function freezeClock(page) {
  const start = new Date('2026-09-17T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
}

// Observe only public browser APIs, never app state or production helper exports.
// Recording setItem also catches transient writes that are subsequently removed.
async function auditBrowser(page) {
  await page.addInitScript(() => {
    const audit = { fetches: [], storageWrites: [] };
    window.__pairingTestAudit = audit;
    const fetch = window.fetch;
    window.fetch = function (input, init) {
      audit.fetches.push({
        url: new URL(input instanceof Request ? input.url : String(input), location.href).href,
        href: location.href,
        historyState: history.state,
      });
      return fetch.call(this, input, init);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      audit.storageWrites.push([String(key), String(value)]);
      return setItem.call(this, key, value);
    };
  });
}

// Isolated notebook and mock HTTP boundary: no real store, authentication,
// tunnel, clipboard provider, model proxy, or external QR service is used.
async function fixture(page, { local = true, authenticated = true, pairReplies = [], loginReplies = [] } = {}) {
  const data = {
    authenticated, local, publicUrl, chatAvailable: false,
    profile: { role: 'undecided', level: 'beginner', minutes: 25, language: 'english', learningStyle: 'standard', aiConsent: false },
    lessons: [], sessions: [], sources: [], progress: {}, reviews: {},
    github: { configured: false, state: 'disabled' },
  };
  const requests = [];
  const requestUrls = [];
  const issued = [];
  let loginCount = 0;
  page.on('request', request => requestUrls.push(request.url()));
  await auditBrowser(page);
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    requests.push({ path, method, body: request.postData() ? request.postDataJSON() : null });
    if (path === '/api/bootstrap' && method === 'GET') return route.fulfill({ json: data });
    if (path === '/api/login' && method === 'POST') {
      const reply = loginReplies[loginCount++] || {};
      if (reply.wait) await reply.wait;
      if (reply.status) return route.fulfill({ status: reply.status, json: { error: reply.error || 'Fixture code expired or already used.' } });
      data.authenticated = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/pair' && method === 'POST' && data.authenticated && data.local) {
      const index = issued.length;
      const reply = pairReplies[index] || {};
      const code = codes[index % codes.length];
      const modules = QRCode.create(`${publicUrl}/#pair=${code}`, { errorCorrectionLevel: 'M' }).modules;
      const result = {
        code, expiresAt: await page.evaluate(() => Date.now()) + lifetime,
        qr: { size: modules.size, data: Array.from(modules.data) },
        ...reply.result,
      };
      issued.push(result);
      if (reply.wait) await reply.wait;
      if (reply.status) return route.fulfill({ status: reply.status, json: { error: reply.error || 'Fixture pairing unavailable.' } });
      return route.fulfill({ json: result });
    }
    return route.fulfill({ status: 503, json: { error: `Unmocked pairing endpoint: ${method} ${path}` } });
  });
  return { requests, requestUrls, issued };
}

function calls(fixture, path) {
  return fixture.requests.filter(request => request.path === path);
}

async function expectQr(page, mock, index = 0) {
  const canvas = qrCanvas(page);
  await expect(canvas).toBeVisible();
  const result = mock.issued[index];
  expect(result).toBeDefined();
  // Verify every backing-store pixel, not merely canvas presence or a nonempty
  // data URL: real modules, square integer scaling, opaque black/white, and an
  // uninterrupted four-module white quiet zone on all sides.
  const pixels = await canvas.evaluate((node, matrix) => {
    const scale = node.width / (matrix.size + 8);
    if (node.tagName !== 'CANVAS' || node.width !== node.height || !Number.isInteger(scale) || scale < 1) {
      return { validGeometry: false };
    }
    const context = node.getContext('2d');
    if (!context) return { validGeometry: false };
    const rgba = context.getImageData(0, 0, node.width, node.height).data;
    let mismatches = 0;
    for (let y = 0; y < node.height; y += 1) {
      for (let x = 0; x < node.width; x += 1) {
        const row = Math.floor(y / scale) - 4;
        const col = Math.floor(x / scale) - 4;
        const inside = row >= 0 && row < matrix.size && col >= 0 && col < matrix.size;
        const expected = inside && matrix.data[row * matrix.size + col] ? 0 : 255;
        const offset = (y * node.width + x) * 4;
        if (rgba[offset] !== expected || rgba[offset + 1] !== expected || rgba[offset + 2] !== expected || rgba[offset + 3] !== 255) mismatches += 1;
      }
    }
    const rect = node.getBoundingClientRect();
    return { validGeometry: true, mismatches, squareOnScreen: Math.abs(rect.width - rect.height) < 1, visible: rect.width > 0 };
  }, result.qr);
  expect(pixels).toEqual({ validGeometry: true, mismatches: 0, squareOnScreen: true, visible: true });
}

async function expectNoSecretDom(page, code) {
  await expect(page.locator('canvas[role="img"]')).toHaveCount(0);
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveCount(0);
  expect(await page.locator('html').innerHTML()).not.toContain(code);
}

async function expectNoSecretPersistence(page, fixture, secrets = codes) {
  const browser = await page.evaluate(() => ({
    href: location.href, historyState: history.state,
    local: Object.entries(localStorage), session: Object.entries(sessionStorage),
    cookie: document.cookie, writes: window.__pairingTestAudit.storageWrites,
    fetchUrls: window.__pairingTestAudit.fetches.map(entry => entry.url),
  }));
  const observed = JSON.stringify({ browser, urls: fixture.requestUrls, cookies: await page.context().cookies() });
  for (const secret of secrets) expect(observed).not.toContain(secret);
  expect(fixture.requestUrls.every(url => !url.includes('#pair=') && !url.includes('?code='))).toBe(true);
}

async function wakeBrowser(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
}

async function expectFits(page, locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await locator.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return node.scrollWidth <= node.clientWidth + 1 && bounds.left >= 0 && bounds.right <= innerWidth + 1;
  })).toBe(true);
}

test('one Connect phone click creates a real scannable canvas with collapsed manual connection', async ({ page }) => {
  const mock = await fixture(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Connect phone', exact: true })).toBeVisible();
  expect(calls(mock, '/api/pair')).toEqual([]);
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(qrCanvas(page)).toBeVisible();
  expect(calls(mock, '/api/pair')).toEqual([{ path: '/api/pair', method: 'POST', body: {} }]);
  await expectQr(page, mock);
  await expect(manualConnection(page)).toHaveJSProperty('open', false);
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'New QR code', exact: true })).toBeEnabled();
  await manualConnection(page).locator('summary').click();
  await expect(page.getByLabel('Phone website address', { exact: true })).toHaveText(publicUrl);
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveText(codes[0]);
  await manualConnection(page).locator('summary').click();
  await wakeBrowser(page);
  await expectQr(page, mock);
  expect(calls(mock, '/api/pair')).toHaveLength(1);
  await expectNoSecretPersistence(page, mock);
});

test('only explicit regeneration replaces the QR; old expiry cannot remove its replacement', async ({ page }) => {
  await freezeClock(page);
  const mock = await fixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expectQr(page, mock);
  await page.clock.fastForward(2 * 60 * 1000);
  expect(calls(mock, '/api/pair')).toHaveLength(1);
  await manualConnection(page).locator('summary').click();
  await page.getByRole('button', { name: 'New QR code', exact: true }).click();
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveText(codes[1]);
  await expectQr(page, mock, 1);
  expect(mock.issued[1].qr.data).not.toEqual(mock.issued[0].qr.data);
  await expect(manualConnection(page)).toHaveJSProperty('open', false);
  expect(await page.locator('#dialog').innerHTML()).not.toContain(codes[0]);
  await page.clock.fastForward(3 * 60 * 1000); // The first QR would expire here.
  await expectQr(page, mock, 1);
  await page.clock.fastForward(2 * 60 * 1000);
  await expect(page.locator('#dialog')).toContainText('QR expired. Create a new one below.');
  await expectNoSecretDom(page, codes[1]);
  await page.clock.fastForward(2 * lifetime);
  await wakeBrowser(page);
  expect(calls(mock, '/api/pair')).toHaveLength(2);
  await expect(page.getByRole('button', { name: 'New QR code', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'New QR code', exact: true }).click();
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveText(codes[2]);
  await expectQr(page, mock, 2);
  await expect(page.locator('#dialog')).not.toContainText('QR expired.');
  expect(calls(mock, '/api/pair')).toHaveLength(3);
});

for (const dismissal of ['Close dialog', 'Escape']) {
  test(`${dismissal} removes pairing secrets from the DOM, not just from view`, async ({ page }) => {
    await freezeClock(page);
    const mock = await fixture(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
    await expect(qrCanvas(page)).toBeVisible();
    await manualConnection(page).locator('summary').click();
    await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toBeVisible();
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: dismissal, exact: true }).click();
    await expect(page.locator('#dialog')).toHaveJSProperty('open', false);
    await expectNoSecretDom(page, codes[0]);
    await expect(page.getByRole('button', { name: 'Connect phone', exact: true })).toBeFocused();
    await page.clock.fastForward(lifetime + 1000);
    await expectNoSecretDom(page, codes[0]);
    expect(calls(mock, '/api/pair')).toHaveLength(1);
    await expectNoSecretPersistence(page, mock);
  });
}

test('reopening while issuance is pending joins one request instead of superseding the displayed QR', async ({ page }) => {
  const pending = deferred();
  const mock = await fixture(page, { pairReplies: [{ wait: pending.promise }] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect.poll(() => calls(mock, '/api/pair').length).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(page.locator('#dialog')).toContainText('Preparing your QR code…');
  pending.resolve();
  await expectQr(page, mock);
  expect(calls(mock, '/api/pair')).toHaveLength(1);
  await page.getByRole('button', { name: 'New QR code', exact: true }).click();
  await expectQr(page, mock, 1);
  expect(calls(mock, '/api/pair')).toHaveLength(2);
});

test('closing with a pending response prevents late secrets from entering a different dialog', async ({ page }) => {
  await freezeClock(page);
  const pending = deferred();
  const mock = await fixture(page, { pairReplies: [{ wait: pending.promise }] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(page.locator('#dialog')).toContainText('Preparing your QR code…');
  await expect(page.getByRole('button', { name: 'New QR code', exact: true })).toBeDisabled();
  await expect.poll(() => calls(mock, '/api/pair').length).toBe(1);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('#dialog')).toBeEmpty();
  await page.getByRole('button', { name: 'Settings and account', exact: true }).click();
  const response = page.waitForResponse('**/api/pair');
  pending.resolve();
  await (await response).finished();
  await page.clock.runFor(1000);
  await expect(page.locator('#dialog-title')).toHaveText('Learning preferences');
  await expectNoSecretDom(page, codes[0]);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveText(codes[1]);
  await expectQr(page, mock, 1);
  expect(calls(mock, '/api/pair')).toHaveLength(2);
});

test('pair creation failure stays failed until New QR code is explicitly requested', async ({ page }) => {
  await freezeClock(page);
  const mock = await fixture(page, { pairReplies: [{ status: 503 }] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture pairing unavailable.');
  await page.clock.fastForward(2 * lifetime);
  await wakeBrowser(page);
  await expectNoSecretDom(page, codes[0]);
  expect(calls(mock, '/api/pair')).toHaveLength(1);
  await page.getByRole('button', { name: 'New QR code', exact: true }).click();
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveText(codes[1]);
  await expectQr(page, mock, 1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(calls(mock, '/api/pair')).toHaveLength(2);
});

test('unusable QR matrix offers manual connection without silently creating another code', async ({ page }) => {
  const mock = await fixture(page, { pairReplies: [{ result: { qr: { size: 21, data: [1] } } }] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(page.locator('#dialog')).toContainText('QR unavailable. Use manual connection below.');
  await expect(qrCanvas(page)).toHaveCount(0);
  await expect(manualConnection(page)).toHaveJSProperty('open', false);
  await manualConnection(page).locator('summary').click();
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveText(codes[0]);
  expect(calls(mock, '/api/pair')).toHaveLength(1);
});

test('remote QR is consumed before POST, logs in once, then bootstraps without retaining the token', async ({ page }) => {
  await freezeClock(page);
  const pending = deferred();
  const mock = await fixture(page, { local: false, authenticated: false, loginReplies: [{ wait: pending.promise }] });
  await page.goto(`/#pair=${codes[0]}`);
  await expect(page.getByRole('heading', { name: 'Connecting your phone…', exact: true })).toBeVisible();
  await expect.poll(() => calls(mock, '/api/login').length).toBe(1);
  await expect(page).toHaveURL(/\/#today$/);
  expect(mock.requests).toEqual([{ path: '/api/login', method: 'POST', body: { code: codes[0] } }]);
  const beforePost = await page.evaluate(() => window.__pairingTestAudit.fetches);
  expect(beforePost).toHaveLength(1);
  expect(new URL(beforePost[0].url).pathname).toBe('/api/login');
  expect(new URL(beforePost[0].href).hash).toBe('#today');
  expect(beforePost[0].historyState).toBeNull();
  await expectNoSecretPersistence(page, mock);
  await wakeBrowser(page);
  await page.clock.runFor(1000);
  expect(calls(mock, '/api/login')).toHaveLength(1);
  expect(calls(mock, '/api/bootstrap')).toHaveLength(0);
  pending.resolve();
  await expect(page.getByRole('heading', { name: 'Learn from your code.', exact: true })).toBeVisible();
  expect(mock.requests.slice(0, 2)).toEqual([
    { path: '/api/login', method: 'POST', body: { code: codes[0] } },
    { path: '/api/bootstrap', method: 'GET', body: null },
  ]);
  await expect(page.getByRole('button', { name: 'Connect phone', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings and account', exact: true }).click();
  await expect(page.locator('#dialog')).toContainText('Pairing codes can only be created from a local browser.');
  await expect(page.getByRole('button', { name: 'New QR code', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('link', { name: 'All lessons (0)', exact: true }).click();
  await expect(page).toHaveURL(/#learn$/);
  await page.goBack();
  await expect(page).toHaveURL(/#today$/); // replaceState must not leave the QR in history.
  await wakeBrowser(page);
  await expectNoSecretPersistence(page, mock);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Learn from your code.', exact: true })).toBeVisible();
  expect(calls(mock, '/api/login')).toHaveLength(1);
  expect(calls(mock, '/api/pair')).toHaveLength(0);
  await expectNoSecretDom(page, codes[0]);
  await expectNoSecretPersistence(page, mock);
});

test('a scanner reusing an open tab consumes the QR fragment once without a reload', async ({ page }) => {
  const mock = await fixture(page, { local: false, authenticated: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connect your phone.', exact: true })).toBeVisible();
  await page.evaluate(code => { location.hash = `pair=${code}`; }, codes[0]);
  await expect(page.getByRole('heading', { name: 'Learn from your code.', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#today$/);
  expect(calls(mock, '/api/login')).toEqual([{ path: '/api/login', method: 'POST', body: { code: codes[0] } }]);
  await expectNoSecretPersistence(page, mock);
});

for (const status of [401, 410, 503]) {
  test(`remote QR login ${status} opens manual recovery without automatic retry`, async ({ page }) => {
    await freezeClock(page);
    const mock = await fixture(page, { local: false, authenticated: false, loginReplies: [{ status }] });
    await page.goto(`/#pair=${codes[0]}`);
    await expect(page.getByRole('heading', { name: 'Connect your phone.', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#today$/);
    await expect(manualLogin(page)).toHaveJSProperty('open', true);
    await expect(page.getByLabel('Code from your Mac', { exact: true })).toHaveValue('');
    await expect(page.locator('#main')).toContainText('Could not connect.');
    await expect(page.getByRole('button', { name: 'Open my notebook', exact: true })).toBeEnabled();
    await wakeBrowser(page);
    await page.clock.fastForward(2 * lifetime);
    expect(mock.requests).toEqual([{ path: '/api/login', method: 'POST', body: { code: codes[0] } }]);
    await expectNoSecretDom(page, codes[0]);
    await expectNoSecretPersistence(page, mock);
    await page.getByRole('button', { name: 'Open my notebook', exact: true }).click();
    expect(calls(mock, '/api/login')).toHaveLength(1); // Empty manual form cannot retry the QR.
    await page.getByLabel('Code from your Mac', { exact: true }).fill(` ${codes[1]} `);
    expect(calls(mock, '/api/login')).toHaveLength(1); // Typing is not submission.
    await page.getByRole('button', { name: 'Open my notebook', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Learn from your code.', exact: true })).toBeVisible();
    expect(calls(mock, '/api/login')).toEqual([
      { path: '/api/login', method: 'POST', body: { code: codes[0] } },
      { path: '/api/login', method: 'POST', body: { code: codes[1] } },
    ]);
    expect(calls(mock, '/api/pair')).toHaveLength(0);
    await expectNoSecretPersistence(page, mock);
  });
}

for (const fragment of ['', codes[0].slice(1), `${codes[0]}X`, 'Ab9_-Cd2Ef3/', '%41b9_-Cd2Ef3G', `${codes[0]}&next=ask`]) {
  test(`invalid QR fragment ${JSON.stringify(fragment)} is stripped without login or bootstrap`, async ({ page }) => {
    await freezeClock(page);
    const mock = await fixture(page, { local: false, authenticated: false });
    await page.goto(`/#pair=${fragment}`);
    await expect(page.getByRole('heading', { name: 'Connect your phone.', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#today$/);
    await expect(manualLogin(page)).toHaveJSProperty('open', true);
    await expect(page.getByLabel('Code from your Mac', { exact: true })).toHaveValue('');
    await wakeBrowser(page);
    await page.clock.fastForward(2 * lifetime);
    expect(mock.requests).toEqual([]);
    await expect(page.getByRole('button', { name: 'Connect phone', exact: true })).toHaveCount(0);
    await expectNoSecretPersistence(page, mock, fragment ? [fragment] : []);
  });
}

test('ordinary remote login starts collapsed and manual failures require an explicit resubmission at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await freezeClock(page);
  const mock = await fixture(page, { local: false, authenticated: false, loginReplies: [{ status: 401, error: 'Fixture manual code rejected.' }] });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connect your phone.', exact: true })).toBeVisible();
  await expect(manualLogin(page)).toHaveJSProperty('open', false);
  await expect(page.getByLabel('Code from your Mac', { exact: true })).toBeHidden();
  expect(mock.requests).toEqual([{ path: '/api/bootstrap', method: 'GET', body: null }]);
  await expectFits(page, page.locator('#main'));
  await manualLogin(page).locator('summary').click();
  await page.getByLabel('Code from your Mac', { exact: true }).fill(codes[0]);
  await expectFits(page, manualLogin(page));
  await page.getByRole('button', { name: 'Open my notebook', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture manual code rejected.');
  await expect(manualLogin(page)).toHaveJSProperty('open', true);
  await expect(page.getByLabel('Code from your Mac', { exact: true })).toHaveValue(codes[0]);
  await expect(page.getByRole('button', { name: 'Open my notebook', exact: true })).toBeEnabled();
  await page.clock.fastForward(2 * lifetime);
  await wakeBrowser(page);
  expect(calls(mock, '/api/login')).toHaveLength(1);
  await page.getByLabel('Code from your Mac', { exact: true }).fill(codes[1]);
  await page.getByRole('button', { name: 'Open my notebook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Learn from your code.', exact: true })).toBeVisible();
  expect(calls(mock, '/api/login').map(request => request.body)).toEqual([{ code: codes[0] }, { code: codes[1] }]);
  expect(calls(mock, '/api/pair')).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Connect phone', exact: true })).toHaveCount(0);
  await expectNoSecretPersistence(page, mock);
});

test('320px local pairing keeps the complete QR, manual details and controls within the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const mock = await fixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(qrCanvas(page)).toBeVisible();
  await expectQr(page, mock);
  await expectFits(page, page.locator('#dialog'));
  expect(await qrCanvas(page).evaluate(node => {
    const qr = node.getBoundingClientRect();
    const dialog = node.closest('dialog').getBoundingClientRect();
    return qr.left >= dialog.left && qr.right <= dialog.right && qr.top >= dialog.top && qr.bottom <= dialog.bottom;
  })).toBe(true);
  await manualConnection(page).locator('summary').click();
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toBeVisible();
  for (const node of [manualConnection(page), page.getByLabel('Phone website address', { exact: true }), page.getByLabel('Short-lived pairing code', { exact: true }), page.getByRole('button', { name: 'New QR code', exact: true })]) {
    await expectFits(page, node);
  }
  await page.getByRole('button', { name: 'New QR code', exact: true }).click();
  await expect(page.getByLabel('Short-lived pairing code', { exact: true })).toHaveText(codes[1]);
  await expectQr(page, mock, 1);
  await expect(manualConnection(page)).toHaveJSProperty('open', false);
  await expectFits(page, page.locator('#dialog'));
  expect(calls(mock, '/api/pair')).toHaveLength(2);
});