import { test, expect } from '@playwright/test';
import { lessons } from '../../server/catalog.js';

async function fixture(page, overrides = {}) {
  const data = { authenticated: true, local: true, publicUrl: 'https://example.trycloudflare.com',
    profile: { role: 'undecided', level: 'beginner', minutes: 25, language: 'english', aiConsent: false },
    lessons, sessions: [], sources: [], progress: {}, reviews: {}, chatAvailable: true,
    github: { configured: true, state: 'pending', message: 'Notebook changes are waiting to sync.', lastSyncedAt: null, repo: 'private-owner/private-notebook', branch: 'main' }, ...overrides };
  const writes = [];
  const requests = [];
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    const body = req.method() === 'GET' ? null : req.postDataJSON();
    requests.push({ path, method: req.method() });
    if (body) writes.push({ path, body });
    if (path === '/api/bootstrap') return route.fulfill({ json: data });
    if (data.authenticated !== true) return route.fulfill({ status: 401, json: { error: 'Pair this browser.' } });
    if (path === '/api/github' && req.method() === 'GET') return route.fulfill({ json: data.github });
    if (path === '/api/profile' && req.method() === 'PUT') {
      const { expectedAiConsent, ...profile } = body;
      if (profile.aiConsent && !data.profile.aiConsent && expectedAiConsent !== false) {
        return route.fulfill({ status: 409, json: { error: 'AI consent changed. Preferences were not saved.' } });
      }
      data.profile = profile;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/logout' && req.method() === 'POST') {
      data.authenticated = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/progress') {
      data.progress[body.lessonId] = { ...data.progress[body.lessonId], [body.step]: true };
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/pair') return route.fulfill({ json: { code: 'DEMO-NOTREAL', expiresAt: Date.now() + 300000 } });
    return route.fulfill({ status: 503, json: { error: 'Fixture: unavailable; nothing sent.' } });
  });
  return { data, writes, requests };
}

const focusedProfile = { role: 'undecided', level: 'beginner', minutes: 25, language: 'english', learningStyle: 'focused', aiConsent: false };

test('legacy profile defaults to standard; focused saves explicitly without enabling consent', async ({ page }) => {
  const { data, writes } = await fixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await expect(page.locator('#profile-learning-style')).toHaveValue('standard');
  await page.locator('#profile-learning-style').selectOption('focused');
  await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
  await expect(page.locator('#profile-consent')).not.toBeChecked();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Save learning preferences', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/focused-learning/);
  expect(writes).toEqual([{ path: '/api/profile', body: { ...focusedProfile, expectedAiConsent: false } }]);
  expect(data.profile).toEqual(focusedProfile);
  expect(data.profile.aiConsent).toBe(false);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/focused-learning/);
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await expect(page.locator('#profile-learning-style')).toHaveValue('focused');
  await page.locator('#profile-learning-style').selectOption('standard');
  await page.getByRole('button', { name: 'Save learning preferences', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
  expect(writes.at(-1).body).toEqual({ ...focusedProfile, learningStyle: 'standard', expectedAiConsent: false });
});

test('saving unchanged legacy settings still sends explicit standard presentation', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await page.getByRole('button', { name: 'Save learning preferences', exact: true }).click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect(writes[0].body.learningStyle).toBe('standard');
  expect(writes[0].body.aiConsent).toBe(false);
  expect(writes[0].body.expectedAiConsent).toBe(false);
});

test('failed presentation save retains inputs, consent and the server-loaded style', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/profile', route => route.fulfill({ status: 503, json: { error: 'Mock save unavailable.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await page.locator('#profile-learning-style').selectOption('focused');
  await page.getByRole('button', { name: 'Save learning preferences', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Mock save unavailable.');
  await expect(page.locator('#profile-learning-style')).toHaveValue('focused');
  await expect(page.locator('#profile-consent')).not.toBeChecked();
  await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
});

test('stale checked settings cannot restore consent after another client withdraws it', async ({ page }) => {
  const original = { ...focusedProfile, learningStyle: 'standard', aiConsent: true };
  const { data, writes } = await fixture(page, { profile: { ...original } });
  await page.goto('/#ask');
  await page.getByRole('textbox', { name: 'Your question' }).fill('Keep my unsent question.');
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await expect(page.locator('#profile-consent')).toBeChecked();
  await page.locator('#profile-learning-style').selectOption('focused');
  // Simulate client B's completed withdrawal after client A opened Settings.
  data.profile = { ...original, aiConsent: false };
  await page.getByRole('button', { name: 'Save learning preferences', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Consent may have changed in another browser');
  await expect(page.getByRole('alert')).toContainText('Preferences were not saved');
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#profile-learning-style')).toHaveValue('focused');
  await expect(page.locator('#profile-consent')).toBeChecked();
  await expect(page.locator('#profile-consent')).toBeEnabled();
  await expect(page.locator('#ask-question')).toHaveValue('Keep my unsent question.');
  await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
  expect(writes).toEqual([{ path: '/api/profile', body: { ...original, learningStyle: 'focused', expectedAiConsent: true } }]);
  expect(data.profile).toEqual({ ...original, aiConsent: false });

  // Keep the preference draft but explicitly withdraw: expected=true must not block it.
  await page.locator('#profile-consent').uncheck();
  await page.getByRole('button', { name: 'Save learning preferences', exact: true }).click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  await expect(page.locator('body')).toHaveClass(/focused-learning/);
  await expect(page.getByRole('button', { name: 'Enable AI below to ask' })).toBeDisabled();
  await expect(page.locator('#ask-question')).toHaveValue('Keep my unsent question.');
  expect(writes.at(-1)).toEqual({ path: '/api/profile', body: { ...focusedProfile, expectedAiConsent: true } });
  expect(data.profile).toEqual(focusedProfile);
  expect(writes.some(entry => entry.path === '/api/chat')).toBe(false);
});

for (const status of [403, 409]) {
  test(`settings ${status} preserves the draft and checked consent without applying unsaved preferences`, async ({ page }) => {
    const { data, writes } = await fixture(page);
    const before = { ...data.profile };
    const rejected = [];
    await page.route('**/api/profile', route => {
      rejected.push(route.request().postDataJSON());
      return route.fulfill({ status, json: { error: 'Unhelpful server detail.' } });
    });
    await page.goto('/#ask');
    await page.getByRole('textbox', { name: 'Your question' }).fill('Keep my draft.');
    await page.getByRole('button', { name: 'Settings and account' }).click();
    await page.locator('#profile-language').selectOption('hinglish');
    await page.locator('#profile-learning-style').selectOption('focused');
    await page.locator('#profile-consent').check();
    await page.getByRole('button', { name: 'Save learning preferences', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Preferences were not saved');
    await expect(page.getByRole('alert')).toContainText('Your draft and checkbox are unchanged');
    await expect(page.getByRole('alert')).not.toContainText('Unhelpful server detail');
    await expect(page.locator('#profile-language')).toHaveValue('hinglish');
    await expect(page.locator('#profile-learning-style')).toHaveValue('focused');
    await expect(page.locator('#profile-consent')).toBeChecked();
    await expect(page.locator('#profile-consent')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save learning preferences', exact: true })).toBeEnabled();
    await expect(page.locator('#ask-question')).toHaveValue('Keep my draft.');
    await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
    expect(rejected).toEqual([{ ...focusedProfile, language: 'hinglish', aiConsent: true, expectedAiConsent: false }]);
    expect(data.profile).toEqual(before);
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enable AI below to ask' })).toBeDisabled();
  });

  test(`Ask consent ${status} keeps the checkbox and unsent draft without enabling chat`, async ({ page }) => {
    const { data, writes } = await fixture(page, { profile: { ...focusedProfile } });
    const rejected = [];
    await page.route('**/api/profile', route => {
      rejected.push(route.request().postDataJSON());
      return route.fulfill({ status, json: { error: 'Unhelpful server detail.' } });
    });
    await page.goto('/#ask');
    await page.getByRole('textbox', { name: 'Your question' }).fill('Keep my unsent question.');
    await page.locator('#chat-consent').check();
    await page.getByRole('button', { name: 'Save consent & enable asking' }).click();
    await expect(page.getByRole('alert')).toContainText('Preferences were not saved');
    await expect(page.getByRole('alert')).toContainText('Your draft and checkbox are unchanged');
    await expect(page.getByRole('alert')).not.toContainText('Unhelpful server detail');
    await expect(page.locator('#chat-consent')).toBeChecked();
    await expect(page.locator('#chat-consent')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save consent & enable asking' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Enable AI below to ask' })).toBeDisabled();
    await expect(page.locator('#ask-question')).toHaveValue('Keep my unsent question.');
    expect(rejected).toEqual([{ ...focusedProfile, aiConsent: true, expectedAiConsent: false }]);
    expect(data.profile).toEqual(focusedProfile);
    expect(writes).toEqual([]);
  });
}

test('focused aids are optional and preserve complete content and normal read try recall flow', async ({ page }) => {
  const { writes } = await fixture(page, { profile: { ...focusedProfile } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Read the lesson', exact: true }).click();
  await expect(page.getByLabel('Read, try, recall instructions')).toContainText('No timer or deadline');
  for (const section of lessons[0].sections) await expect(page.locator('#dialog')).toContainText(section.body);
  await expect(page.locator('.learning-aid[open]')).toHaveCount(0);
  await expect(page.locator('#lesson-exercise')).not.toHaveAttribute('open', '');
  await page.getByText('Precise meanings', { exact: true }).click();
  await expect(page.locator('.term-definitions')).toContainText('cannot be reassigned');
  await page.getByText('How the parts connect', { exact: true }).click();
  await expect(page.locator('.scaffold-prompts').first()).toContainText('Which component is responsible');
  await page.getByText('Question the assumption', { exact: true }).click();
  await expect(page.locator('.scaffold-prompts').last()).toContainText('What other explanation');
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'I’ve read this · next: exercise', exact: true }).click();
  await expect(page.locator('#lesson-exercise')).toHaveAttribute('open', '');
  await expect(page.locator('#lesson-exercise')).toContainText(lessons[0].exercise);
  await page.getByRole('button', { name: 'I tried the exercise', exact: true }).click();
  await page.getByRole('button', { name: '3. Recall this lesson', exact: true }).click();
  await expect(page.locator('.practice-card')).toContainText(lessons[0].question);
  await expect(page.locator('#practice-answer')).toHaveCount(0);
  expect(writes.map(entry => entry.body.step)).toEqual(['read', 'attempted']);
});

test('focused session lesson keeps supplied content and uses unknown-term prompts', async ({ page }) => {
  const lesson = { ...lessons[0], id: 'session:custom', title: 'Curated session lesson' };
  await fixture(page, { profile: { ...focusedProfile }, lessons: [lesson] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Read the lesson', exact: true }).click();
  await page.getByText('Precise meanings', { exact: true }).click();
  await expect(page.locator('.learning-aids')).toContainText('Choose one term from this lesson');
  await expect(page.locator('.term-definitions')).toHaveCount(0);
  await expect(page.locator('#dialog')).toContainText(lesson.sections[0].body);
});

test('GitHub status refresh preserves unsaved settings and only reads status', async ({ page }) => {
  const { data, writes, requests } = await fixture(page);
  await page.goto('/');
  await expect(page.locator('#main')).not.toContainText('GitHub saving');
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await page.locator('#profile-language').selectOption('hinglish');
  await page.locator('#profile-learning-style').selectOption('focused');
  await page.locator('#profile-minutes').selectOption('45');
  await expect(page.locator('#github-status')).toContainText('Changes waiting');
  await expect(page.locator('#dialog form #github-status')).toHaveCount(0);
  const originalForm = await page.locator('#dialog form').elementHandle();
  data.github = { ...data.github, state: 'synced', message: 'Notebook is synced to the private repository.', lastSyncedAt: 1790000000000, token: 'FIXTURE-SECRET-NOT-FOR-DISPLAY' };
  await page.getByRole('button', { name: 'Refresh GitHub status' }).click();
  await expect(page.locator('#github-status')).toContainText('Notebook is synced');
  expect(await originalForm.evaluate(node => node.isConnected)).toBe(true);
  await expect(page.locator('#profile-language')).toHaveValue('hinglish');
  await expect(page.locator('#profile-learning-style')).toHaveValue('focused');
  await expect(page.locator('#profile-minutes')).toHaveValue('45');
  await expect(page.locator('#profile-consent')).not.toBeChecked();
  await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
  await expect(page.locator('#dialog')).not.toContainText('FIXTURE-SECRET-NOT-FOR-DISPLAY');
  expect(writes).toEqual([]);
  expect(requests.filter(entry => entry.path === '/api/github')).toEqual([{ path: '/api/github', method: 'GET' }]);
});

test('GitHub refresh failure leaves the unsaved form usable', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/github', route => route.fulfill({ status: 503, json: { error: 'Mock offline.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await page.locator('#profile-language').selectOption('hinglish');
  await page.getByRole('button', { name: 'Refresh GitHub status' }).click();
  await expect(page.locator('#github-status')).toContainText('Could not refresh');
  await expect(page.locator('#profile-language')).toHaveValue('hinglish');
  await expect(page.getByRole('button', { name: 'Refresh GitHub status' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save learning preferences' })).toBeEnabled();
});

test('learning prompts append drafts only and preserve Ask options and focus', async ({ page }) => {
  const { writes } = await fixture(page, { profile: { ...focusedProfile } });
  await page.goto('/#ask');
  await page.getByRole('textbox', { name: 'Your question' }).fill('Keep my question.');
  await page.locator('.ask-options > summary').click();
  for (const name of ['Explain literally', 'Map the parts', 'Question assumptions']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#ask-question')).toBeFocused();
    await expect(page.locator('.ask-options')).toHaveJSProperty('open', true);
  }
  await expect(page.locator('#ask-question')).toHaveValue(/^Keep my question\.[\s\S]*Explain this literally[\s\S]*Input → Owner[\s\S]*name an assumption/);
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Enable AI below to ask' })).toBeDisabled();
  expect(writes).toEqual([]);
});

test('explicit AI consent save retains the focused presentation preference', async ({ page }) => {
  const { data, writes } = await fixture(page, { profile: { ...focusedProfile } });
  await page.goto('/#ask');
  await page.locator('#chat-consent').check();
  await page.getByRole('button', { name: 'Save consent & enable asking' }).click();
  await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeEnabled();
  expect(writes).toEqual([{ path: '/api/profile', body: { ...focusedProfile, aiConsent: true, expectedAiConsent: false } }]);
  expect(data.profile).toEqual({ ...focusedProfile, aiConsent: true });
});

test('unauthenticated bootstrap cannot display private GitHub or focused preference data', async ({ page }) => {
  const { requests } = await fixture(page, { authenticated: false, profile: { ...focusedProfile } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connect your phone.' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('private-owner/private-notebook');
  await expect(page.locator('#github-status')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
  expect(requests.some(entry => entry.path === '/api/github')).toBe(false);
});

test('signout clears focused motion preference and private GitHub views', async ({ page }) => {
  await fixture(page, { profile: { ...focusedProfile } });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/focused-learning/);
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await expect(page.locator('#github-status')).toContainText('private-owner/private-notebook');
  await page.getByRole('button', { name: 'Sign out of this browser' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your phone.' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/focused-learning/);
  await expect(page.locator('#github-status')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('private-owner/private-notebook');
});

test('focused settings, expanded aids and Ask fit 320px with minimal motion', async ({ page }) => {
  await fixture(page, { local: false, profile: { ...focusedProfile } });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (await page.locator('#dialog').isVisible()) expect(await page.locator('#dialog').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  };
  await page.goto('/');
  await expect(page.locator('#next-step')).toBeVisible();
  expect(await page.locator('#next-step').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
  await page.getByRole('button', { name: 'Settings and account' }).click();
  await page.getByText('What is saved, and privacy', { exact: true }).click();
  await fits();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Read the lesson', exact: true }).click();
  for (const title of ['Precise meanings', 'How the parts connect', 'Question the assumption']) await page.getByText(title, { exact: true }).click();
  await fits();
  await page.goto('/#ask');
  await page.locator('.ask-options > summary').click();
  await fits();
});

test('standard presentation also respects reduced motion', async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#next-step')).toBeVisible();
  expect(await page.locator('#next-step').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
});

test('read and attempt keep the same lesson through recall using normal clicks', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#today');
  await page.getByRole('button', { name: 'Read the lesson', exact: true }).click();
  await expect(page.getByRole('button', { name: 'I tried the exercise', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'I’ve read this · next: exercise', exact: true }).click();
  await expect(page.locator('#lesson-exercise')).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'I tried the exercise', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.learning-focus h2')).toHaveText(lessons[0].title);
  await page.getByRole('button', { name: 'Try this exercise', exact: true }).click();
  await page.getByRole('button', { name: 'I tried the exercise', exact: true }).click();
  await page.getByRole('button', { name: '3. Recall this lesson', exact: true }).click();
  await expect(page.locator('.practice-card')).toContainText(lessons[0].question);
  expect(writes.map(entry => entry.body.step)).toEqual(['read', 'attempted']);
});

test('phone setup is visible locally and uses only the public address', async ({ page }) => {
  await fixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await page.getByText('Manual connection', { exact: true }).click();
  await expect(page.getByRole('status', { name: 'Phone website address' })).toHaveText('https://example.trycloudflare.com');
  await expect(page.locator('.pair-code')).toHaveText('DEMO-NOTREAL');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pair-code')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect phone', exact: true })).toBeFocused();
});

test('Ask preserves drafts and focus; consent is not implicitly enabled', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('/#ask');
  await page.getByRole('textbox', { name: 'Your question' }).fill('My unsent question');
  await page.locator('.ask-options > summary').click();
  await page.locator('#ask-mode').focus();
  await page.locator('#ask-mode').selectOption('guide');
  await expect(page.locator('.ask-options')).toHaveJSProperty('open', true);
  await expect(page.locator('#ask-mode')).toBeFocused();
  await page.locator('#ask-lesson').selectOption(lessons[0].id);
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveValue('My unsent question');
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Enable AI below to ask' })).toBeDisabled();
  expect(writes).toEqual([]);
});

test('an explicitly chosen scheduled card opens as extra practice', async ({ page }) => {
  await fixture(page, { progress: { [lessons[0].id]: { read: true, attempted: true } }, reviews: { [lessons[0].id]: { due: Date.now() + 86400000 } } });
  await page.goto('/#learn');
  await page.getByRole('button', { name: `Open lesson: ${lessons[0].title}`, exact: true }).click();
  await page.getByRole('button', { name: '3. Recall this lesson', exact: true }).click();
  await expect(page.locator('.practice-card')).toContainText('Extra practice');
  await expect(page.locator('.practice-card')).toContainText(lessons[0].question);
});

test('remote login explains the Mac step without exposing local setup', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { error: 'Pair this browser.' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connect your phone.' })).toBeVisible();
  await page.getByText('Enter a code instead', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Code from your Mac' })).toBeVisible();
  await expect(page.locator('#connect-phone')).toHaveCount(0);
});

for (const width of [320, 360, 390, 768, 1280]) {
  test(`mobile routes fit ${width}px without horizontal page overflow`, async ({ page }) => {
    await fixture(page, { local: false });
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['today', 'learn', 'ask', 'practice', 'career', 'sessions']) {
      await page.goto(`/#${route}`);
      await expect(page.locator('#main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
      await expect(page.locator('#connect-phone')).toHaveCount(0);
    }
  });
}