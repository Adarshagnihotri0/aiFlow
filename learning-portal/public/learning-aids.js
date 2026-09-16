/** Locally curated language/concept definitions, never inferred project architecture. */
const glossary = {
  'read-kotlin': [
    ['val', 'Declares a reference that cannot be reassigned. The referenced object may still be mutable.'],
    ['Nullable type', 'A type marked with ? permits null as well as values of that type. Null means no value; it is not an empty string.'],
    ['Elvis operator (?:)', 'Uses the right-hand value only when the left-hand value is null.'],
  ],
  'state-and-routes': [
    ['State', 'Values describing a system at a particular point in time.'],
    ['Owner', 'The component responsible for a decision, operation or resource and its lifetime.'],
    ['Repository', 'A boundary that manages access to data and its consistency rules. The actual implementation must be checked in source.'],
  ],
  'coroutine-lifetime': [
    ['Suspension', 'Pausing a coroutine so its thread can do other work. The suspend keyword alone does not move work to a background thread.'],
    ['Scope', 'A lifetime boundary for coroutines launched within it.'],
    ['Cancellation', 'A request for work to stop cooperatively. It does not automatically undo a completed side effect.'],
  ],
  'contracts-and-tests': [
    ['Invariant', 'A condition required to remain true under the circumstances specified by a contract.'],
    ['Falsifiable', 'Specific enough that an observation could show the claim is false.'],
    ['Evidence', 'An observation supporting a claim within the conditions checked; not proof of every possible case.'],
  ],
  'http-and-proxy': [
    ['HTTP request', 'A message a client sends to a server, with a method, target and optional data.'],
    ['Endpoint', 'An API operation identified here by an HTTP method and path.'],
    ['Proxy', 'An intermediary that receives a request and forwards it to another service.'],
  ],
  'honest-project-story': [
    ['Attribution', 'Stating who performed which part of the work, including assistance.'],
    ['Tradeoff', 'A choice that gains something while accepting a cost or limitation.'],
    ['Verification', 'Checking a specific claim against observations or tests, with stated limits.'],
  ],
};

export function learningStyle(value) { return value === 'focused' ? 'focused' : 'standard'; }

export function learningAids(lessonId) {
  const definitions = Object.hasOwn(glossary, lessonId) ? glossary[lessonId] : [];
  return {
    definitions: definitions.map(([term, meaning]) => ({ term, meaning })),
    definitionPrompt: 'Choose one term from this lesson. What does it mean here? What does it not mean? Check the supplied explanation or source; leave unknowns open.',
    connections: [
      ['Input', 'What value or event starts the operation?'],
      ['Owner', 'Which component is responsible for this operation and its lifetime?'],
      ['Output', 'What value, state change or side effect should result?'],
      ['Failure', 'What can go wrong, and what should happen then?'],
      ['Evidence', 'Which source or test could confirm or contradict this account?'],
    ].map(([label, prompt]) => ({ label, prompt })),
    assumptions: [
      ['Assumption', 'What are you treating as true? Under which conditions?'],
      ['Alternative', 'What other explanation or design could fit?'],
      ['Tradeoff', 'What would each choice gain and cost?'],
      ['Test', 'What observation could distinguish them or disprove the assumption?'],
    ].map(([label, prompt]) => ({ label, prompt })),
  };
}