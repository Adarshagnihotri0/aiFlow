import { ApiError, request } from './api.js';
import { limits, boundedHistory } from './limits.js';
import { nextLearningStep, phoneAddress } from './journey.js';
import { learningAids, learningStyle } from './learning-aids.js';
import { el, text, list, paragraph, pill, button, link, chips, heading, empty, field, errorBox, select, icon } from './ui.js';

const main = document.querySelector('#main');
const navigation = document.querySelector('#navigation');
const headerActions = document.querySelector('#header-actions');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#dialog');
const routes = new Set(['today', 'learn', 'sessions', 'ask', 'practice', 'career']);
const defaults = { role: 'undecided', level: 'beginner', minutes: 25, language: 'english', learningStyle: 'standard', aiConsent: false };
const roles = { android: 'Android', frontend: 'Frontend', backend: 'Backend', undecided: 'Still exploring' };
const disclosure = 'AI chat uses the existing model proxy on port 2999 and its external provider. Your question, recent conversation and relevant source context may be sent to that provider, logged, or forwarded to Telegram. Do not include secrets or sensitive personal information. Replies are kept only in this browser tab’s memory.';
const state = {
  data: null, page: route(), epoch: 0, mutation: 0, writes: 0, refreshing: false,
  controllers: new Set(), progressPending: new Set(), profileBusy: false, dialogKind: '', returnFocus: null,
  draft: '', mode: 'teach', lessonId: '', messages: [], chatBusy: false, chatError: '', failedChat: null, askOptionsOpen: false,
  practiceId: null, revealed: false, pendingReview: null, reviewError: '',
  careerDraft: '', careerSubmitted: '', careerResult: null, careerError: '', careerBusy: false,
};

function route() { const value = location.hash.slice(1); return routes.has(value) ? value : 'today'; }
function notify(message = '', retry, bad = false) {
  notice.className = `notice${bad ? ' error-notice' : ''}`;
  notice.replaceChildren(...(message ? [paragraph(message)] : []), ...(retry ? [button('Retry refresh', retry, 'secondary')] : []));
}
function stale() { const error = new Error('A newer authentication session replaced this request.'); error.name = 'SupersededError'; return error; }
function ignored(error) { return error?.name === 'SupersededError'; }
async function api(path, options = {}) {
  const epoch = state.epoch;
  const controller = new AbortController();
  state.controllers.add(controller);
  try {
    const result = await request(path, { ...options, signal: controller.signal });
    if (epoch !== state.epoch) throw stale();
    return result;
  } catch (error) {
    if (epoch !== state.epoch) throw stale();
    if (error.status === 401 && path !== '/api/login') { lock(state.data ? 'Your browser session ended. Create a new code on your Mac to reconnect.' : ''); throw stale(); }
    throw error;
  } finally { state.controllers.delete(controller); }
}
function startWrite() { state.mutation += 1; state.writes += 1; }
function endWrite(epoch) { if (epoch === state.epoch) { state.mutation += 1; state.writes = Math.max(0, state.writes - 1); } }
function lock(reason = '') {
  state.epoch += 1;
  for (const controller of state.controllers) controller.abort();
  state.controllers.clear();
  Object.assign(state, {
    data: null, writes: 0, refreshing: false, draft: '', messages: [], chatBusy: false,
    chatError: '', failedChat: null, lessonId: '', mode: 'teach', practiceId: null,
    revealed: false, pendingReview: null, reviewError: '', careerDraft: '', careerSubmitted: '',
    careerResult: null, careerError: '', careerBusy: false, profileBusy: false,
  });
  state.progressPending.clear();
  document.body.classList.remove('focused-learning');
  closeDialog();
  headerActions.replaceChildren();
  navigation.hidden = true;
  notify();
  renderLogin(reason);
}
function normalize(data) {
  if (!Array.isArray(data.lessons) || !Array.isArray(data.sessions)) throw new ApiError('Your notebook response is incomplete. Please refresh.');
  const profile = { ...defaults, ...data.profile };
  if (!Object.hasOwn(roles, profile.role)) profile.role = 'undecided';
  if (!['beginner', 'some-basics'].includes(profile.level)) profile.level = 'beginner';
  if (![15, 25, 45].includes(profile.minutes)) profile.minutes = 25;
  if (!['english', 'hinglish'].includes(profile.language)) profile.language = 'english';
  profile.aiConsent = profile.aiConsent === true;
  profile.learningStyle = learningStyle(profile.learningStyle);
  return {
    ...data, profile, local: data.local === true, chatAvailable: data.chatAvailable === true,
    lessons: data.lessons.filter((lesson) => lesson && typeof lesson.id === 'string'),
    sessions: data.sessions.filter((session) => session && typeof session.id === 'string'),
    sources: list(data.sources).filter((source) => source && typeof source.id === 'string'),
    reviews: Object.assign(Object.create(null), data.reviews || {}),
    progress: Object.assign(Object.create(null), data.progress || {}),
  };
}

async function bootstrap({ quiet = false } = {}) {
  if (state.refreshing || state.writes > 0) return;
  const epoch = state.epoch;
  const mutation = state.mutation;
  state.refreshing = true;
  if (!quiet) { main.setAttribute('aria-busy', 'true'); if (state.data) notify('Refreshing your notebook…'); }
  try {
    const data = await api('/api/bootstrap');
    if (data.authenticated !== true) { lock(); return; }
    if (mutation !== state.mutation) return;
    const initial = !state.data;
    state.data = normalize(data);
    applyLearningPresentation();
    if (state.lessonId && !state.data.lessons.some((lesson) => lesson.id === state.lessonId)) state.lessonId = '';
    notify();
    if (initial) renderHeader();
    // A background refresh must not destroy a focused input or an open lesson/profile.
    const editing = document.activeElement?.matches('input, textarea, select, button, a, summary');
    if (initial || (!dialog.open && !editing && !['ask', 'career'].includes(state.page)) || !quiet) renderPage();
  } catch (error) {
    if (ignored(error)) return;
    if (state.data) notify(error.message, () => bootstrap(), true);
    else main.replaceChildren(heading('Cannot reach your notebook.', 'Check the connection, then try again.', 'Connection help'), errorBox(error.message, () => bootstrap()), connectionHelp());
  } finally {
    if (epoch === state.epoch) { state.refreshing = false; main.setAttribute('aria-busy', 'false'); }
  }
}

function connectionHelp() {
  return el('details', { class: 'connection-help mt' }, el('summary', {}, 'Connection help'),
    el('ul', {},
      el('li', {}, 'On your phone, use the HTTPS address from Connect phone on your Mac. Do not use localhost or 127.0.0.1: those point to the phone itself.'),
      el('li', {}, 'If the browser says “refused to connect”, check the address first. Keep the Mac awake, with the portal and tunnel running.'),
      el('li', {}, 'A temporary tunnel address can change after a restart. Get the current address from your Mac rather than an old bookmark.'),
      el('li', {}, 'If this page opens and asks for a code, the website connection is working. You only need to pair this browser.')));
}
function renderLogin(reason = '') {
  main.setAttribute('aria-busy', 'false');
  const code = el('input', { id: 'pairing-code', name: 'code', type: 'text', autocomplete: 'one-time-code', required: true, maxlength: 128, spellcheck: 'false', autocapitalize: 'none', 'aria-describedby': 'login-help' });
  const errors = el('div');
  const submit = el('button', { type: 'submit', class: 'button full' }, 'Open my notebook');
  const form = el('form', { class: 'stack' }, field('Code from your Mac', code), paragraph('Codes last 5 minutes and work once. If rejected, create a new code on your Mac.', 'muted small'), errors, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled || !code.value.trim()) return;
    submit.disabled = true; submit.textContent = 'Connecting…'; errors.replaceChildren();
    try {
      await api('/api/login', { method: 'POST', body: { code: code.value.trim() } });
      code.value = '';
      await bootstrap();
    } catch (error) { if (!ignored(error)) errors.replaceChildren(errorBox(error.message)); }
    finally { submit.disabled = false; submit.textContent = 'Open my notebook'; }
  });
  main.replaceChildren(el('section', { class: 'card login' }, el('span', { class: 'eyebrow' }, 'Website connected · notebook locked'), el('h1', {}, 'Connect your phone.'), reason && paragraph(reason, 'callout warning mt'),
    el('ol', { id: 'login-help', class: 'setup-steps' },
      el('li', {}, 'On your Mac, open Fieldnotes at http://127.0.0.1:3210.'),
      el('li', {}, 'Choose Connect phone → Create pairing code.'),
      el('li', {}, 'Enter that code below. No account or password needed.')),
    form, connectionHelp(), button('Check connection again', () => bootstrap(), 'ghost full mt')));
}

function renderHeader() {
  headerActions.replaceChildren(...[state.data.local && button('Connect phone', openConnect, 'secondary', { id: 'connect-phone' }), button(icon('profile'), () => openProfile(), '', { class: 'profile-button', 'aria-label': 'Settings and account' })].filter(Boolean));
}
function renderNavigation() {
  navigation.hidden = !state.data;
  const active = ['learn', 'sessions'].includes(state.page) ? 'today' : state.page;
  navigation.replaceChildren(...[['today', 'Learn'], ['ask', 'Ask'], ['practice', 'Review'], ['career', 'Career']].map(([id, label]) => el('a', { href: `#${id}`, ...(active === id ? { 'aria-current': 'page' } : {}) }, icon(id), el('span', { text: label }))));
}
function todayTabs() {
  return el('nav', { class: 'tabs', 'aria-label': 'Browse your notebook' }, [['today', 'Your next step'], ['learn', 'All lessons'], ['sessions', 'Code updates']].map(([id, label]) => el('a', { href: `#${id}`, ...(state.page === id ? { 'aria-current': 'page' } : {}) }, label)));
}
function renderPage() {
  if (!state.data) return;
  const active = document.activeElement;
  const restoreInput = main.contains(active) && active.id && ['TEXTAREA', 'INPUT', 'SELECT'].includes(active.tagName);
  const selection = restoreInput && active.tagName === 'TEXTAREA' ? [active.selectionStart, active.selectionEnd] : null;
  document.title = `${({ today: 'Today', learn: 'Learn', sessions: 'Sessions', ask: 'Ask', practice: 'Practice', career: 'Career' })[state.page]} · Fieldnotes`;
  main.setAttribute('aria-busy', 'false');
  const views = { today: renderToday, learn: renderLearn, sessions: renderSessions, ask: renderAsk, practice: renderPractice, career: renderCareer };
  main.replaceChildren(views[state.page]());
  renderNavigation();
  if (restoreInput) {
    const replacement = document.getElementById(active.id);
    replacement?.focus({ preventScroll: true });
    if (selection && replacement?.tagName === 'TEXTAREA') replacement.setSelectionRange(...selection);
  }
}
function go(page) {
  if (location.hash === `#${page}`) { state.page = page; renderPage(); main.focus(); }
  else location.hash = page;
}
window.addEventListener('hashchange', () => { if (location.hash === '#main') { main.focus(); return; } state.page = route(); closeDialog(); renderPage(); if (state.data) main.focus(); });
window.addEventListener('focus', () => { if (state.data && document.visibilityState === 'visible') bootstrap({ quiet: true }); });
document.addEventListener('visibilitychange', () => { if (state.data && document.visibilityState === 'visible') bootstrap({ quiet: true }); });
window.addEventListener('online', () => { if (state.data) bootstrap({ quiet: true }); });
window.addEventListener('pageshow', (event) => { if (event.persisted) bootstrap({ quiet: true }); });

function progress(lesson) { return state.data.progress[lesson.id] || {}; }
function reviewable() { return state.data.lessons.filter((lesson) => text(lesson.question).trim() && text(lesson.answer).trim()); }
function dueLessons() {
  const now = Date.now();
  return reviewable().filter((lesson) => {
    const review = state.data.reviews[lesson.id];
    return !review || (Number.isFinite(review.due) && review.due <= now);
  }).sort((a, b) => (state.data.reviews[a.id]?.due || 0) - (state.data.reviews[b.id]?.due || 0));
}
function formatDate(value, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(date);
}
function metric(value, label) { return el('div', { class: 'metric' }, el('strong', { text: String(value) }), el('span', { text: label })); }
function sectionTitle(title, action) { return el('div', { class: 'section-heading' }, el('h2', { text: title }), action); }
function lessonCard(lesson) {
  const activity = progress(lesson);
  return el('article', { class: 'card lesson-card' }, el('div', { class: 'row' }, pill('From your code', 'green'), activity.read && pill('Read'), activity.attempted && pill('Attempted')), el('h3', { text: text(lesson.title) || 'Untitled lesson' }), paragraph(lesson.summary, 'muted'), chips(lesson.concepts), el('div', { class: 'card-actions' }, button('Open lesson →', () => openLesson(lesson), 'secondary', { 'aria-label': `Open lesson: ${text(lesson.title)}` })));
}
function planStep(number, title, description, action) {
  return el('div', { class: 'plan-step' }, el('span', { class: 'step-number', 'aria-hidden': 'true', text: number }), el('div', {}, el('h3', { text: title }), paragraph(description, 'muted small'), action));
}
function renderToday() {
  const { lessons, sessions, profile } = state.data;
  const { lesson: next, stage } = nextLearningStep(state.data);
  const labels = { read: 'Read the lesson', try: 'Try this exercise', review: 'Review this lesson' };
  const descriptions = { read: 'Start with the explanation. No AI or setup needed.', try: 'You read this lesson. Now try its exercise yourself.', review: 'You recorded an attempt. Recall the idea before moving on.' };
  const hero = next ? el('section', { class: 'card hero-card learning-focus' },
    el('span', { class: 'eyebrow' }, 'Your next step'), el('h2', { text: next.title }), paragraph(descriptions[stage]),
    el('ol', { class: 'journey-steps', 'aria-label': 'Lesson steps' }, [['read', 'Read'], ['try', 'Try'], ['review', 'Recall']].map(([id, label]) => el('li', { ...(id === stage ? { 'aria-current': 'step' } : {}) }, label))),
    button(labels[stage], () => stage === 'review' ? reviewLesson(next) : openLesson(next, stage === 'try'), '', { id: 'next-step' }))
    : empty(lessons.length ? 'You’re caught up.' : 'Your notebook is ready.', lessons.length ? 'Return when a review is due, or revisit a lesson below.' : 'Lessons appear here after a curated session is published.', link('Browse all lessons', '#learn', 'secondary'));
  const latest = [...sessions].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))[0];
  return el('div', { class: 'narrow' }, heading('Learn from your code.', 'Read one idea. Try it. Remember it.', `${profile.minutes} minutes at your pace`), hero,
    el('nav', { class: 'browse-links', 'aria-label': 'Explore your notebook' }, link(`All lessons (${lessons.length})`, '#learn', 'secondary'), link('What changed in my code?', '#sessions', 'secondary')),
    latest && el('section', { class: 'recent-update' }, el('h2', {}, 'Latest code update'), paragraph(latest.title, 'muted mt'), button('Read the update', () => openSession(latest), 'ghost')),
    el('details', { class: 'mt' }, el('summary', {}, 'What can I learn here?'), paragraph('Start with lessons from four approved code excerpts. Read and Try record activity, not mastery. Code updates are curated session notes, not an automatic record of every coding session.', 'muted small'), button('Change language or learning time', openProfile, 'ghost')));
}

function reviewLesson(lesson) {
  if (state.pendingReview) { notify('Finish saving your current review first.'); closeDialog(); go('practice'); return; }
  state.practiceId = lesson.id; state.revealed = false;
  closeDialog(); go('practice');
}
function renderLearn() {
  return el('div', {}, heading('Understand what you build.', 'Start simple. Open the details when you are ready.', 'Your learning library'), todayTabs(), paragraph(`${state.data.lessons.length} lessons · Reading and attempting are activity records, not proof of mastery.`, 'muted small mb'), state.data.lessons.length ? el('div', { class: 'grid' }, state.data.lessons.map(lessonCard)) : empty('Nothing to study just yet.', 'Your actual code sessions will shape this library.', button('Refresh lessons', () => bootstrap(), 'secondary')));
}

function openDialog(title, body, kind) {
  if (!dialog.open) state.returnFocus = document.activeElement;
  state.dialogKind = kind;
  dialog.replaceChildren(el('div', { class: 'dialog-header' }, el('h2', { id: 'dialog-title', text: title }), button('×', closeDialog, '', { class: 'close-button', 'aria-label': 'Close dialog' })), el('div', { class: 'dialog-body' }, body));
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function closeDialog() { if (dialog.open) dialog.close(); }
dialog.addEventListener('close', () => {
  state.dialogKind = '';
  dialog.replaceChildren(); // Includes private pairing code and fetched source text.
  if (state.returnFocus?.isConnected) state.returnFocus.focus();
  else if (state.data) main.focus();
  state.returnFocus = null;
});

function sourceLinks(ids, back) {
  const sources = list(ids).map((value) => typeof value === 'string' ? { id: value } : value).filter((value) => value && typeof value.id === 'string');
  if (!sources.length) return paragraph('No source references were supplied.', 'muted small');
  return el('div', { class: 'source-list' }, sources.map((source) => {
    const known = state.data.sources.find((entry) => entry.id === source.id) || source;
    return button(`${text(known.path) || source.id}${known.missing ? ' · missing' : ''}`, () => openSource(source.id, back), '', { class: 'source-link', 'aria-label': `Read source: ${text(known.path) || source.id}` });
  }));
}
function openSource(id, back) {
  const body = el('div', { class: 'stack' }, back && button('← Back', back, 'ghost'), paragraph('Loading source…', 'muted'));
  openDialog('Source notebook', body, `source:${id}`);
  const currentBody = body;
  const load = async () => {
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(back && button('← Back', back, 'ghost') || document.createTextNode(''), paragraph('Loading source…', 'muted'));
    try {
      const source = await api(`/api/source/${encodeURIComponent(id)}`);
      if (!dialog.open || !dialog.contains(currentBody)) return;
      body.replaceChildren(...[back && button('← Back', back, 'ghost'), el('h3', { text: text(source.path) || id }), paragraph(`Source ID: ${text(source.id) || id}`, 'muted small'), paragraph(`Hash: ${text(source.hash) || 'Not supplied'}`, 'muted small'), source.missing ? errorBox('This source is currently missing. Its contents cannot be verified here.', load) : el('pre', { class: 'source-code', tabindex: '0', 'aria-label': 'Source file contents', text: text(source.text) || '(Empty source file)' })].filter(Boolean));
    } catch (error) { if (!ignored(error) && dialog.contains(currentBody)) body.replaceChildren(back && button('← Back', back, 'ghost') || document.createTextNode(''), errorBox(error.message, load)); }
    finally { body.setAttribute('aria-busy', 'false'); }
  };
  load();
}

function applyLearningPresentation() {
  // Apply only authenticated, server-loaded or successfully saved preferences; never an unsaved selection.
  document.body.classList.toggle('focused-learning', state.data?.profile.learningStyle === 'focused');
}

function focusedLessonAids(lesson) {
  const aids = learningAids(lesson.id);
  const scaffold = (title, entries) => el('details', { class: 'learning-aid' }, el('summary', {}, title),
    paragraph('Optional prompts, not a description of this project. Think through one question at a time or use your own notes. Leave unknowns open.', 'muted small'),
    el('ol', { class: 'scaffold-prompts' }, entries.map(({ label, prompt }) => el('li', {}, el('strong', { text: label }), paragraph(prompt)))));
  return el('section', { class: 'learning-aids mt', 'aria-label': 'Optional learning aids' },
    el('details', { class: 'learning-aid' }, el('summary', {}, 'Precise meanings'),
      paragraph('Generic definitions, not verified facts about this project.', 'muted small'),
      aids.definitions.length ? el('dl', { class: 'term-definitions' }, aids.definitions.map(({ term, meaning }) => [el('dt', { text: term }), el('dd', { text: meaning })])) : paragraph(aids.definitionPrompt)),
    scaffold('How the parts connect', aids.connections), scaffold('Question the assumption', aids.assumptions));
}

function openLesson(lesson, exerciseOpen = false) {
  const focused = state.data.profile.learningStyle === 'focused';
  const basics = el('section', { class: 'mb' }, paragraph(lesson.summary));
  if (focused) basics.append(el('section', { class: 'focused-instructions mt', 'aria-label': 'Read, try, recall instructions' },
    paragraph('One step at a time. No timer or deadline. Open extra detail only when useful.', 'muted small'),
    el('ol', {}, el('li', {}, 'Read: read the explanation below. Choose “I’ve read this” when ready to open the exercise.'),
      el('li', {}, 'Try: attempt the supplied exercise. Choose “I tried the exercise” to record an attempt, not a correct answer.'),
      el('li', {}, 'Recall: choose “3. Recall this lesson”. Think of an answer before choosing “Reveal answer”.'))));
  const contracts = el('details', { open: !exerciseOpen }, el('summary', {}, '1. Understand the idea'), list(lesson.sections).length ? el('div', { class: 'stack' }, list(lesson.sections).map((section) => el('section', {}, el('h3', { text: text(section?.title) || 'Lesson notes' }), paragraph(section?.body, 'body-text mt')))) : paragraph('No detailed sections were supplied.', 'muted'));
  const evidence = el('details', {}, el('summary', {}, 'Source code and evidence'), paragraph('These references provide context. A source link is not proof that you can reproduce the work yourself.', 'muted small'), sourceLinks(lesson.sourceIds, () => openLesson(lesson, exerciseOpen)));
  const exercise = el('details', { open: exerciseOpen, id: 'lesson-exercise' }, el('summary', {}, '2. Try it yourself'), paragraph(lesson.exercise || 'No exercise was supplied for this lesson.'), lesson.question && el('section', {}, el('h3', {}, 'Check your understanding'), paragraph(lesson.question, 'body-text mt'), el('details', {}, el('summary', {}, 'Reveal the reference answer'), paragraph(lesson.answer || 'No reference answer supplied.'))));
  const actions = el('div', { class: 'stack mt' });
  const errors = el('div');
  function renderActions() {
    const activity = progress(lesson);
    actions.replaceChildren(el('div', { class: 'row' }, button(activity.read ? '✓ Read' : 'I’ve read this · next: exercise', () => saveProgress('read'), activity.read ? 'secondary' : '', { disabled: activity.read || state.progressPending.has(`${lesson.id}:read`) }), button(activity.attempted ? '✓ Attempt recorded' : 'I tried the exercise', () => saveProgress('attempted'), 'secondary', { disabled: activity.attempted || !activity.read || state.progressPending.has(`${lesson.id}:attempted`) || !text(lesson.exercise).trim() })),
      activity.read && !activity.attempted && button('Go to this exercise', () => { exercise.open = true; exercise.querySelector('summary').focus(); exercise.scrollIntoView({ block: 'start' }); }, 'ghost'),
      activity.read && activity.attempted && button('3. Recall this lesson', () => reviewLesson(lesson)),
      paragraph('Reading and attempting are activity records—not proof of mastery.', 'muted small'));
  }
  async function saveProgress(step) {
    const key = `${lesson.id}:${step}`;
    if (state.progressPending.has(key) || progress(lesson)[step]) return;
    const epoch = state.epoch;
    state.progressPending.add(key); startWrite(); renderActions(); errors.replaceChildren();
    try {
      await api('/api/progress', { method: 'POST', body: { lessonId: lesson.id, step } });
      state.data.progress[lesson.id] = { ...progress(lesson), [step]: true };
      notify(step === 'read' ? 'Reading recorded. Try the exercise when you are ready.' : 'Attempt recorded—not marked as mastered.');
      renderPage();
      if (step === 'read' && dialog.contains(exercise)) {
        contracts.open = false; exercise.open = true;
        exercise.querySelector('summary').focus(); exercise.scrollIntoView({ block: 'start' });
      }
    } catch (error) { if (!ignored(error)) errors.replaceChildren(errorBox(error.message, () => saveProgress(step))); }
    finally { endWrite(epoch); state.progressPending.delete(key); if (state.data && epoch === state.epoch) renderActions(); }
  }
  renderActions();
  openDialog(text(lesson.title) || 'Lesson', el('div', {}, basics, contracts, exercise, actions, errors, focused && focusedLessonAids(lesson), evidence, button('Need help? Ask about this lesson', () => askAbout(lesson, 'teach'), 'ghost mt')), `lesson:${lesson.id}`);
  if (exerciseOpen) { exercise.querySelector('summary').focus(); exercise.scrollIntoView({ block: 'start' }); }
}

function evidencePill(value) {
  const labels = { reported: ['Reported', 'warn'], verified: ['Verified in session evidence', 'green'], failed: ['Failed', 'bad'], 'not-run': ['Not run', ''] };
  const [label, tone] = Object.hasOwn(labels, value) ? labels[value] : ['Evidence state unknown', ''];
  return pill(label, tone);
}
function sessionCard(session) {
  return el('article', { class: 'card lesson-card' }, el('div', { class: 'row between' }, el('span', { class: 'session-date', text: formatDate(session.date) }), pill(session.supersededBy ? 'Historical · updated later' : session.status === 'complete' ? 'Session marked complete' : 'Session incomplete', session.supersededBy ? '' : session.status === 'complete' ? 'green' : 'warn')), el('h3', { text: text(session.title) || 'Untitled session' }), paragraph(session.summary, 'muted'), el('div', { class: 'chips' }, [...new Set(list(session.evidence).map((entry) => entry?.state))].map(evidencePill)), revisionLinks(session), button('Read session notes →', () => openSession(session), 'secondary', { 'aria-label': `Read session notes: ${text(session.title)}` }));
}
function revisionLinks(session) {
  return el('div', { class: 'stack' }, [['supersededBy', 'Read the newer recap →'], ['supersedes', 'Read the earlier recap →']].map(([key, label]) => {
    const related = state.data.sessions.find((entry) => entry.id === session[key]);
    return related && button(label, () => openSession(related), 'ghost');
  }));
}
function renderSessions() {
  const sessions = [...state.data.sessions].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return el('div', {}, heading('Your work, with the why.', 'A readable record of what changed—and what was actually checked.', 'Session notebook'), todayTabs(), el('div', { class: 'row between mb' }, paragraph(`${sessions.length} sessions · Refreshes when you return to this tab.`, 'muted small'), button('Refresh sessions', () => bootstrap(), 'secondary')), el('p', { class: 'callout mb' }, 'Reported ≠ verified. “Verified in session evidence” describes a supplied check, not independent certification or your personal skill. Agent-assisted work stays attributed to the session.'), sessions.length ? el('div', { class: 'grid' }, sessions.map(sessionCard)) : empty('Your first page is still blank.', 'No session records have arrived. Nothing is being invented to fill the space.', button('Refresh sessions', () => bootstrap(), 'secondary')));
}
function openSession(session) {
  openDialog(text(session.title) || 'Session notes', el('div', { class: 'stack' }, el('div', { class: 'row' }, pill(session.status === 'complete' ? 'Session marked complete' : 'Session incomplete'), el('span', { class: 'session-date', text: formatDate(session.date, true) })), paragraph(session.summary), el('section', {}, el('h3', {}, 'Why this mattered'), paragraph(session.why || 'No rationale supplied.', 'body-text mt')), el('section', {}, el('h3', {}, 'Changes recorded in the session'), list(session.changes).length ? el('ul', {}, list(session.changes).map((change) => el('li', { text: text(change) }))) : paragraph('No changes supplied.', 'muted mt')), chips(session.concepts), el('section', {}, el('h3', {}, 'Evidence, not a blanket guarantee'), paragraph('These labels come from the session record. “Reported” is a claim; “verified” means that record reports a successful check. Review the references for scope and limitations.', 'muted small mt'), list(session.evidence).length ? list(session.evidence).map((entry) => el('div', { class: 'evidence-row' }, el('div', { class: 'row' }, el('strong', { text: text(entry?.label) || 'Unnamed check' }), evidencePill(entry?.state)), paragraph(entry?.reference, 'body-text small muted'))) : paragraph('No evidence supplied.', 'muted mt')), el('section', {}, el('h3', {}, 'Your next independent attempt'), paragraph(session.exercise || 'No exercise was supplied.', 'body-text mt'), paragraph('The session describes agent-assisted development. Only exercises you actually attempt should be described as your own practice.', 'callout mt')), el('section', {}, el('h3', {}, 'Source references'), sourceLinks(session.sourceIds, () => openSession(session)))), `session:${session.id}`);
}

function askAbout(lesson, mode) {
  closeDialog();
  if (state.chatBusy) { notify('Wait for the current answer before changing the question context.'); go('ask'); return; }
  state.mode = mode; state.lessonId = lesson.id;
  // Never replace a question the learner already typed.
  if (!state.draft.trim()) state.draft = mode === 'interview' ? text(lesson.interview) : `Help me understand: ${text(lesson.title)}`;
  state.failedChat = null; state.chatError = '';
  go('ask');
}

function renderAsk() {
  const root = el('div', { class: 'narrow ask-page' }, heading('What feels confusing?', 'Ask in your own words. Basic questions are welcome.', 'Your code tutor'));
  if (!state.data.chatAvailable) root.append(el('div', { class: 'error mb', role: 'status' }, paragraph('AI chat is disabled or unavailable on the server. Your draft stays here; no simulated answer will be substituted.'), button('Refresh availability', () => bootstrap(), 'secondary mt')));
  const mode = select('ask-mode', [['teach', 'Teach me the concept'], ['guide', 'Guide my next step'], ['interview', 'Interview practice']], state.mode);
  const lesson = select('ask-lesson', [['', 'General question'], ...state.data.lessons.map((entry) => [entry.id, text(entry.title) || 'Untitled lesson'])], state.lessonId);
  mode.disabled = state.chatBusy; lesson.disabled = state.chatBusy;
  mode.addEventListener('change', () => { state.mode = mode.value; state.askOptionsOpen = options.open; state.failedChat = null; renderPage(); });
  lesson.addEventListener('change', () => { state.lessonId = lesson.value; state.askOptionsOpen = options.open; state.failedChat = null; renderPage(); });
  const options = el('details', { class: 'ask-options mt', open: state.askOptionsOpen }, el('summary', {}, `Options · ${state.mode === 'interview' ? 'Interview practice' : state.mode === 'guide' ? 'One hint at a time' : 'Simple explanation'}${state.lessonId ? ' · Lesson selected' : ''}`), el('div', { class: 'form-grid' }, field('Teaching style', mode), field('Which lesson? (optional)', lesson)));
  options.addEventListener('toggle', () => { if (options.isConnected) state.askOptionsOpen = options.open; });
  options.append(el('section', { class: 'stack mt' }, paragraph('Add a prompt to your draft. Nothing is sent and AI consent is unchanged.', 'muted small'),
    el('div', { class: 'prompt-suggestions' }, [
      ['Explain literally', 'Explain this literally. Define each important term, show one small example, and distinguish what it means from what it does not mean.'],
      ['Map the parts', 'Help me trace Input → Owner → Output → Failure → Evidence. Ask about missing context; do not invent project connections.'],
      ['Question assumptions', 'Help me name an assumption, an alternative, their tradeoffs, and a test that could distinguish them. Separate evidence from guesses.'],
    ].map(([label, prompt]) => button(label, () => {
      const next = state.draft.trim() ? `${state.draft}\n\n${prompt}` : prompt;
      if (next.length > limits.question) { notify('This prompt would exceed the question limit. Shorten the draft first.', null, true); return; }
      state.draft = next; state.failedChat = null; state.askOptionsOpen = options.open;
      renderPage(); document.querySelector('#ask-question')?.focus();
    }, 'secondary', { disabled: state.chatBusy })))));
  const selectedLesson = state.data.lessons.find((entry) => entry.id === state.lessonId);
  if (state.mode === 'interview' && text(selectedLesson?.interview)) {
    options.append(el('section', { class: 'card stack mb' }, el('span', { class: 'eyebrow' }, 'Your interview prompt'), paragraph(selectedLesson.interview), paragraph('Any existing draft has been kept. The button below replaces it only when you choose.', 'muted small'), button('Use this interview question', () => { state.draft = selectedLesson.interview; renderPage(); document.querySelector('#ask-question')?.focus(); }, 'secondary', { disabled: state.chatBusy })));
  }
  const log = el('section', { class: 'chat-log', 'aria-label': 'Conversation', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  if (!state.messages.length && !state.draft.trim()) root.append(el('div', { class: 'prompt-suggestions' }, paragraph('Not sure where to start?', 'muted small'), button('What does this code do?', () => { state.draft = 'Explain what this code does in simple words, using one small example.'; renderPage(); document.querySelector('#ask-question')?.focus(); }, 'secondary', { disabled: state.chatBusy })));
  for (const message of state.messages) {
    const card = el('article', { class: `chat-message ${message.role === 'user' ? 'user' : ''}` }, el('span', { class: 'eyebrow' }, message.role === 'user' ? 'You · learner' : 'AI assistant · not your own work'), paragraph(message.content));
    if (message.role === 'assistant') {
      card.append(paragraph('Source-assisted, not independently verified. Check the references before relying on this answer.', 'muted small mt'));
      if (message.warning) card.append(paragraph(message.warning, 'callout warning'));
      card.append(sourceLinks(message.sources));
    }
    log.append(card);
  }
  if (state.chatBusy) log.append(el('p', { class: 'callout', role: 'status' }, 'Waiting for the external provider… You can keep drafting your next question.'));
  if (state.messages.length || state.chatBusy) root.append(log);
  if (state.chatError) root.append(el('div', { class: 'mt' }, errorBox(state.chatError, state.failedChat ? () => sendChat(true) : null)));
  const draft = el('textarea', { id: 'ask-question', name: 'question', rows: '4', maxlength: limits.question, placeholder: 'What would you like to understand?', 'aria-describedby': 'draft-help' });
  draft.value = state.draft;
  draft.addEventListener('input', () => { state.draft = draft.value; });
  const send = el('button', { type: 'submit', class: 'button', disabled: state.chatBusy || !state.data.chatAvailable || !state.data.profile.aiConsent }, state.chatBusy ? 'Asking…' : !state.data.profile.aiConsent ? 'Enable AI below to ask' : 'Send question');
  const form = el('form', { class: 'card chat-compose' }, field('Your question', draft), el('p', { id: 'draft-help', class: 'muted small mt' }, 'Nothing is sent until you press Send. Keep private information out.'), el('div', { class: 'row between' }, send, state.messages.length > 0 && button('Clear conversation', () => {
    state.messages = []; state.chatError = ''; state.failedChat = null; renderPage(); notify('Conversation cleared from this tab. Your draft is unchanged.');
  }, 'ghost', { disabled: state.chatBusy || !state.messages.length })));
  form.addEventListener('submit', (event) => { event.preventDefault(); sendChat(false); });
  root.append(form, options);
  if (!state.data.profile.aiConsent) root.append(consentCard());
  root.append(el('details', { class: 'mt' }, el('summary', {}, 'Privacy and chat limits'), paragraph(disclosure, 'muted small'), paragraph('The tutor receives the latest four exchanges. Reused replies are shortened to 4,000 characters. Drafts and replies stay in this tab only and disappear on reload. Re-state older details when needed.', 'muted small')));
  return root;
}
function consentCard() {
  const checkbox = el('input', { type: 'checkbox', id: 'chat-consent', disabled: state.profileBusy });
  const errors = el('div');
  const save = button('Save consent & enable asking', async () => {
    if (!checkbox.checked || save.disabled || state.profileBusy) return;
    state.profileBusy = true; checkbox.disabled = true;
    save.disabled = true; save.textContent = 'Saving consent…'; errors.replaceChildren();
    const epoch = state.epoch;
    startWrite();
    try {
      const expectedAiConsent = state.data.profile.aiConsent;
      const profile = { ...state.data.profile, aiConsent: true };
      await api('/api/profile', { method: 'PUT', body: { ...profile, expectedAiConsent } });
      state.data.profile = profile;
      notify('Consent saved. Nothing is sent until you submit a question.');
      renderPage();
    } catch (error) { if (!ignored(error)) errors.replaceChildren(errorBox(profileSaveError(error))); }
    finally {
      endWrite(epoch);
      if (epoch === state.epoch) state.profileBusy = false;
      checkbox.disabled = false; save.disabled = !checkbox.checked; save.textContent = 'Save consent & enable asking';
    }
  }, 'secondary', { disabled: true });
  checkbox.addEventListener('change', () => { save.disabled = !checkbox.checked || state.profileBusy; });
  return el('section', { class: 'card stack mt' }, el('h2', {}, 'Enable AI only if you’re comfortable.'), paragraph(disclosure, 'callout warning'), el('label', { class: 'checkbox-label', for: 'chat-consent' }, checkbox, el('span', {}, 'I consent to external AI processing, possible logging and Telegram forwarding.')), paragraph('Lessons and reviews work without AI. Withdraw consent in Settings; that cannot undo data already sent.', 'muted small'), errors, save);
}

async function sendChat(retry) {
  if (!state.data || state.chatBusy) return;
  if (state.profileBusy || !state.data.profile.aiConsent || !state.data.chatAvailable) { notify('Chat needs saved, explicit consent and server availability. Wait for any preference change to finish.', null, true); return; }
  let payload = retry ? state.failedChat : null;
  if (!payload) {
    const question = state.draft.trim();
    if (!question) { document.querySelector('#ask-question')?.focus(); return; }
    if (question.length > limits.question) { notify(`Keep your question under ${limits.question} characters.`, null, true); return; }
    payload = { question, mode: state.mode, ...(state.lessonId ? { lessonId: state.lessonId } : {}), history: boundedHistory(state.messages) };
  }
  const epoch = state.epoch;
  const draftAtSend = state.draft;
  state.chatBusy = true; state.chatError = ''; state.failedChat = payload;
  // Keep the draft, and add no fictional user/assistant turn on a failed request.
  if (state.page === 'ask') renderPage();
  try {
    const response = await api('/api/chat', { method: 'POST', body: payload });
    if (!text(response.answer).trim()) throw new ApiError('The provider returned no answer. Your draft is still here.');
    state.messages.push({ role: 'user', content: payload.question }, { role: 'assistant', content: response.answer, sources: list(response.sources), warning: text(response.warning) });
    state.messages = state.messages.slice(-40);
    if (state.draft === draftAtSend && state.draft.trim() === payload.question) state.draft = '';
    state.failedChat = null;
    if (state.page !== 'ask') notify('Your AI answer is ready in Ask.');
  } catch (error) {
    if (!ignored(error)) state.chatError = `${error.message} Retrying sends the question again to the external provider; a timed-out request may already have been processed.`;
  } finally {
    if (epoch === state.epoch) { state.chatBusy = false; if (state.page === 'ask') renderPage(); }
  }
}

function renderPractice() {
  const due = dueLessons();
  const pending = state.pendingReview;
  const lesson = (pending && (state.data.lessons.find((entry) => entry.id === pending.cardId) || pending.lesson)) || reviewable().find((entry) => entry.id === state.practiceId) || due[0];
  const root = el('div', { class: 'narrow' }, heading('Remember what you learned.', 'Think of an answer, then turn the card over.', 'Review cards'), el('div', { class: 'row between mb' }, paragraph(`${due.length} cards due or new · includes unread lessons`, 'muted small'), button('Refresh cards', () => bootstrap(), 'ghost', { disabled: Boolean(pending) })));
  if (!lesson) {
    const nextDue = reviewable().map((entry) => state.data.reviews[entry.id]?.due).filter((dueAt) => Number.isFinite(dueAt) && dueAt > Date.now()).sort((a, b) => a - b)[0];
    root.append(empty(reviewable().length ? 'A little breathing room.' : 'No practice cards yet.', nextDue ? `Your next scheduled review is ${formatDate(nextDue, true)}. You can still revisit any lesson.` : 'Cards need both a question and a reference answer. Check back after new lessons arrive.', link('Explore lessons', '#learn', 'secondary')));
    return root;
  }
  if (state.practiceId !== lesson.id) { state.practiceId = lesson.id; state.revealed = Boolean(pending); }
  const card = el('article', { class: 'card practice-card', 'aria-label': 'Recall card' }, el('div', { class: 'row between' }, pill(!state.data.reviews[lesson.id] ? 'New card' : state.data.reviews[lesson.id].due > Date.now() ? 'Extra practice' : 'Due for review', 'green'), el('span', { class: 'small muted' }, 'From your learning notebook')), paragraph(lesson.title, 'small muted mt'), el('h2', { text: text(lesson.question) }));
  if (!state.revealed) card.append(paragraph('Say the answer in your own words, or think it through before looking.', 'muted'), button('Reveal answer', () => { state.revealed = true; renderPage(); document.querySelector('#practice-answer')?.focus(); }, 'mt'));
  else {
    card.append(el('section', { id: 'practice-answer', class: 'answer', tabindex: '-1' }, el('span', { class: 'eyebrow' }, 'Reference answer'), paragraph(lesson.answer), sourceLinks(lesson.sourceIds)));
    card.append(paragraph('How well did you recall it? Ratings schedule practice; they do not certify a skill.', 'muted small mt'));
  }
  root.append(card);
  if (state.revealed) {
    root.append(el('div', { class: 'ratings', 'aria-label': 'Rate your recall' }, [['again', 'Again', 'Not yet'], ['hard', 'Hard', 'Needed a hint'], ['good', 'Good', 'Got the idea'], ['easy', 'Easy', 'Could explain it']].map(([rating, label, help]) => button([el('span', { text: label }), el('small', { text: help })], () => submitReview(lesson, rating), rating === 'good' ? '' : 'secondary', { disabled: Boolean(pending), 'aria-label': `${label}: ${help}` }))));
    root.append(paragraph('Touch or pen: swipe left for Again, right for Good. Vertical swipes only scroll. All four ratings are available as buttons.', 'muted small mt'));
    installSwipe(card, lesson);
  }
  if (pending?.status === 'sending') root.append(el('p', { class: 'callout mt', role: 'status' }, 'Saving your rating…'));
  if (state.reviewError) root.append(el('div', { class: 'mt' }, errorBox(state.reviewError, pending ? () => submitReview(lesson, pending.rating, true) : null)));
  root.append(button('Read the full lesson', () => openLesson(lesson), 'ghost mt'));
  return root;
}
async function submitReview(lesson, rating, retry = false) {
  if (!state.data || !state.revealed || state.practiceId !== lesson.id) return;
  if (!['again', 'hard', 'good', 'easy'].includes(rating)) return;
  if (state.pendingReview?.status === 'sending' || (state.pendingReview && !retry)) return;
  if (!state.pendingReview) {
    if (typeof crypto.randomUUID !== 'function') { state.reviewError = 'Secure review IDs require HTTPS or localhost. Open Fieldnotes on a secure connection to rate cards.'; renderPage(); return; }
    state.pendingReview = { cardId: lesson.id, rating, requestId: crypto.randomUUID(), status: 'sending', lesson };
  }
  const pending = state.pendingReview;
  pending.status = 'sending'; state.reviewError = '';
  const epoch = state.epoch;
  startWrite();
  if (state.page === 'practice') renderPage();
  try {
    const result = await api('/api/review', { method: 'POST', body: { cardId: pending.cardId, rating: pending.rating, requestId: pending.requestId } });
    if (!result.review || !Number.isFinite(result.review.due)) throw new ApiError('The server did not return a usable review schedule.');
    state.data.reviews[pending.cardId] = result.review;
    state.pendingReview = null; state.revealed = false;
    state.practiceId = dueLessons().find((entry) => entry.id !== pending.cardId)?.id || null;
    notify('Rating saved. The server has scheduled your next review.');
  } catch (error) {
    if (!ignored(error)) { pending.status = 'failed'; state.reviewError = `${error.message} Retry reuses the same request ID so this rating is not submitted as a new review. Other ratings stay locked until it is resolved.`; }
  } finally {
    endWrite(epoch);
    if (epoch === state.epoch && state.page === 'practice') { renderPage(); if (!dialog.open) main.focus({ preventScroll: true }); }
  }
}
function installSwipe(card, lesson) {
  let gesture = null;
  card.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.pointerType === 'mouse' || !state.revealed || state.pendingReview || event.target.closest('button, a, summary, pre')) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
  });
  card.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
    if (!gesture.axis && Math.max(dx, dy) > 12) gesture.axis = dx > dy * 1.5 ? 'horizontal' : 'vertical';
    if (gesture.axis === 'horizontal' && dy > dx * 0.65) gesture.axis = 'vertical';
  });
  card.addEventListener('pointerup', (event) => {
    const current = gesture; gesture = null;
    if (!current || current.id !== event.pointerId || current.axis !== 'horizontal') return;
    const dx = event.clientX - current.x, dy = Math.abs(event.clientY - current.y);
    if (Math.abs(dx) < 80 || Math.abs(dx) < dy * 2) return;
    submitReview(lesson, dx > 0 ? 'good' : 'again');
  });
  card.addEventListener('pointercancel', () => { gesture = null; });
  card.addEventListener('pointerleave', () => { gesture = null; });
}

function renderCareer() {
  const { lessons, profile } = state.data;
  const interviews = lessons.filter((lesson) => text(lesson.interview).trim());
  const introduced = [...new Set(lessons.flatMap((lesson) => list(lesson.concepts).filter((concept) => typeof concept === 'string')))];
  const attempts = lessons.filter((lesson) => progress(lesson).attempted).length;
  const root = el('div', {}, heading('Turn understanding into opportunity.', 'Build a story you can explain, not a score you cannot defend.', `${roles[profile.role]} · Career notebook`), el('div', { class: 'dashboard-grid' }, el('section', { class: 'card hero-card' }, el('span', { class: 'eyebrow' }, 'An honest starting point'), el('h2', {}, 'Your experience. In your words.'), paragraph('Agent-assisted sessions show what the project did. Your recorded attempts show what you chose to practise. Neither proves job readiness.'), el('div', { class: 'metric-row' }, metric(introduced.length, 'concepts introduced'), metric(attempts, 'attempts recorded'), metric(interviews.length, 'interview prompts'))), el('section', { class: 'card stack' }, el('h2', {}, 'Keep the attribution clear.'), paragraph('“An agent helped implement this. I read the explanation, attempted the exercise, and can describe what I checked.”', 'body-text'), paragraph('Use only the parts that are true for you. Do not claim generated code, passing session checks, or AI interview answers as independently demonstrated skills.', 'muted small'))));
  root.append(sectionTitle('Explain it out loud'), interviews.length ? el('div', { class: 'grid' }, interviews.map((lesson) => el('article', { class: 'card lesson-card' }, pill('Interview practice', 'green'), el('h3', { text: text(lesson.title) }), paragraph(lesson.interview), button('Practise in Ask →', () => askAbout(lesson, 'interview'), 'secondary')))) : empty('Interview prompts will grow with you.', 'No interview questions have been supplied yet. Explore a lesson or ask a general interview question.', button('Open interview mode', () => { if (!state.chatBusy) state.mode = 'interview'; go('ask'); }, 'secondary')));
  root.append(sectionTitle('Concepts you have encountered'), introduced.length ? chips(introduced) : paragraph('No concepts are listed in your lessons yet.', 'muted'), paragraph('Introduced means present in a lesson. Practise means there is more to work on. Neither label means mastered.', 'muted small mt'));
  const description = el('textarea', { id: 'job-description', rows: '5', maxlength: limits.jobDescription, minlength: 20, placeholder: 'Paste the skills and responsibilities, without personal or confidential details.' });
  description.value = state.careerDraft;
  description.addEventListener('input', () => { state.careerDraft = description.value; });
  const submit = el('button', { type: 'submit', class: 'button', disabled: state.careerBusy }, state.careerBusy ? 'Comparing…' : 'Compare with my lessons');
  const form = el('form', { class: 'card stack mt' }, el('h2', {}, 'Find your next learning gap.'), paragraph('Optional: compare a job description against lesson coverage. This is not a hiring prediction, qualification check, or readiness percentage.', 'muted'), field('Job description', description, 'Sent to the Fieldnotes career endpoint only when you submit. Do not paste secrets.'), submit);
  form.addEventListener('submit', (event) => { event.preventDefault(); compareCareer(); });
  if (state.careerError) form.append(errorBox(state.careerError, () => compareCareer()));
  if (state.careerResult) {
    const labels = { introduced: ['Introduced', 'green'], practise: ['Practise', 'warn'], 'not-covered': ['Not covered', ''] };
    form.append(el('details', {}, el('summary', {}, 'Description used for this comparison'), paragraph(state.careerSubmitted)));
    form.append(el('section', { 'aria-label': 'Job description coverage', 'aria-live': 'polite' }, el('h3', {}, 'Lesson coverage, not a skill assessment'), list(state.careerResult.matches).length ? list(state.careerResult.matches).map((match) => { const [label, tone] = Object.hasOwn(labels, match?.coverage) ? labels[match.coverage] : ['Unknown coverage', '']; return el('div', { class: 'skill-row' }, el('span', { text: text(match?.skill) }), pill(label, tone)); }) : paragraph('No matching skills were returned. This does not establish a gap or a match.', 'muted mt'), paragraph(state.careerResult.note || 'No additional context was supplied.', 'muted small mt')));
  }
  root.append(form);
  return root;
}
async function compareCareer() {
  if (!state.data || state.careerBusy) return;
  const description = state.careerDraft.trim();
  if (!description) { document.querySelector('#job-description')?.focus(); return; }
  const epoch = state.epoch;
  state.careerBusy = true; state.careerError = ''; state.careerResult = null; state.careerSubmitted = description;
  renderPage();
  try {
    const result = await api('/api/career', { method: 'POST', body: { description } });
    if (!Array.isArray(result.matches)) throw new ApiError('The career endpoint returned an incomplete comparison.');
    state.careerResult = result;
    if (state.page !== 'career') notify('Your lesson coverage comparison is ready in Career.');
  } catch (error) { if (!ignored(error)) state.careerError = error.message; }
  finally { if (epoch === state.epoch) { state.careerBusy = false; if (state.page === 'career') renderPage(); } }
}

function openConnect() {
  if (!state.data?.local) return;
  const address = phoneAddress(state.data.publicUrl);
  const pairArea = el('div', { 'aria-live': 'polite' });
  const copyStatus = el('p', { class: 'muted small', role: 'status' });
  const copy = button('Copy phone address', async () => {
    try { await navigator.clipboard.writeText(address); copyStatus.textContent = 'Address copied. Send it to your phone and open it there.'; }
    catch { copyStatus.textContent = 'Copy is unavailable. Select and copy the address above manually.'; }
  }, 'secondary');
  let pairTimer;
  dialog.addEventListener('close', () => clearTimeout(pairTimer), { once: true });
  const pair = button('Create pairing code', async () => {
    if (pair.disabled) return;
    clearTimeout(pairTimer);
    pair.disabled = true; pairArea.replaceChildren(paragraph('Creating your code…', 'muted small'));
    try {
      const result = await api('/api/pair', { method: 'POST', body: {} });
      if (!dialog.contains(pairArea)) return;
      if (!text(result.code) || !result.expiresAt) throw new ApiError('No usable pairing code was returned. Try again.');
      pairArea.replaceChildren(
        el('output', { class: 'pair-code', 'aria-label': 'Short-lived pairing code', text: result.code }),
        paragraph(`Valid for 5 minutes · expires ${formatDate(result.expiresAt, true)}`, 'muted small'),
        paragraph('Enter it only on your own phone. It opens your private notebook. A new code replaces the previous code.', 'muted small'),
        button('Hide code', () => pairArea.replaceChildren(paragraph('Code hidden, not revoked. It still expires at its original time.', 'muted small')), 'ghost'));
      const remaining = new Date(result.expiresAt).getTime() - Date.now();
      if (Number.isFinite(remaining)) pairTimer = setTimeout(() => {
        if (dialog.contains(pairArea)) pairArea.replaceChildren(paragraph('Code expired. Create a new one.', 'muted small'));
      }, Math.max(0, Math.min(remaining, 2147483647)));
      pair.textContent = 'Create a new code';
    } catch (error) { if (!ignored(error) && dialog.contains(pairArea)) pairArea.replaceChildren(errorBox(error.message)); }
    finally { pair.disabled = false; }
  });
  const body = el('div', { class: 'stack' },
    el('section', { class: 'stack' }, el('h3', {}, '1. Open this address on your phone'),
      address ? el('output', { class: 'phone-address', text: address, 'aria-label': 'Phone website address' }) : paragraph('No phone address is configured. Start the tunnel and configure the portal’s public origin first.', 'callout warning'),
      address && copy, copyStatus, paragraph('Do not open 127.0.0.1 on your phone. That address is only for this Mac.', 'muted small')),
    el('section', { class: 'stack' }, el('h3', {}, '2. Enter a pairing code on the phone'),
      paragraph('Create it when your phone is ready. It lasts 5 minutes and can be used once.', 'muted small'), address && pair, pairArea),
    paragraph('Keep the Mac awake and the portal and tunnel running. This temporary address may change after a tunnel restart.', 'callout'), connectionHelp());
  openDialog('Connect your phone', body, 'connect');
}

function githubSettings() {
  const statusNode = el('div', { id: 'github-status', class: 'stack', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  function renderStatus(status) {
    const labels = { disabled: 'Not configured', pending: 'Changes waiting', synced: 'Synced', offline: 'Offline · retry delayed', blocked: 'Blocked', conflict: 'Conflict · sync stopped' };
    const label = status && Object.hasOwn(labels, status.state) ? labels[status.state] : 'Status unavailable';
    statusNode.replaceChildren(el('strong', { text: label }),
      paragraph(text(status?.message) || 'Refresh to check GitHub saving.', 'muted small'),
      ...(status?.configured === true ? [
        paragraph(`Repository: ${text(status.repo) || 'Not supplied'} · Branch: ${text(status.branch) || 'Not supplied'}`, 'small'),
        paragraph(status.lastSyncedAt == null ? 'Last synced: not yet recorded.' : `Last synced: ${formatDate(status.lastSyncedAt, true)}`, 'muted small'),
      ] : []));
  }
  renderStatus(state.data.github);
  const refresh = button('Refresh GitHub status', async () => {
    if (refresh.disabled || !state.data || !statusNode.isConnected) return;
    refresh.disabled = true; statusNode.setAttribute('aria-busy', 'true');
    try {
      const status = await api('/api/github');
      if (!statusNode.isConnected) return;
      state.data.github = status;
      renderStatus(status);
    } catch (error) {
      if (!ignored(error) && statusNode.isConnected) statusNode.replaceChildren(paragraph('Could not refresh GitHub status. Your settings have not changed. Try refreshing again.', 'error'));
    } finally { refresh.disabled = false; statusNode.setAttribute('aria-busy', 'false'); }
  }, 'secondary');
  return el('section', { class: 'github-settings stack mt', 'aria-labelledby': 'github-heading' },
    el('hr', { class: 'divider' }), el('h3', { id: 'github-heading' }, 'GitHub saving'),
    paragraph('You work in a local copy. When configured, saving to GitHub runs automatically in the background about every 60 seconds. Offline retries slow down; a conflict stops sync.', 'muted small'),
    statusNode, refresh, paragraph('Refresh checks status only; it does not start a sync or save this form.', 'muted small'),
    el('details', {}, el('summary', {}, 'What is saved, and privacy'),
      paragraph('The snapshot includes learning preferences, progress, review records, and curated sessions with their code examples. Starter lessons are part of the application, not the snapshot.', 'muted small'),
      paragraph('Snapshots are stored in private GitHub history. Earlier versions can remain in that history after a local edit or deletion. People with repository access can read them.', 'muted small'),
      paragraph('Chat drafts and replies, authentication data, and GitHub tokens are not included. AI consent is not carried over as permission to use AI. GitHub saving does not send a chat question or enable AI.', 'muted small')));
}

function profileSaveError(error) {
  if (error.status === 409) return 'Preferences were not saved. Your draft and checkbox are unchanged. Consent may have changed in another browser. Uncheck AI consent to save without enabling AI, or refresh the notebook and reopen Settings to review consent before explicitly enabling it.';
  if (error.status === 403) return 'Preferences were not saved because this request was not allowed. Your draft and checkbox are unchanged. Check your connection and refresh the notebook before trying again; this request did not enable AI.';
  return error.message;
}

function openProfile() {
  if (state.profileBusy) { notify('Your learning preferences are being saved. Please wait.'); return; }
  const profile = state.data.profile;
  const expectedAiConsent = profile.aiConsent;
  const role = select('profile-role', Object.entries(roles), profile.role);
  const level = select('profile-level', [['beginner', 'Beginner · start from the why'], ['some-basics', 'Some basics · connect the dots']], profile.level);
  const minutes = select('profile-minutes', [[15, '15 minutes'], [25, '25 minutes'], [45, '45 minutes']], profile.minutes);
  const language = select('profile-language', [['english', 'English'], ['hinglish', 'Hinglish']], profile.language);
  const presentation = select('profile-learning-style', [['standard', 'Standard'], ['focused', 'Focused (precise, one step at a time)']], profile.learningStyle);
  presentation.setAttribute('aria-describedby', 'presentation-help');
  const consent = el('input', { type: 'checkbox', id: 'profile-consent', checked: profile.aiConsent });
  const errors = el('div');
  const save = el('button', { type: 'submit', class: 'button' }, 'Save learning preferences');
  const form = el('form', { class: 'stack' }, paragraph('There is no placement test here. Start where you are, and change direction whenever you like.', 'muted'), el('div', { class: 'form-grid' }, field('Your direction', role), field('Starting point', level), field('Time for today', minutes), field('Preferred teaching language', language), field('Learning presentation (optional)', presentation)),
    el('p', { id: 'presentation-help', class: 'muted small' }, 'Standard keeps the usual lesson view. Focused adds explicit steps, precise definitions and optional thinking prompts, with minimal motion. This is a presentation preference, not a diagnosis or ability assessment. No time pressure; change it whenever you like. It does not change AI consent.'),
    paragraph('The time preference changes your suggested plan, not a deadline. Your profile is shared with the backend; existing lesson text is not automatically translated.', 'muted small'), el('hr', { class: 'divider' }), el('h3', {}, 'External AI, with your permission'), paragraph(disclosure, 'callout warning'), el('label', { class: 'checkbox-label', for: 'profile-consent' }, consent, el('span', {}, 'I explicitly consent to external AI processing, possible logging and Telegram forwarding.')), paragraph('Uncheck and save to stop future chat requests. This cannot recall data already sent to the provider or Telegram.', 'muted small'), errors, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled || state.profileBusy) return;
    if (state.chatBusy) { errors.replaceChildren(errorBox('Wait for the current AI request to finish before changing consent. Data already sent cannot be recalled.')); return; }
    const updated = { role: role.value, level: level.value, minutes: Number(minutes.value), language: language.value, learningStyle: learningStyle(presentation.value), aiConsent: consent.checked };
    const epoch = state.epoch;
    state.profileBusy = true;
    startWrite(); save.disabled = true; save.textContent = 'Saving preferences…'; errors.replaceChildren();
    for (const input of [role, level, minutes, language, presentation, consent]) input.disabled = true;
    try {
      await api('/api/profile', { method: 'PUT', body: { ...updated, expectedAiConsent } });
      state.data.profile = updated;
      applyLearningPresentation();
      if (dialog.contains(form)) closeDialog();
      renderPage(); notify('Your learning preferences are saved.');
    } catch (error) { if (!ignored(error)) errors.replaceChildren(errorBox(profileSaveError(error))); }
    finally {
      endWrite(epoch);
      if (epoch === state.epoch) state.profileBusy = false;
      save.disabled = false; save.textContent = 'Save learning preferences';
      for (const input of [role, level, minutes, language, presentation, consent]) input.disabled = false;
    }
  });
  const account = el('section', { class: 'stack mt' }, el('hr', { class: 'divider' }), el('h3', {}, 'Your private notebook'), paragraph(state.data.local ? 'This browser is connected locally. You can create a short-lived code for another device.' : 'This browser is paired remotely. Pairing codes can only be created from a local browser.', 'muted small'));
  if (state.data.local) account.append(paragraph('To connect your phone, close Settings and choose Connect phone at the top of the page. Save any preference changes first.', 'muted small'));
  account.append(connectionHelp());
  const logoutErrors = el('div');
  const logout = button('Sign out of this browser', async () => {
    if (logout.disabled) return;
    const epoch = state.epoch;
    startWrite();
    logout.disabled = true; logout.textContent = 'Signing out…'; logoutErrors.replaceChildren();
    try { await api('/api/logout', { method: 'POST', body: {} }); lock(); notify('Signed out. Conversation, drafts and private views were cleared from this tab.'); }
    catch (error) { if (!ignored(error)) logoutErrors.replaceChildren(errorBox(error.message)); }
    finally { endWrite(epoch); logout.disabled = false; logout.textContent = 'Sign out of this browser'; }
  }, 'ghost');
  account.append(logout, logoutErrors, paragraph('On a local browser, reconnecting may automatically authenticate again. Signing out does not erase the server’s learning records.', 'muted small'));
  openDialog('Learning preferences', el('div', {}, form, githubSettings(), account), 'profile');
}

bootstrap();