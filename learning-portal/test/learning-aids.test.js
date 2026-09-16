import test from 'node:test';
import assert from 'node:assert/strict';
import { lessons } from '../server/catalog.js';
import { learningAids, learningStyle } from '../public/learning-aids.js';

test('old or invalid presentation preferences default to standard', () => {
  for (const value of [undefined, null, '', 'standard', 'Focused', 'unknown', {}, true]) {
    assert.equal(learningStyle(value), 'standard');
  }
  assert.equal(learningStyle('focused'), 'focused');
});

test('all six starter lessons map to curated definitions without changing lesson content', () => {
  const expected = {
    'read-kotlin': ['val', 'Nullable type', 'Elvis operator (?:)'],
    'state-and-routes': ['State', 'Owner', 'Repository'],
    'coroutine-lifetime': ['Suspension', 'Scope', 'Cancellation'],
    'contracts-and-tests': ['Invariant', 'Falsifiable', 'Evidence'],
    'http-and-proxy': ['HTTP request', 'Endpoint', 'Proxy'],
    'honest-project-story': ['Attribution', 'Tradeoff', 'Verification'],
  };
  const before = JSON.stringify(lessons);
  assert.deepEqual(lessons.map(lesson => lesson.id).sort(), Object.keys(expected).sort());
  for (const lesson of lessons) {
    const aids = learningAids(lesson.id);
    assert.deepEqual(aids.definitions.map(entry => entry.term), expected[lesson.id]);
    assert.ok(aids.definitions.every(entry => typeof entry.meaning === 'string' && entry.meaning.length > 20));
  }
  assert.equal(JSON.stringify(lessons), before);
  assert.match(learningAids('read-kotlin').definitions[0].meaning, /may still be mutable/);
  assert.match(learningAids('coroutine-lifetime').definitions[0].meaning, /does not move work to a background thread/);
});

test('unknown and session lessons get generic prompts, not guessed definitions or architecture', () => {
  for (const id of ['session:custom', 'session:read-kotlin', 'new-lesson', 'constructor', '__proto__', undefined, null]) {
    const aids = learningAids(id);
    assert.deepEqual(aids.definitions, []);
    assert.match(aids.definitionPrompt, /leave unknowns open/);
    assert.deepEqual(aids.connections.map(entry => entry.label), ['Input', 'Owner', 'Output', 'Failure', 'Evidence']);
    assert.deepEqual(aids.assumptions.map(entry => entry.label), ['Assumption', 'Alternative', 'Tradeoff', 'Test']);
    assert.ok([...aids.connections, ...aids.assumptions].every(entry => entry.prompt.endsWith('?') && !Object.hasOwn(entry, 'answer')));
  }
});

test('each helper result is independent; callers cannot overwrite curated content', () => {
  const aids = learningAids('read-kotlin');
  aids.definitions[0].meaning = 'changed';
  aids.connections[0].prompt = 'changed';
  aids.assumptions.pop();
  const again = learningAids('read-kotlin');
  assert.notEqual(again.definitions[0].meaning, 'changed');
  assert.notEqual(again.connections[0].prompt, 'changed');
  assert.equal(again.assumptions.length, 4);
});