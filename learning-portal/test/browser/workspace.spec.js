import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

const currentId = 'queue-v2';
const currentTitle = 'Queue recovery notes';
const lessonId = `session-${currentId}`;
const lessonTitle = 'Understand queue recovery';
const oldTitle = 'Queue first draft';
const defaultAnswer = '## Recovery explained\n\nKeep ownership explicit.';

function notebook(aiConsent) {
  const lesson = {
    id: lessonId, title: lessonTitle, summary: 'Keep retries bounded and cancellation explicit.',
    concepts: ['cancellation'], sourceIds: [],
    sections: [{ title: 'One owner', body: 'A single owner coordinates retries without losing the pending work.' }],
    exercise: 'Trace a cancelled retry and name the owner that cleans it up.',
    question: 'Who owns cancellation of the retry?', answer: 'The operation owner cancels the pending retry.',
    interview: 'Explain why one owner should coordinate retries.',
  };
  const session = {
    id: currentId, title: currentTitle, date: '2026-09-17T10:00:00Z', status: 'complete',
    summary: 'Recover interrupted uploads without duplicating work.',
    why: 'A retry must preserve the original operation and stop when its owner is cancelled.',
    changes: ['Added exponential backoff.', 'Kept one operation identity across reconnects.', 'Recorded cancellation before releasing the queue.'],
    concepts: ['cancellation'], sourceIds: [], exercise: lesson.exercise,
    evidence: [{ label: 'Retry test', state: 'reported', reference: 'A supplied record, not independent verification.' }],
    tasks: [
      { id: 'audit', title: 'Audit timeout edges', status: 'todo' },
      { id: 'probe', title: 'Probe reconnect overlap', status: 'in-progress' },
      { id: 'fence', title: 'Fence duplicate completion', status: 'done' },
    ],
    supersedes: 'queue-v1',
  };
  return {
    authenticated: true, local: false, chatAvailable: true,
    profile: { role: 'undecided', level: 'beginner', minutes: 25, language: 'english', learningStyle: 'standard', aiConsent },
    // Deliberately put an unrelated lesson first and retain an obsolete lesson:
    // links must use canonical IDs, not catalog order or a stale recap.
    lessons: [
      { ...lesson, id: 'unrelated', title: 'Unrelated starting lesson', question: 'An unrelated recall question?' },
      { ...lesson, id: 'session-queue-v1', title: 'Obsolete retry lesson', question: 'An obsolete recall question?' },
      lesson,
    ],
    sessions: [
      { ...session, id: 'queue-v1', title: oldTitle, date: '2026-09-15T10:00:00Z', supersedes: null, supersededBy: currentId,
        tasks: [{ id: 'old', title: 'Obsolete task sentinel', status: 'done' }] },
      { ...session, id: 'cache', title: 'Cache review notes', date: '2026-09-16T10:00:00Z', supersedes: null,
        summary: 'Review cache invalidation.', concepts: ['cache'], changes: ['Invalidated expired entries.'], tasks: [] },
      session,
    ],
    sources: [], progress: {}, reviews: {}, github: { configured: false, state: 'disabled' },
  };
}

// Each test owns its data and handlers. No provider, real account, production
// catalog, disk writes, or fallback to a live API is involved.
async function fixture(page, { aiConsent = false, chat, sources = [] } = {}) {
  const data = notebook(aiConsent);
  data.sources = sources.map(({ text, ...metadata }) => metadata);
  const requests = [];
  const writes = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = method === 'GET' ? null : request.postDataJSON();
    requests.push({ path, method });
    if (body !== null) writes.push({ path, body });
    if (path === '/api/bootstrap' && method === 'GET') return route.fulfill({ json: data });
    if (path === '/api/login' && method === 'POST') {
      data.authenticated = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (!data.authenticated) return route.fulfill({ status: 401, json: { error: 'Fixture browser is locked.' } });
    const source = sources.find(entry => path === `/api/source/${encodeURIComponent(entry.id)}`);
    if (source && method === 'GET') return route.fulfill({ json: source });
    if (path === '/api/profile' && method === 'PUT') {
      const { expectedAiConsent, ...profile } = body;
      if (profile.aiConsent && !data.profile.aiConsent && expectedAiConsent !== false) {
        return route.fulfill({ status: 409, json: { error: 'Fixture consent conflict.' } });
      }
      data.profile = profile;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/chat' && method === 'POST') {
      if (!data.profile.aiConsent) return route.fulfill({ status: 403, json: { error: 'Explicit consent required.' } });
      return route.fulfill({ json: chat ? await chat(body) : { answer: defaultAnswer, sources: [] } });
    }
    if (path === '/api/progress' && method === 'POST') {
      data.progress[body.lessonId] = { ...data.progress[body.lessonId], [body.step]: true };
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/logout' && method === 'POST') {
      data.authenticated = false;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 503, json: { error: `Unmocked workspace endpoint: ${method} ${path}` } });
  });
  return { data, requests, writes };
}

function currentEntry(page) {
  return page.locator('.session-entry').filter({ has: page.getByRole('heading', { name: currentTitle, exact: true }) });
}

async function openCurrentNote(page) {
  await page.getByRole('button', { name: `Read session notes: ${currentTitle}`, exact: true }).click();
  await expect(page.locator('#dialog-title')).toHaveText(currentTitle);
}

async function navigate(page, route) {
  // Same-document navigation exercises in-memory state; page.goto would reload it.
  await page.evaluate(value => { location.hash = value; }, route);
  await expect(page).toHaveURL(new RegExp(`#${route}$`));
  await expect(page).toHaveTitle(new RegExp(`^${{ today: 'Today', learn: 'Learn', sessions: 'Sessions', ask: 'Ask', practice: 'Practice', career: 'Career' }[route]} · Fieldnotes$`));
}

async function expectSameNode(handle, selector) {
  expect(await handle.evaluate((node, target) => node.isConnected && node === document.querySelector(target), selector)).toBe(true);
}

test('1280px keeps one persistent aside and the unsent draft across every route', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#today');
  const panel = page.getByRole('complementary', { name: 'Ask learning assistant' });
  await expect(panel).toBeVisible();
  const originalPanel = await panel.elementHandle();
  await page.locator('#ask-question').fill('Keep this across every workspace route.');
  for (const route of ['learn', 'sessions', 'ask', 'practice', 'career', 'today']) {
    await navigate(page, route);
    await expect(page.locator('#main h1')).toBeVisible();
    await expect(panel).toBeVisible();
    await expectSameNode(originalPanel, '#ask-panel');
    await expect(page.locator('#ask-question')).toHaveValue('Keep this across every workspace route.');
    await expect(page.locator('#ask-modal')).not.toBeVisible();
    await expect(page.locator('#ask-launcher')).toBeHidden();
    expect(await panel.evaluate(node => {
      const aside = node.getBoundingClientRect();
      const main = document.querySelector('#main').getBoundingClientRect();
      return getComputedStyle(node).position === 'fixed' && aside.width > 0 &&
        aside.left >= main.right && aside.right <= innerWidth && aside.top >= 0 && aside.bottom <= innerHeight;
    }), `separate desktop reading and Ask regions on ${route}`).toBe(true);
  }
  expect(writes).toEqual([]);
});

test('opening Ask preserves the session note and textarea DOM and selects the canonical context', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#sessions');
  await page.locator('#ask-question').fill('My question predates this note.');
  await openCurrentNote(page);
  await expect(page.locator('.assistant-context')).toHaveText(`Context: ${lessonTitle}`);
  await expect(page.locator('#ask-lesson')).toHaveValue(lessonId);
  await expect(page.locator('#ask-question')).toHaveValue('My question predates this note.');
  const note = await page.locator('#dialog > .dialog-body').elementHandle();
  const draft = await page.locator('#ask-question').elementHandle();
  await page.locator('#ask-question').evaluate(node => node.setSelectionRange(3, 11));
  await page.getByRole('button', { name: 'Ask while reading', exact: true }).click();
  await expectSameNode(note, '#dialog > .dialog-body');
  await expectSameNode(draft, '#ask-question');
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#ask-question')).toBeFocused();
  expect(await page.locator('#ask-question').evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([3, 11]);
  await expect(page).toHaveURL(/#sessions$/);
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  expect(writes).toEqual([]);
});

test('320px Ask is above the note; Escape restores focus, note scroll and the same draft', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const { writes } = await fixture(page);
  await page.goto('/#sessions');
  await openCurrentNote(page);
  const note = page.locator('#dialog');
  const noteBody = await page.locator('#dialog > .dialog-body').elementHandle();
  const trigger = page.getByRole('button', { name: 'Ask while reading', exact: true });
  await trigger.focus();
  const scroll = await note.evaluate(node => { node.scrollTop = 240; return node.scrollTop; });
  expect(scroll).toBeGreaterThan(0);
  // Keyboard activation avoids Playwright scrolling the sticky trigger into view.
  await page.keyboard.press('Enter');
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', true);
  await expect(note).toHaveJSProperty('open', true);
  await expect(page.locator('#ask-modal > #ask-panel')).toBeVisible();
  await expect(page.locator('#ask-question')).toBeFocused();
  await expect(page.locator('.assistant-context')).toHaveText(`Context: ${lessonTitle}`);
  const draft = await page.locator('#ask-question').elementHandle();
  await page.locator('#ask-question').fill('A mobile draft must survive Escape.');
  expect(await page.locator('#ask-question').evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === node;
  }), 'the top-layer Ask textarea, not the underlying note, receives input').toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('#ask-panel').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ask-modal')).not.toBeVisible();
  await expect(note).toHaveJSProperty('open', true);
  await expect(trigger).toBeFocused();
  await expectSameNode(noteBody, '#dialog > .dialog-body');
  await expect.poll(() => note.evaluate(node => node.scrollTop)).toBe(scroll);
  await page.keyboard.press('Enter');
  await expect(page.locator('#ask-question')).toBeFocused();
  await expectSameNode(draft, '#ask-question');
  await expect(page.locator('#ask-question')).toHaveValue('A mobile draft must survive Escape.');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect.poll(() => note.evaluate(node => node.scrollTop)).toBe(scroll);
  expect(writes).toEqual([]);
});

test('mobile answer source replaces an existing note without remaining inert and preserves the unsent draft', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const source = { id: 'hopper-contracts', path: 'hopper/AGENTS.md', start: 1, end: 230, hash: 'a'.repeat(64), missing: false,
    text: '1: Source fixture: one owner coordinates cancellation.' };
  const { requests, writes } = await fixture(page, { aiConsent: true, sources: [source], chat: async () => ({
    answer: '## Recorded ownership\n\nInspect the supplied source [S1].',
    sources: [{ id: source.id, path: source.path, hash: source.hash }],
  }) });
  await page.goto('/#sessions');
  await openCurrentNote(page);
  await page.getByRole('button', { name: 'Ask while reading', exact: true }).click();
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', true);
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await page.locator('#ask-question').fill('Explain the recorded owner.');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const answer = page.locator('.chat-message:not(.user)');
  await expect(answer).toContainText('Recorded ownership');
  const draft = 'Keep this unsent question while inspecting the source.';
  await page.locator('#ask-question').fill(draft);
  const originalDraft = await page.locator('#ask-question').elementHandle();
  await expect(page.locator('#dialog-title')).toHaveText(currentTitle);
  await answer.getByRole('button', { name: `Read source: ${source.path}`, exact: true }).click();
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', false);
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#dialog-title')).toHaveText('Source notebook');
  const contents = page.getByLabel('Source file contents', { exact: true });
  await expect(contents).toBeVisible();
  await expect(contents).toHaveText(source.text);
  // A visible element can still be inert beneath another modal. An unforced
  // click and real focus check exercise hit testing and effective inertness.
  await contents.click();
  await expect(contents).toBeFocused();
  expect(requests.filter(entry => entry.path.startsWith('/api/source/'))).toEqual([{ path: `/api/source/${source.id}`, method: 'GET' }]);
  await page.getByRole('button', { name: 'Ask while reading', exact: true }).click();
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', true);
  await expect(page.locator('#ask-question')).toBeFocused();
  await expectSameNode(originalDraft, '#ask-question');
  await expect(page.locator('#ask-question')).toHaveValue(draft);
  await expect(page.locator('#ask-lesson')).toHaveValue(lessonId);
  await expect(page.locator('.chat-message')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', false);
  await expect(contents).toBeVisible();
  await expect(page.locator('#dialog-title')).toHaveText('Source notebook');
  await expect(page).toHaveURL(/#sessions$/);
  expect(writes).toEqual([{ path: '/api/chat', body: { question: 'Explain the recorded owner.', mode: 'teach', lessonId, history: [] } }]);
});

test('resizing a mobile Ask overlay to desktop retains textarea focus, selection and the open note', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const { writes } = await fixture(page);
  await page.goto('/#sessions');
  await openCurrentNote(page);
  const note = await page.locator('#dialog > .dialog-body').elementHandle();
  await page.getByRole('button', { name: 'Ask while reading', exact: true }).click();
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', true);
  const textarea = page.locator('#ask-question');
  const draft = 'Keep this selected phrase across resizing.';
  await textarea.fill(draft);
  const originalDraft = await textarea.elementHandle();
  await textarea.evaluate(node => node.setSelectionRange(5, 18));
  await expect(textarea).toBeFocused();
  expect(await textarea.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([5, 18]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', false);
  await expect(page.locator('#dialog > #ask-panel')).toBeVisible();
  await expect(page.locator('#ask-launcher')).toBeHidden();
  await expect(textarea).toBeFocused();
  await expectSameNode(originalDraft, '#ask-question');
  await expectSameNode(note, '#dialog > .dialog-body');
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#dialog-title')).toHaveText(currentTitle);
  await expect(textarea).toHaveValue(draft);
  await expect.poll(() => textarea.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([5, 18]);
  // Do not refocus or fill: native typing must replace the retained selection.
  await page.keyboard.type('replacement');
  await expect(textarea).toHaveValue(`${draft.slice(0, 5)}replacement${draft.slice(18)}`);
  await expect(page.locator('#ask-lesson')).toHaveValue(lessonId);
  await expect(page).toHaveURL(/#sessions$/);
  expect(writes).toEqual([]);
});

test('resizing desktop Ask from 1280px to 390px preserves focused textarea DOM, selection, native typing and the open note', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#sessions');
  await openCurrentNote(page);
  await page.getByRole('button', { name: 'Ask while reading', exact: true }).click();
  await expect(page.locator('#dialog > #ask-panel')).toBeVisible();
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', false);
  const panel = await page.locator('#ask-panel').elementHandle();
  const noteBody = page.locator('#dialog > .dialog-body');
  const note = await noteBody.elementHandle();
  const noteText = await noteBody.textContent();
  const textarea = page.locator('#ask-question');
  const draft = 'Keep this selected phrase across resizing.';
  await textarea.fill(draft);
  const originalDraft = await textarea.elementHandle();
  await textarea.evaluate(node => node.setSelectionRange(5, 18));
  await expect(textarea).toBeFocused();
  expect(await textarea.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([5, 18]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', true);
  await expect(page.locator('#ask-modal > #ask-panel')).toBeVisible();
  await expectSameNode(panel, '#ask-panel');
  await expectSameNode(originalDraft, '#ask-question');
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue(draft);
  await expect.poll(() => textarea.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([5, 18]);
  // No click, focus(), fill() or reselection after resizing: browser input must
  // replace the selection retained through showModal() and DOM reparenting.
  await page.keyboard.type('replacement');
  const editedDraft = `${draft.slice(0, 5)}replacement${draft.slice(18)}`;
  await expect(textarea).toHaveValue(editedDraft);
  await expectSameNode(note, '#dialog > .dialog-body');
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#dialog-title')).toHaveText(currentTitle);
  await expect(noteBody).toHaveText(noteText);
  await expect(page.locator('#ask-lesson')).toHaveValue(lessonId);
  await expect(page).toHaveURL(/#sessions$/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', false);
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expectSameNode(note, '#dialog > .dialog-body');
  await expect(noteBody).toHaveText(noteText);
  await page.getByRole('button', { name: 'Ask while reading', exact: true }).click();
  await expect(textarea).toBeFocused();
  await expectSameNode(originalDraft, '#ask-question');
  await expect(textarea).toHaveValue(editedDraft);
  expect(writes).toEqual([]);
});

test('resizing #ask from 1280px to 390px with a source open keeps the focused assistant interactive above the source', async ({ page }) => {
  const source = { id: 'resize-ownership', path: 'hopper/ownership.md', start: 1, end: 1, hash: 'b'.repeat(64), missing: false,
    text: '1: Source fixture: retain the operation owner across resizing.' };
  const question = 'Explain the recorded resize owner.';
  const { requests, writes } = await fixture(page, { aiConsent: true, sources: [source], chat: async () => ({
    answer: '## Resize ownership\n\nInspect the supplied source [S1].',
    sources: [{ id: source.id, path: source.path, hash: source.hash }],
  }) });
  await page.goto('/#ask');
  await page.locator('#ask-question').fill(question);
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const answer = page.locator('.chat-message:not(.user)');
  await expect(answer).toContainText('Resize ownership');
  await answer.getByRole('button', { name: `Read source: ${source.path}`, exact: true }).click();
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#dialog-title')).toHaveText('Source notebook');
  const contents = page.getByLabel('Source file contents', { exact: true });
  await expect(contents).toHaveText(source.text);
  await expect(page.locator('#dialog > #ask-panel')).toBeVisible();
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', false);
  await expect(page).toHaveURL(/#ask$/);
  const sourceBody = await page.locator('#dialog > .dialog-body').elementHandle();
  const originalContents = await contents.elementHandle();
  const panel = await page.locator('#ask-panel').elementHandle();
  const textarea = page.locator('#ask-question');
  const draft = 'Keep this selected phrase while reading the source.';
  await textarea.fill(draft);
  const originalDraft = await textarea.elementHandle();
  await textarea.evaluate(node => node.setSelectionRange(5, 18));
  await expect(textarea).toBeFocused();
  expect(await textarea.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([5, 18]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', true);
  await expect(page.locator('#ask-modal > #ask-panel')).toBeVisible();
  await expectSameNode(panel, '#ask-panel');
  await expectSameNode(originalDraft, '#ask-question');
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue(draft);
  await expect.poll(() => textarea.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([5, 18]);
  // Typing without refocusing proves effective interactivity, not merely a
  // visible panel or an absent inert attribute on a descendant of a modal.
  await page.keyboard.type('replacement');
  const editedDraft = `${draft.slice(0, 5)}replacement${draft.slice(18)}`;
  await expect(textarea).toHaveValue(editedDraft);
  // Also exercise real pointer hit testing, only after checking the selection.
  await textarea.click();
  await expect(textarea).toBeFocused();
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expectSameNode(sourceBody, '#dialog > .dialog-body');
  await expectSameNode(originalContents, '#dialog .source-code');
  await expect(page.locator('#dialog-title')).toHaveText('Source notebook');
  await expect(contents).toHaveText(source.text);
  await expect(page.locator('.chat-message')).toHaveCount(2);
  await expect(page).toHaveURL(/#ask$/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#ask-modal')).toHaveJSProperty('open', false);
  await expect(page.locator('#dialog')).toHaveJSProperty('open', true);
  await expectSameNode(sourceBody, '#dialog > .dialog-body');
  await expectSameNode(originalContents, '#dialog .source-code');
  await contents.click();
  await expect(contents).toBeFocused();
  await expect(contents).toHaveText(source.text);
  await expectSameNode(originalDraft, '#ask-question');
  await expect(textarea).toHaveValue(editedDraft);
  expect(requests.filter(entry => entry.path.startsWith('/api/source/'))).toEqual([{ path: `/api/source/${source.id}`, method: 'GET' }]);
  expect(writes).toEqual([{ path: '/api/chat', body: { question, mode: 'teach', history: [] } }]);
});

test('opening Ask and selecting context never sends; consent and Send are separate explicit actions', async ({ page }) => {
  const { data, writes } = await fixture(page);
  await page.goto('/#learn');
  await page.getByRole('button', { name: `Open lesson: ${lessonTitle}`, exact: true }).click();
  await page.getByRole('button', { name: 'Ask while reading', exact: true }).click();
  await page.locator('#ask-question').fill('Explain cancellation ownership.');
  await expect(page.locator('#ask-lesson')).toHaveValue(lessonId);
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Enable AI below to ask', exact: true })).toBeDisabled();
  expect(data.profile.aiConsent).toBe(false);
  expect(writes).toEqual([]);
  await page.locator('#chat-consent').check();
  expect(writes).toEqual([]);
  await expect(page.getByRole('button', { name: 'Enable AI below to ask', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save consent & enable asking', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeEnabled();
  expect(writes).toEqual([{ path: '/api/profile', body: { ...data.profile, expectedAiConsent: false } }]);
  expect(data.profile.aiConsent).toBe(true);
  await expect(page.locator('#ask-question')).toHaveValue('Explain cancellation ownership.');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(2);
  expect(writes.filter(entry => entry.path === '/api/chat')).toEqual([{ path: '/api/chat', body: {
    question: 'Explain cancellation ownership.', mode: 'teach', lessonId, history: [],
  } }]);
});

test('successful mocked answers render headings, lists and code while hostile markup stays inert', async ({ page }) => {
  const markup = '<img src="/workspace-markup-probe" onerror="globalThis.__workspaceMarkupExecuted=true">';
  const answer = [
    '## One owner', '', 'Use **bounded retries** and *explicit cancellation* with `owner.cancel()`.', '',
    '- Keep identity', '- Stop on cancellation', '', '### Check it', '', '1. Start work', '2. Cancel it', '',
    '```javascript', 'const example = "<button>not executable</button>";', 'owner.cancel();', '```', '',
    markup, '<script>globalThis.__workspaceMarkupExecuted=true</script>',
    '<svg onload="globalThis.__workspaceMarkupExecuted=true"></svg>',
    '[unsafe](javascript:globalThis.__workspaceMarkupExecuted=true)',
  ].join('\n');
  await page.addInitScript(() => { globalThis.__workspaceMarkupExecuted = false; });
  const probes = [];
  page.on('request', request => { if (request.url().includes('workspace-markup-probe')) probes.push(request.url()); });
  const { writes } = await fixture(page, { aiConsent: true, chat: async () => ({ answer, sources: [] }) });
  await page.goto('/#ask');
  await page.locator('#ask-question').fill('Show a formatted explanation.');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const rich = page.locator('.chat-message:not(.user) .rich-text');
  await expect(rich.getByRole('heading', { name: 'One owner', level: 2 })).toBeVisible();
  await expect(rich.getByRole('heading', { name: 'Check it', level: 3 })).toHaveCount(1);
  await expect(rich.locator('ul > li')).toHaveText(['Keep identity', 'Stop on cancellation']);
  await expect(rich.locator('ol > li')).toHaveText(['Start work', 'Cancel it']);
  await expect(rich.locator('strong')).toHaveText('bounded retries');
  await expect(rich.locator('em')).toHaveText('explicit cancellation');
  await expect(rich.locator('p > code')).toHaveText('owner.cancel()');
  await expect(rich.locator('pre > code')).toHaveText('const example = "<button>not executable</button>";\nowner.cancel();');
  await expect(rich).toContainText(markup);
  await expect(rich).toContainText('[unsafe](javascript:');
  await expect(rich.locator('img, script, svg, iframe, a, button, [onerror], [onload]')).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__workspaceMarkupExecuted)).toBe(false);
  expect(probes).toEqual([]);
  await expect(page.locator('.chat-message')).toHaveCount(2);
  await expect(page.locator('#ask-question')).toHaveValue('');
  expect(writes.map(entry => entry.path)).toEqual(['/api/chat']);
});

test('an answer arriving after navigation keeps the new draft and the open note intact', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { writes } = await fixture(page, { aiConsent: true, chat: async () => {
    await gate;
    return { answer: '## Delayed answer\n\nThis answers only the submitted question.', sources: [] };
  } });
  try {
    await page.goto('/#ask');
    await page.locator('#ask-question').fill('The original submitted question.');
    await page.getByRole('button', { name: 'Send question', exact: true }).click();
    await expect.poll(() => writes.filter(entry => entry.path === '/api/chat').length).toBe(1);
    await expect(page.getByRole('button', { name: 'Asking…', exact: true })).toBeDisabled();
    await navigate(page, 'sessions');
    await openCurrentNote(page);
    const note = await page.locator('#dialog > .dialog-body').elementHandle();
    await expect(page.locator('#ask-lesson')).toBeDisabled();
    await page.locator('#ask-question').fill('A new draft typed while the first answer is pending.');
    release();
    await expect(page.locator('.chat-message:not(.user)')).toContainText('Delayed answer');
    await expect(page.locator('.chat-message.user')).toContainText('The original submitted question.');
    await expect(page.locator('#ask-question')).toHaveValue('A new draft typed while the first answer is pending.');
    await expectSameNode(note, '#dialog > .dialog-body');
    await expect(page.locator('#dialog-title')).toHaveText(currentTitle);
    await expect(page).toHaveURL(/#sessions$/);
    await expect(page.locator('#ask-lesson')).toBeEnabled();
    expect(writes).toEqual([{ path: '/api/chat', body: { question: 'The original submitted question.', mode: 'teach', history: [] } }]);
  } finally {
    release(); // Never leave an intercepted request waiting if an assertion fails.
  }
});

test('Clear removes both message roles; signing out also clears drafts and prevents history resurfacing', async ({ page }) => {
  const { writes } = await fixture(page, { aiConsent: true });
  await page.goto('/#ask');
  await page.locator('#ask-question').fill('Private first question.');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(2);
  await page.locator('#ask-question').fill('Keep this unsent draft when clearing.');
  await page.getByRole('button', { name: 'Clear conversation', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await expect(page.locator('#ask-question')).toHaveValue('Keep this unsent draft when clearing.');
  await navigate(page, 'career');
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(2);
  expect(writes.filter(entry => entry.path === '/api/chat')[1].body.history).toEqual([]);
  await page.locator('#ask-question').fill('Private unsent signout sentinel.');
  await page.getByRole('button', { name: 'Settings and account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out of this browser', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect your phone.', exact: true })).toBeVisible();
  await expect(page.locator('#ask-panel')).toBeEmpty();
  await expect(page.locator('#ask-panel')).toBeHidden();
  await expect(page.locator('#ask-launcher')).toBeHidden();
  await expect(page.locator('#ask-modal')).not.toBeVisible();
  await expect(page.locator('#dialog')).toBeEmpty();
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Private unsent signout sentinel.');
  // Reauthenticate without a reload so this checks the actual lock/reset path.
  await page.getByText('Enter a code instead', { exact: true }).click();
  await page.getByLabel('Code from your Mac', { exact: true }).fill('DEMO-NOTREAL');
  await page.getByRole('button', { name: 'Open my notebook', exact: true }).click();
  await expect(page.locator('#ask-panel')).toBeVisible();
  await expect(page.locator('#ask-question')).toHaveValue('');
  await expect(page.locator('.chat-message')).toHaveCount(0);
  expect(writes.map(entry => entry.path)).toEqual(['/api/chat', '/api/chat', '/api/logout', '/api/login']);
});

test('session search includes changes, concepts and tasks, and task groups use only explicit records', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#sessions');
  await expect(page.locator('.session-timeline .lesson-card h3')).toHaveText([currentTitle, 'Cache review notes']);
  await expect(page.locator('.session-overview .metric strong')).toHaveText(['2', '3', '1']);
  const search = page.getByRole('searchbox', { name: 'Search session notes' });
  for (const query of ['QUEUE RECOVERY', 'interrupted uploads', 'exponential backoff', 'cancellation', '  Probe reconnect overlap  ']) {
    await search.fill(query);
    await expect(page.locator('.session-timeline .lesson-card h3')).toHaveText([currentTitle]);
  }
  await search.fill('no-such-published-note');
  await expect(page.locator('.session-entry')).toHaveCount(0);
  await expect(page.locator('.session-timeline')).toContainText('No matching published notes');
  await search.fill('');
  await openCurrentNote(page);
  const groups = page.locator('#dialog .task-column');
  await expect(groups.locator('h3')).toHaveText(['To do · 1', 'In progress · 1', 'Done in record · 1']);
  await expect(groups.nth(0).locator('li')).toHaveText(['Audit timeout edges']);
  await expect(groups.nth(1).locator('li')).toHaveText(['Probe reconnect overlap']);
  await expect(groups.nth(2).locator('li')).toHaveText(['Fence duplicate completion']);
  await expect(page.getByRole('region', { name: 'Session tasks', exact: true })).not.toContainText('Added exponential backoff.');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Read session notes: Cache review notes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Session tasks', exact: true })).toContainText('No explicit task list was published');
  await expect(page.locator('#dialog .task-column')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('Learn from a session follows its canonical lesson through read, try and recall', async ({ page }) => {
  const { data, writes } = await fixture(page);
  await page.goto('/#sessions');
  await currentEntry(page).getByRole('button', { name: 'Learn from this session', exact: true }).click();
  await expect(page.locator('#dialog-title')).toHaveText(lessonTitle);
  await expect(page.locator('#ask-lesson')).toHaveValue(lessonId);
  await expect(page.getByRole('button', { name: 'I tried the exercise', exact: true })).toBeDisabled();
  await expect(page.locator('#lesson-exercise')).toHaveJSProperty('open', false);
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'I’ve read this · next: exercise', exact: true }).click();
  await expect(page.locator('#lesson-exercise')).toHaveJSProperty('open', true);
  await expect(page.locator('#lesson-exercise')).toContainText(data.lessons[2].exercise);
  await expect(page.getByRole('button', { name: 'I tried the exercise', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'I tried the exercise', exact: true }).click();
  await expect(page.getByRole('button', { name: '3. Recall this lesson', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3. Recall this lesson', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await expect(page.locator('.practice-card h2')).toHaveText(data.lessons[2].question);
  await expect(page.locator('#practice-answer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.locator('#practice-answer')).toContainText(data.lessons[2].answer);
  expect(writes).toEqual([
    { path: '/api/progress', body: { lessonId, step: 'read' } },
    { path: '/api/progress', body: { lessonId, step: 'attempted' } },
  ]);
  await navigate(page, 'sessions');
  await expect(currentEntry(page).getByRole('list', { name: 'Note to learning path' }).locator('li'))
    .toHaveText(['1. Read notes', '2. Lesson read', '3. Attempt recorded', '4. Recall']);
});

for (const width of [320, 1280]) {
  for (const entry of ['card', 'note']) {
    for (const stage of ['try', 'review']) {
      test(`${width}px session ${entry} resumes ${stage} in one click without side effects`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const { data, writes } = await fixture(page);
        data.progress[lessonId] = { read: true, ...(stage === 'review' ? { attempted: true } : {}) };
        const before = structuredClone({ progress: data.progress, reviews: data.reviews, profile: data.profile });
        await page.goto('/#sessions');
        if (width < 1100) await page.getByRole('button', { name: 'Ask anything', exact: true }).click();
        await page.locator('#ask-question').fill('Keep my unsent learning question.');
        if (width < 1100) await page.keyboard.press('Escape');
        if (entry === 'note') await openCurrentNote(page);
        const host = entry === 'note' ? page.locator('#dialog') : currentEntry(page);
        await host.getByRole('button', { name: stage === 'try' ? 'Continue exercise' : 'Recall this lesson', exact: true }).click();
        if (stage === 'try') {
          await expect(page.locator('#dialog-title')).toHaveText(lessonTitle);
          await expect(page.locator('#lesson-exercise')).toHaveJSProperty('open', true);
          await expect(page.locator('#lesson-exercise > summary')).toBeFocused();
          await expect(page.locator('#lesson-exercise')).toContainText(data.lessons[2].exercise);
          await expect(page.locator('#lesson-exercise details')).toHaveJSProperty('open', false);
          await expect(page.getByRole('button', { name: 'I tried the exercise', exact: true })).toBeEnabled();
        } else {
          await expect(page).toHaveURL(/#practice$/);
          await expect(page.locator('#dialog')).toHaveJSProperty('open', false);
          await expect(page.locator('.practice-card h2')).toHaveText(data.lessons[2].question);
          await expect(page.locator('#practice-answer')).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Reveal answer', exact: true })).toBeVisible();
        }
        await expect(page.locator('#ask-question')).toHaveValue('Keep my unsent learning question.');
        await expect(page.locator('#chat-consent')).not.toBeChecked();
        expect({ progress: data.progress, reviews: data.reviews, profile: data.profile }).toEqual(before);
        expect(writes).toEqual([]);
      });
    }
  }
}

for (const due of [1, 8_000_000_000_000]) {
  test(`session shortcut respects recorded review due ${due}`, async ({ page }) => {
    const { data, writes } = await fixture(page);
    data.progress[lessonId] = { read: true, attempted: true };
    data.reviews[lessonId] = { due };
    await page.goto('/#sessions');
    await currentEntry(page).getByRole('button', { name: due === 1 ? 'Recall this lesson' : 'Revisit lesson', exact: true }).click();
    if (due === 1) {
      await expect(page.locator('.practice-card h2')).toHaveText(data.lessons[2].question);
      await expect(page.locator('#practice-answer')).toHaveCount(0);
    } else {
      await expect(page.locator('#dialog-title')).toHaveText(lessonTitle);
      await expect(page.locator('#lesson-exercise')).toHaveJSProperty('open', false);
    }
    expect(writes).toEqual([]);
  });
}

test('session shortcut rechecks a review deadline crossed while its note stays open', async ({ page }) => {
  const now = new Date('2026-09-17T12:00:00Z');
  await page.clock.install({ time: now });
  const { data, writes } = await fixture(page);
  data.progress[lessonId] = { read: true, attempted: true };
  data.reviews[lessonId] = { due: now.getTime() + 60_000 };
  await page.goto('/#sessions');
  await openCurrentNote(page);
  const shortcut = page.locator('#dialog').getByRole('button', { name: 'Revisit lesson', exact: true });
  await expect(shortcut).toBeVisible();
  await page.clock.setSystemTime(new Date(now.getTime() + 60_001));
  await shortcut.click();
  await expect(page.locator('.practice-card h2')).toHaveText(data.lessons[2].question);
  await expect(page.locator('#practice-answer')).toHaveCount(0);
  expect(writes).toEqual([]);
});

for (const change of ['progress', 'removed', 'superseded']) {
  test(`session shortcut rechecks ${change} after quiet refresh preserves an open note`, async ({ page }) => {
    const { data, writes } = await fixture(page);
    if (change !== 'progress') data.progress[lessonId] = { read: true, attempted: true };
    await page.goto('/#sessions');
    await openCurrentNote(page);
    const note = await page.locator('#dialog > .dialog-body').elementHandle();
    await page.locator('#ask-question').fill('Retain this while the notebook refreshes.');
    if (change === 'progress') data.progress[lessonId] = { read: true };
    else if (change === 'removed') data.lessons = data.lessons.filter(lesson => lesson.id !== lessonId);
    else data.sessions.find(session => session.id === currentId).supersededBy = 'queue-v3';
    const response = page.waitForResponse('**/api/bootstrap');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await response;
    // The busy attribute is cleared only after the refreshed state is applied.
    await expect(page.locator('#main')).toHaveAttribute('aria-busy', 'false');
    await expectSameNode(note, '#dialog > .dialog-body');
    await page.locator('#dialog').getByRole('button', { name: change === 'progress' ? 'Learn from this session' : 'Recall this lesson', exact: true }).click();
    if (change === 'progress') {
      await expect(page.locator('#lesson-exercise')).toHaveJSProperty('open', true);
      await expect(page.locator('#lesson-exercise > summary')).toBeFocused();
    } else {
      await expect(page.locator('#dialog')).toHaveJSProperty('open', false);
      await expect(page).toHaveURL(/#sessions$/);
      await expect(page.locator('#notice')).toContainText('This lesson is no longer available here.');
      await expect(page.locator('.practice-card')).toHaveCount(0);
    }
    await expect(page.locator('#ask-question')).toHaveValue('Retain this while the notebook refreshes.');
    expect(writes).toEqual([]);
  });
}

test('session without a canonical lesson has no learning shortcut', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#sessions');
  const region = page.getByRole('region', { name: 'Learning path: Cache review notes', exact: true });
  await expect(region).toContainText('No linked lesson is available yet.');
  await expect(region.getByRole('button')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('session recall shortcut preserves a different unresolved review', async ({ page }) => {
  const { data, writes } = await fixture(page);
  data.progress[lessonId] = { read: true, attempted: true };
  await page.route('**/api/review', route => route.fulfill({ status: 503, json: { error: 'Rating not saved.' } }));
  await page.goto('/#practice');
  await expect(page.locator('.practice-card h2')).toHaveText('An unrelated recall question?');
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await page.getByRole('button', { name: 'Good: Got the idea', exact: true }).click();
  await expect(page.locator('#main')).toContainText('Rating not saved.');
  await navigate(page, 'sessions');
  await currentEntry(page).getByRole('button', { name: 'Recall this lesson', exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  await expect(page.locator('.practice-card h2')).toHaveText('An unrelated recall question?');
  await expect(page.locator('#notice')).toContainText('Finish saving your current review first.');
  await expect(page.locator('#main')).toContainText('Rating not saved.');
  expect(data.reviews).toEqual({});
  expect(writes).toEqual([]);
});

test('archived recaps never offer stale learning and lead back to the current lesson', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#sessions');
  await expect(page.locator('.session-timeline')).not.toContainText(oldTitle);
  await page.getByRole('searchbox', { name: 'Search session notes' }).fill('Obsolete task sentinel');
  await expect(page.locator('.session-entry')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search session notes' }).fill('');
  await page.getByText('Earlier versions (1)', { exact: true }).click();
  await page.getByRole('button', { name: `Read session notes: ${oldTitle}`, exact: true }).click();
  await expect(page.locator('#dialog-title')).toHaveText(oldTitle);
  const path = page.getByRole('region', { name: `Learning path: ${oldTitle}`, exact: true });
  await expect(path).toContainText('Use the newer recap for learning.');
  await expect(path.getByRole('button')).toHaveCount(0);
  await page.locator('#dialog > .dialog-body').getByRole('button', { name: 'Read the newer recap →', exact: true }).click();
  await expect(page.locator('#dialog-title')).toHaveText(currentTitle);
  await page.locator('#dialog').getByRole('region', { name: `Learning path: ${currentTitle}`, exact: true })
    .getByRole('button', { name: 'Learn from this session', exact: true }).click();
  await expect(page.locator('#dialog-title')).toHaveText(lessonTitle);
  await expect(page.locator('#ask-lesson')).toHaveValue(lessonId);
  await expect(page.locator('#dialog > .dialog-body')).not.toContainText('An obsolete recall question?');
  expect(writes).toEqual([]);
});