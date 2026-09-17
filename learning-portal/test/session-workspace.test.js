import test from 'node:test';
import assert from 'node:assert/strict';
import { organizeSessions } from '../public/session-workspace.js';
import { sessionSchema, validateSession } from '../server/schema.js';
import { sessionLesson } from '../server/sessions.js';
import { nextLearningStep } from '../public/journey.js';

const recap = (id = 'owner-note', extra = {}) => ({
  id, title: 'Keep ownership explicit', date: '2026-09-17T10:00:00.000Z', status: 'complete',
  summary: 'Recorded changes, not a transcript.', why: 'One owner keeps writes consistent.',
  changes: ['Changed the write owner.'], concepts: ['Ownership'], exercise: 'Name one failure case.',
  evidence: [{ label: 'Focused test', state: 'reported', reference: 'Producer report only.' }], sourceIds: ['hopper-contracts'],
  ...extra,
});
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('canonical lesson IDs come from the server mapping, never titles or source IDs', () => {
  const session = recap(); const lesson = sessionLesson(session);
  const lookalikes = [{ id: session.id, title: session.title }, { id: session.sourceIds[0] }, { id: 'same-title', title: session.title }];
  const [record] = organizeSessions([session], [...lookalikes, lesson]);
  assert.equal(record.lessonId, lesson.id);
  assert.equal(record.lessonId, 'session-owner-note');
  assert.deepEqual(record.lesson, lesson);
  assert.equal(record.learningStage, 'read');
  assert.equal(organizeSessions([session], lookalikes)[0].lessonId, null);
  const longest = recap(`a${'b'.repeat(63)}`);
  assert.equal(organizeSessions([longest], [sessionLesson(longest)])[0].lessonId, sessionLesson(longest).id);
});

test('newest-first ordering compares timestamps and deterministically breaks ties by ID', () => {
  const sessions = [recap('bad-z', { date: 'invalid' }), recap('tie-z'), recap('older', { date: '2026-09-16T10:00:00.000Z' }),
    recap('newest', { date: '2026-09-17T10:00:01.000Z' }), recap('tie-a', { date: '2026-09-17T12:00:00+02:00' }), recap('bad-a', { date: undefined }),
    recap('pre-epoch', { date: '1960-01-01T00:00:00.000Z' })];
  const expected = ['newest', 'tie-a', 'tie-z', 'older', 'pre-epoch', 'bad-a', 'bad-z'];
  assert.deepEqual(organizeSessions(sessions).map(({ id }) => id), expected);
  assert.deepEqual(organizeSessions([...sessions].reverse()).map(({ id }) => id), expected);
});

test('missing optional data is empty and missing lessons are unavailable, not fabricated', () => {
  assert.deepEqual(organizeSessions(), []);
  assert.deepEqual(organizeSessions(null, null, null, null), []);
  const [record] = organizeSessions([null, {}, { id: 'note-only' }], null, null, null);
  assert.equal(record.title, ''); assert.equal(record.status, null); assert.equal(record.date, '');
  assert.equal(record.lesson, null); assert.equal(record.lessonId, null); assert.equal(record.learningStage, 'unavailable');
  assert.equal(record.teaching, null); assert.equal(record.reviewDue, null);
  assert.deepEqual(record.changes, []); assert.deepEqual(record.concepts, []); assert.deepEqual(record.sourceIds, []);
  assert.deepEqual(record.tasksByStatus, { todo: [], 'in-progress': [], done: [] });
  assert.deepEqual(record.taskCounts, { total: 0, todo: 0, 'in-progress': 0, done: 0 });
  assert.deepEqual(record.evidenceCounts, { total: 0, reported: 0, verified: 0, failed: 0, 'not-run': 0 });
});

test('explicit task statuses group in publisher order, independently of changes and evidence', () => {
  const tasks = [{ id: 'next-test', title: 'Run the next test', status: 'todo' }, { id: 'write-code', title: 'Implement owner', status: 'done' },
    { id: 'test-code', title: 'Check owner', status: 'in-progress' }, { id: 'next-case', title: 'Check recovery', status: 'todo' }];
  const evidence = ['reported', 'verified', 'verified', 'failed', 'not-run'].map((state) => ({ label: 'Check', state, reference: 'Recorded only.' }));
  const session = recap('with-tasks', { tasks, evidence });
  const [record] = organizeSessions([session], [sessionLesson(session)]);
  assert.deepEqual(record.tasks, tasks);
  assert.deepEqual(record.tasksByStatus.todo.map(({ id }) => id), ['next-test', 'next-case']);
  assert.deepEqual(record.taskCounts, { total: 4, todo: 2, 'in-progress': 1, done: 1 });
  assert.deepEqual(record.evidenceCounts, { total: 5, reported: 1, verified: 2, failed: 1, 'not-run': 1 });
  assert.deepEqual(record.changes, session.changes);
  assert.equal(record.status, 'complete'); assert.equal(record.learningStage, 'read');
  const [legacy] = organizeSessions([recap()]);
  assert.equal(legacy.taskCounts.done, 0); assert.deepEqual(legacy.tasks, []);
  assert.equal(legacy.changes.length, 1);
  const incomplete = recap('unfinished', { status: 'incomplete', tasks: [tasks[1]] });
  assert.equal(organizeSessions([incomplete])[0].taskCounts.done, 1);
});

test('guided learning follows journey activity without reading the wall clock or session completion', () => {
  const session = recap(); const lesson = sessionLesson(session); const id = lesson.id;
  const cases = [
    [{}, {}, 'read'], [{ attempted: true }, {}, 'read'], [{ read: true }, {}, 'try'],
    [{ read: true, attempted: true }, {}, 'review'],
    [{ read: true }, { due: 1000 }, 'try'],
    [{ read: true, attempted: true }, { due: 1000 }, 'done'],
    [{ read: true, attempted: true }, { due: 0, sourceChanged: true }, 'review'],
  ];
  for (const [activity, review, stage] of cases) {
    const progress = { [id]: activity }; const reviews = 'due' in review ? { [id]: review } : {};
    const [record] = organizeSessions([session], [lesson], progress, reviews);
    assert.equal(record.learningStage, stage);
    assert.equal(record.learningStage, nextLearningStep({ lessons: [lesson], progress, reviews }, 0).stage);
    assert.equal(record.reviewDue, review.due ?? null);
    assert.deepEqual(organizeSessions([session], [lesson], progress, reviews), [record]);
  }
  assert.equal(organizeSessions([session], [lesson], { [session.id]: { read: true, attempted: true } })[0].learningStage, 'read');
});

test('supersession preserves all historical notes and tasks but never exposes a stale learning action', () => {
  const original = recap('first-note', { tasks: [{ id: 'old-task', title: 'Original recorded task', status: 'todo' }] });
  const correction = recap('second-note', { supersedes: original.id });
  const latest = recap('third-note', { supersedes: correction.id });
  const sessions = [original, correction, latest]; const lessons = sessions.map(sessionLesson);
  const records = organizeSessions(sessions, lessons, { [lessons[0].id]: { read: true } }, { [lessons[0].id]: { due: 0 } });
  assert.equal(records.length, 3);
  for (const record of records.filter(({ id }) => id !== latest.id)) {
    assert.equal(record.archived, true); assert.equal(record.learningStage, 'archived');
    assert.equal(record.lesson, null); assert.equal(record.lessonId, null); assert.equal(record.reviewDue, null);
  }
  assert.deepEqual(records[0].tasks, original.tasks);
  assert.equal(records[0].summary, original.summary);
  assert.equal(records[0].supersededBy, correction.id);
  assert.equal(records[1].supersedes, original.id);
  assert.equal(records[1].supersededBy, latest.id);
  assert.equal(records[2].archived, false); assert.equal(records[2].learningStage, 'read');
  const [partial] = organizeSessions([{ ...original, supersededBy: correction.id }], lessons);
  assert.equal(partial.archived, true); assert.equal(partial.lessonId, null);
});

test('frozen inputs remain unchanged and nested outputs are detached from input records', () => {
  const session = recap('frozen-note', { teaching: { plainExplanation: 'An owner has a job.', example: 'One writer.', checkQuestion: 'Who writes?', checkAnswer: 'The owner.' },
    tasks: [{ id: 'task-one', title: 'Check ownership', status: 'todo' }] });
  const inputs = freeze({ sessions: [session], lessons: [sessionLesson(session)], progress: {}, reviews: {} });
  const before = JSON.stringify(inputs);
  const [record] = organizeSessions(inputs.sessions, inputs.lessons, inputs.progress, inputs.reviews);
  record.changes.push('Output edit'); record.evidence[0].label = 'Output edit'; record.tasks[0].title = 'Output edit';
  record.teaching.example = 'Output edit'; record.lesson.sections[0].body = 'Output edit'; record.sourceIds.push('output-only');
  assert.equal(JSON.stringify(inputs), before);
});

test('legacy session schema serialization stays byte-for-byte stable without default tasks', () => {
  const session = recap();
  assert.equal(JSON.stringify(sessionSchema.parse(session)), JSON.stringify(session));
  assert.equal(Object.hasOwn(sessionSchema.parse(session), 'tasks'), false);
  assert.deepEqual(sessionSchema.parse(recap('empty-tasks', { tasks: [] })).tasks, []);
});

test('optional tasks are strict, bounded, explicit and unique within each session', () => {
  const task = { id: 'test-owner', title: 'Test the owner', status: 'todo' };
  for (const status of ['todo', 'in-progress', 'done']) assert.equal(sessionSchema.parse(recap('statuses', { tasks: [{ ...task, status }] })).tasks[0].status, status);
  const valid = Array.from({ length: 30 }, (_, index) => ({ ...task, id: `task-${index}`, title: 'a'.repeat(240) }));
  assert.equal(sessionSchema.parse(recap('bounded', { tasks: valid })).tasks.length, 30);
  for (const tasks of [null, {}, [{ ...task, extra: true }], [{ id: task.id, title: task.title }], [{ ...task, status: 'complete' }],
    [{ ...task, title: ' ' }], [{ ...task, title: 'a'.repeat(241) }], [{ ...task, id: 'A bad id' }], [{ ...task, id: 'a'.repeat(65) }],
    [...valid, { ...task, id: 'one-too-many' }]]) assert.equal(sessionSchema.safeParse(recap('invalid-tasks', { tasks })).success, false);
  const duplicate = sessionSchema.safeParse(recap('duplicates', { tasks: [task, { ...task, status: 'done' }] }));
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error.message, /Session task IDs must be unique/);
  assert.equal(sessionSchema.safeParse(recap('different-session', { tasks: [task] })).success, true);
  assert.throws(() => validateSession(recap('sensitive-task', { tasks: [{ ...task, title: 'password=not-for-publication' }] }), ['hopper-contracts']), /sensitive content/);
});