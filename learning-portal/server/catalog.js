import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { redact } from './schema.js';

export const sourceManifest = [
  { id: 'hopper-contracts', root: 'hopper', path: 'AGENTS.md', start: 1, end: 230 },
  { id: 'feed-route', root: 'hopper', path: 'app/src/main/java/com/bitchat/android/ui/features/social/feed/MediaFeedRoute.kt', start: 1, end: 240 },
  { id: 'proxy-boundaries', root: 'proxy', path: '.github/copilot-instructions.md', start: 1, end: 80 },
  { id: 'proxy-routing', root: 'proxy', path: 'src/server.ts', start: 1, end: 220 },
];
export const sourceIds = sourceManifest.map((source) => source.id);

export async function readSources(roots) {
  return Promise.all(sourceManifest.map(async (source) => {
    const metadata = { id: source.id, path: `${source.root}/${source.path}`, start: source.start, end: source.end };
    try {
      const root = await realpath(roots[source.root]);
      const target = await realpath(path.join(root, source.path));
      if (!target.startsWith(`${root}${path.sep}`) || (await stat(target)).size > 512_000) throw new Error('Unapproved source');
      const content = await readFile(target, 'utf8');
      const excerpt = content.split('\n').slice(source.start - 1, source.end).map((line, i) => `${source.start + i}: ${line}`).join('\n');
      return { ...metadata, hash: createHash('sha256').update(content).digest('hex'), text: redact(excerpt).slice(0, 22000), missing: false };
    } catch { return { ...metadata, hash: '', text: 'Approved source unavailable. No content has been inferred.', missing: true }; }
  }));
}

export const lessons = [
  {
    id: 'read-kotlin', title: 'Read Kotlin without feeling lost', summary: 'Start with values, functions and nullable types before jumping into architecture.', concepts: ['Kotlin', 'Syntax', 'Null safety'], sourceIds: ['hopper-contracts', 'feed-route'],
    sections: [
      { title: 'The small idea', body: 'val introduces a reference you cannot reassign; var allows reassignment. A function declared with fun groups behaviour. A type tells you what kind of value is allowed. These are language concepts, not rules invented by this project.' },
      { title: 'Read a tiny example', body: 'val name: String? = null\nval label = name ?: "Nearby peer"\n\nString? allows either text or null. The Elvis operator ?: supplies a fallback when the value on its left is null. It does not replace an empty string.' },
      { title: 'Connect it to your code', body: 'Open the feed-route source excerpt and look at one function signature. Separate the function name, parameter names, types, and defaults. Do not try to understand the entire file at once.' },
      { title: 'A rule worth keeping', body: 'Avoid using !! simply to silence the compiler. It throws if the value is null. Prefer a checked branch, a safe call, or a meaningful fallback. A read-only reference also does not make its underlying object immutable.' },
    ], question: 'Does val make every object deeply immutable?', answer: 'No. val prevents reassigning the reference. An object held by that reference can still expose mutable state.', exercise: 'Write a function accepting String? that returns a nonblank display name. Try null, an empty string, whitespace and a real name. Explain why ?: alone is not enough.', interview: 'What is the difference between val, var and nullable types in Kotlin?',
  },
  {
    id: 'state-and-routes', title: 'Who owns what on an Android screen?', summary: 'Understand the route, ViewModel and repository before memorising MVVM.', concepts: ['MVVM', 'Ownership', 'Compose'], sourceIds: ['hopper-contracts', 'feed-route'],
    sections: [
      { title: 'Start with a familiar action', body: 'A person taps a button. The UI reports the action; presentation logic updates state; data operations happen behind a repository boundary. The UI then renders the resulting state. This describes responsibilities, not a guarantee that every file already follows them.' },
      { title: 'Your project contract', body: 'AGENTS.md assigns state collection, effect handling and event delegation to routes. ViewModels own presentation work, use cases own application behaviour, and repositories own data consistency. Routes must not implement business logic or directly access data.' },
      { title: 'Why split it?', body: 'A route can be recreated. Keeping database rules inside it couples storage correctness to screen lifetime. A boundary makes the code easier to test and gives each operation a clear owner. Too many layers with no distinct responsibility can also make small features harder to follow.' },
      { title: 'Find evidence', body: 'Compare the documented route contract with the current feed-route excerpt. A document expresses intent. Actual source and focused tests are needed before claiming the implementation satisfies it.' },
    ], question: 'Should a route decide how database duplicates are resolved?', answer: 'No. Duplicate resolution is a data-consistency responsibility of the repository. A route coordinates UI state and events.', exercise: 'Draw the owners for a Save button: UI event, presentation state, persistence and error display. Identify one decision that must not live in the route.', interview: 'Explain MVVM using a feature you can trace, including what belongs outside the ViewModel.',
  },
  {
    id: 'coroutine-lifetime', title: 'A task needs a lifetime, not just a launch', summary: 'Learn what suspend does—and what it does not guarantee.', concepts: ['Coroutines', 'Lifecycle', 'Cancellation'], sourceIds: ['hopper-contracts'],
    sections: [
      { title: 'Before the keyword', body: 'The main thread handles UI work. Blocking it with slow I/O can make the app stop responding. Coroutines let work suspend while waiting, but they still need a scope and an appropriate execution context.' },
      { title: 'Syntax versus behaviour', body: 'suspend means a function can suspend when called from a coroutine or another suspending function. It does not automatically run on a background thread. Blocking I/O still needs an appropriate dispatcher or a genuinely nonblocking API.' },
      { title: 'Project contract', body: 'Name the owner of each job, observer and resource. ViewModels own presentation work. Long-lived connectivity belongs to the process service. Work must define what happens on recreation, backgrounding, logout and process death.' },
      { title: 'The failure to imagine', body: 'A screen disappears while a request is active. Should the result still be saved, discarded, or retried later? There is no universal answer: define the operation contract first. Cancellation is cooperative and does not automatically undo a remote side effect.' },
    ], question: 'Does adding suspend automatically move work off the main thread?', answer: 'No. suspend enables suspension; execution context and the API being called determine whether work blocks the main thread.', exercise: 'For loading a screen and sending a durable message, write down the owner and the desired behaviour after leaving the screen. Explain why their lifetimes may differ.', interview: 'How would you choose a coroutine scope and handle cancellation during an Android request?',
  },
  {
    id: 'contracts-and-tests', title: 'A green build is not proof of behaviour', summary: 'Turn a vague promise into a falsifiable contract and a focused test.', concepts: ['Testing', 'Contracts', 'Evidence'], sourceIds: ['hopper-contracts'],
    sections: [
      { title: 'Three different things', body: 'Syntax describes what the language accepts. A convention describes the preferred coding style. A behavioural contract describes what must remain true for valid and invalid inputs, failures and overlapping operations.' },
      { title: 'Make it falsifiable', body: 'Instead of “sending is reliable”, say “repeating the same operation ID does not create a second stored message”. A test can call the operation twice and count the stored results. This example is a teaching contract, not a claim that every current transport provides exactly-once delivery.' },
      { title: 'The project quality order', body: 'Correct, resilient, concurrent-safe, lifecycle-safe, performant, observable, beautiful. Before implementation, state one invariant and the cheapest check that could disprove it. After a substantive edit, run that focused check.' },
      { title: 'Read evidence carefully', body: 'Compilation checks that sources can be built. A passing unit test checks its particular assertions under its setup. Device checks cover selected runtime conditions. Human visual acceptance is separate. None alone proves the whole system correct.' },
    ], question: 'A build passes. Does that prove retrying a request cannot create duplicates?', answer: 'No. That behaviour needs a contract and an executable test that retries the operation and checks the observable result.', exercise: 'Write one invariant for a message retry. List normal, duplicate, failure and concurrent cases. State exactly what an assertion would measure.', interview: 'What would you test beyond the happy path for an asynchronous messaging feature?',
  },
  {
    id: 'http-and-proxy', title: 'What actually happens on port 2999?', summary: 'Learn HTTP, model routing and why this notebook is a separate service.', concepts: ['HTTP', 'Backend', 'Service boundaries'], sourceIds: ['proxy-boundaries', 'proxy-routing'],
    sections: [
      { title: 'Follow a request', body: 'A client sends an HTTP request to a server. An endpoint combines a method such as POST with a path. JSON is a data format, not a programming language. The model proxy accepts supported request formats and routes them to providers.' },
      { title: 'The current source', body: 'The proxy routing source selects Azure aliases first, OpenRouter aliases next, and otherwise the Bedrock/Mantle path. The source also forwards user prompts and assistant responses to its notification service. Runtime settings determine whether forwarding is active.' },
      { title: 'Why a separate portal?', body: 'The repository requires the proxy to remain a stateless protocol gateway. Learning progress needs storage and a different lifecycle. A separate process lets the notebook change without restarting the agent connection on 2999.' },
      { title: 'Security is part of the design', body: 'The browser calls this portal, not the provider directly. The server holds configuration and sends only approved context after consent. A tunnel makes a service reachable; it is not a replacement for authentication or an always-on host.' },
    ], question: 'Does a public tunnel make a sleeping Mac serve requests?', answer: 'No. The local server and tunnel still need the Mac to be running. Always-on availability needs an always-on host and reachable model backend.', exercise: 'Draw phone → authenticated portal → approved context → model proxy → provider. Mark where progress is stored and where data leaves the Mac.', interview: 'Explain the responsibilities of an API gateway and why you might keep application state outside it.',
  },
  {
    id: 'honest-project-story', title: 'Turn project work into an honest interview story', summary: 'Show what you understand and contributed without claiming the agent’s work as your own.', concepts: ['Interviews', 'Portfolio', 'Communication'], sourceIds: ['hopper-contracts'],
    sections: [
      { title: 'Use a concrete structure', body: 'Problem → constraints → your contribution → alternatives → verification → limitations. Pick a small feature you can explain thoroughly rather than reciting the entire architecture.' },
      { title: 'Keep attribution clear', body: 'Separate agent-generated implementation, your review and testing, and code you wrote independently. It is valid to say you used an AI assistant and then explain how you checked its output.' },
      { title: 'Build evidence, not a percentage', body: 'Reading a lesson is not the same as recalling it later or solving a problem without help. Track these separately. An attempted exercise is self-reported practice, not a certification of skill or job readiness.' },
      { title: 'An answer you can improve', body: '“An agent drafted the change. I traced the state owner, identified a failure case, added a test, and checked its result.” Use this only if it describes work you really performed; otherwise describe it as your next practice goal.' },
    ], question: 'Can you claim you independently implemented a feature because you read an agent’s explanation?', answer: 'No. Describe the actual contribution. Demonstrate understanding by explaining tradeoffs, checking behaviour and making a small independent change.', exercise: 'Write a 90-second feature explanation. Label each contribution as agent-built, reviewed/tested by you, or independently implemented. Replace any unsupported claim.', interview: 'Walk me through a project decision, your own contribution and the evidence that it worked.',
  },
];

export function fingerprint(lesson, sources) {
  return createHash('sha256').update(JSON.stringify([lesson, lesson.sourceIds.map((id) => sources.find((s) => s.id === id)?.hash || 'missing')])).digest('hex');
}

export function retrieve(question, sources, lesson) {
  const words = [...new Set(question.toLowerCase().match(/[a-z]{3,}/g) || [])];
  return sources.filter((source) => !source.missing).map((source) => ({ source, score: (lesson?.sourceIds.includes(source.id) ? 100 : 0) + words.reduce((sum, word) => sum + (source.text.toLowerCase().includes(word) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map(({ source }) => ({ ...source, text: source.text.slice(0, 10000) }));
}