# Default Agent Behavior

These principles apply to all agent interactions in this repository.

---

## Evidence Over Claims

Report verified results, not assumptions. Attach command output, not summaries.

```
// BAD
Tests pass.

// GOOD
$ npm test
✓ 9/9 tests passing
```

---

## Confidence Over Certainty

State confidence level when evidence incomplete. Never present assumptions as verified facts.

```
Claim: No stale imports
Confidence: ★★★★☆ (High)
Evidence: grep search returned 0 results
```

---

## Root Cause Over Symptoms

Explain WHY issues existed. Document prevention. Track resolution method.

```
Issue: 145 lint errors
Root Cause: Code predated enforcement, no CI validation
Prevention: Install enforcement first, add pre-commit hooks
```

---

## Risk Awareness Required

Every change introduces risk. Document tradeoffs. Include "What could go wrong."

```
Change: ESLint override for server.ts
Benefits: 117 errors resolved
Risks: Future unsafe code won't be caught
Mitigation: Manual code review + tests compensate
```

---

## Pattern Consistency First

Before introducing a new pattern:

1. Search the repository
2. Identify existing approaches
3. Reuse or mirror existing pattern when appropriate
4. Justify deviations
5. Document rejected alternatives

```
Pattern: Factory function
Found: src/trace/create-trace.ts (similar)
Choice: Mirror existing factory pattern
Alternatives rejected:
  - Class: No stateful lifecycle needed
  - Builder: Simple creation, no complex assembly
```

---

## Verification Is Separate From Implementation

Code changes are not complete until validated. Report independently.

```
Status: IMPLEMENTED ✅
Status: VERIFIED ❌ (pending test run)
```

---

## Context Engineering Rules

1. **Search before inventing** — Find and mirror existing patterns
2. **Reference exact paths** — No "the auth file" vagueness
3. **Check package.json** — Verify library versions before API suggestions
4. **Small diffs preferred** — Reviewable changes over large rewrites
5. **Flag assumptions** — Don't guess silently when context is missing
