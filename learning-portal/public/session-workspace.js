import { nextLearningStep } from './journey.js';

const taskStatuses = ['todo', 'in-progress', 'done'];
const evidenceStates = ['reported', 'verified', 'failed', 'not-run'];
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === 'string' ? value : '';
const compareIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;

/**
 * Pure projection of published, curated sessions; no fetching, writes or capture.
 * Returns newest-first records (equal/invalid dates break ties by ID ascending;
 * missing/invalid dates sort last). Optional collections may be absent or null.
 * Inputs are server-validated records, not arbitrary transcripts. Output is
 * detached from inputs, including nested lesson/teaching objects.
 *
 * lessonId/lesson are null for archived or unavailable lessons. Active links use
 * only `session-${session.id}`, the canonical ID from server/sessions.js, never
 * titles or source IDs. Both bootstrap supersededBy and raw supersedes chains
 * fence stale lessons, even if callers accidentally supply an old catalog.
 *
 * learningStage: read | try | review | done | archived | unavailable.
 * Journey evaluation uses time 0 deliberately: stages reflect recorded activity
 * and explicitly invalidated reviews (due: 0), not the wall clock. `done` means
 * read/attempt/recall activity exists, NOT mastery or no review due today.
 * reviewDue is the finite recorded timestamp, or null; live due scheduling stays
 * with the existing review UI. No task/session/evidence status completes learning.
 */
export function organizeSessions(sessions = [], lessons = [], progress = {}, reviews = {}) {
  const entries = array(sessions).filter((session) => session && typeof session.id === 'string' && session.id);
  const ordered = [...entries].sort((a, b) => {
    const first = timestamp(a.date); const second = timestamp(b.date);
    return first === second ? compareIds(a, b) : first > second ? -1 : 1;
  });
  const replacements = new Map();
  for (const session of ordered) {
    if (session.supersedes && !replacements.has(session.supersedes)) replacements.set(session.supersedes, session.id);
  }
  const catalog = new Map(array(lessons).filter((lesson) => lesson && typeof lesson.id === 'string').map((lesson) => [lesson.id, lesson]));

  return ordered.map((session) => {
    const supersededBy = replacements.get(session.id) || text(session.supersededBy) || null;
    const archived = Boolean(supersededBy);
    const canonicalId = `session-${session.id}`;
    const lesson = archived ? null : catalog.get(canonicalId) || null;
    const activity = progress?.[canonicalId] || {};
    const review = reviews?.[canonicalId];
    const learningStage = archived ? 'archived' : !lesson ? 'unavailable' : nextLearningStep({
      lessons: [lesson], progress: { [canonicalId]: activity }, reviews: review ? { [canonicalId]: review } : {},
    }, 0).stage;
    const tasks = array(session.tasks).map((task) => ({ id: task.id, title: task.title, status: task.status }));
    const tasksByStatus = Object.fromEntries(taskStatuses.map((status) => [status, tasks.filter((task) => task.status === status)]));
    const taskCounts = { total: tasks.length, ...Object.fromEntries(taskStatuses.map((status) => [status, tasksByStatus[status].length])) };
    const evidence = array(session.evidence);
    const evidenceCounts = { total: evidence.length, ...Object.fromEntries(evidenceStates.map((state) => [state, evidence.filter((item) => item?.state === state).length])) };

    return structuredClone({
      id: session.id, title: text(session.title), date: text(session.date), status: session.status ?? null,
      summary: text(session.summary), why: text(session.why), changes: array(session.changes),
      concepts: array(session.concepts), sourceIds: array(session.sourceIds), exercise: text(session.exercise), teaching: session.teaching ?? null,
      tasks, tasksByStatus, taskCounts, evidence, evidenceCounts,
      supersedes: text(session.supersedes) || null, supersededBy, archived,
      lessonId: lesson ? canonicalId : null, lesson, learningStage,
      reviewDue: lesson && Number.isFinite(review?.due) ? review.due : null,
    });
  });
}