---
description: Minimal decision documentation (2-5 minutes)
agent: prp-analyst
tools: ['search', 'codebase']
---
Document decision alternatives with reasoning.

Decision: ${input:decision:What decision are you making?}

---

## Context
[1-2 lines: Why this decision matters]

---

## Alternatives

**Option A:** [Description]
- Cost: [LOW | MEDIUM | HIGH]
- Evidence: [What supports this]

**Option B:** [Description] (CHOSEN)
- Cost: [LOW | MEDIUM | HIGH]
- Evidence: [What supports this]

**Option C:** [Optional third]

---

## Reason
[1-2 lines: Why Option B? Evidence-backed]

---

## Validation Plan
- [ ] Tests: `[command]`
- [ ] Manual: [What to check]

---

## Decision Record Required?
- **YES** if: Auth, API contracts, architecture, security
- **NO** if: Bug fixes, refactoring, minor tweaks

If YES, create `.ai/decision-records/DR-XXX.md` using template.

---

## Execution
Ready for `/prp-execute` or direct implementation if LOW risk.

---

**Goal:** Minimal documentation, maximal clarity. 2-5 minutes max.
