import test from 'node:test';
import assert from 'node:assert/strict';
import { nextLearningStep, phoneAddress } from '../public/journey.js';

test('one lesson stays selected through read, exercise and first recall', () => {
  const data = { lessons: [{ id: 'one' }, { id: 'two' }], progress: {}, reviews: {} };
  assert.deepEqual(nextLearningStep(data), { lesson: data.lessons[0], stage: 'read' });
  data.progress.one = { read: true };
  assert.deepEqual(nextLearningStep(data), { lesson: data.lessons[0], stage: 'try' });
  data.progress.one.attempted = true;
  assert.deepEqual(nextLearningStep(data), { lesson: data.lessons[0], stage: 'review' });
  data.reviews.one = { due: 2000 };
  assert.deepEqual(nextLearningStep(data, 1000), { lesson: data.lessons[1], stage: 'read' });
});

test('started lessons take priority over unread, without manufacturing completion', () => {
  const data = { lessons: [{ id: 'one' }, { id: 'two' }], progress: { two: { attempted: true } }, reviews: {} };
  assert.deepEqual(nextLearningStep(data), { lesson: data.lessons[1], stage: 'read' });
  assert.deepEqual(data.progress, { two: { attempted: true } });
});

test('completed lessons offer due recall or a genuine end state, including empty libraries', () => {
  const data = { lessons: [{ id: 'one' }], progress: { one: { read: true, attempted: true } }, reviews: { one: { due: 2000 } } };
  assert.equal(nextLearningStep(data, 2000).stage, 'review');
  assert.deepEqual(nextLearningStep(data, 1000), { lesson: null, stage: 'done' });
  assert.deepEqual(nextLearningStep({ lessons: [] }), { lesson: null, stage: 'done' });
});

test('phone address never copies local, executable, credential or path URLs', () => {
  assert.equal(phoneAddress('https://example.trycloudflare.com'), 'https://example.trycloudflare.com');
  for (const value of ['', null, 'http://127.0.0.1:3210', 'https://127.0.0.1', 'https://127.9.8.7:3210', 'https://localhost', 'https://localhost.', 'https://foo.localhost', 'https://[::1]', 'https://[::ffff:7f00:1]', 'https://0.0.0.0', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?code=secret']) {
    assert.equal(phoneAddress(value), '');
  }
});

test('earlier recall still counts as activity; scheduled cards remain available for extra practice', () => {
  const data = { lessons: [{ id: 'one' }, { id: 'two' }], progress: { one: { read: true } }, reviews: { one: { due: 2000 } } };
  assert.deepEqual(nextLearningStep(data, 1000), { lesson: data.lessons[0], stage: 'try' });
  data.progress.one.attempted = true;
  assert.deepEqual(nextLearningStep(data, 1000), { lesson: data.lessons[1], stage: 'read' });
});