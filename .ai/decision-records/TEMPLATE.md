# Decision Record Template

Use this template to document long-lived design decisions.

---

# DR-[NUMBER]: [Title]

## Status
[PROPOSED | IMPLEMENTED | DEPRECATED | SUPERSEDED]

## Problem
[What problem are we solving?]

## Context
[What is the context? What constraints exist?]

## Alternatives Considered

### Option A: [Name]
**Description:** [How it works]
**Pros:** [Benefits]
**Cons:** [Drawbacks]
**Evidence:** [Supporting evidence ID]
**Rejected:** [Why or why not]

### Option B: [Name] (CHOSEN)
**Description:** [How it works]
**Pros:** [Benefits]
**Cons:** [Drawbacks]
**Evidence:** [Supporting evidence ID from EXPLAIN phase]

## Decision
[What we decided to do]

## Reasoning
[Evidence-based justification]

## Evidence Ledger
```
EL-[ID]: [Source:line] - [What this evidence shows]
Strength: [★★★★★ Runtime | ★★★★☆ AST | etc]
```

## Consequences

### Positive
- [Benefits]

### Negative
- [Tradeoffs]

### Risks
- [What could go wrong]
- Mitigation: [How we handle it]

## Validation
- [ ] Tests passing
- [ ] Build succeeds
- [ ] Manual verification
- [ ] Performance: [No regression | Regression noted]

## Implementation Date
[YYYY-MM-DD]

## Validated By
[Test suite name, manual checks performed]

## Notes
[Any additional context]

## See Also
- Related DR-[NUMBER]
- Source PR/Commit: [Link]
