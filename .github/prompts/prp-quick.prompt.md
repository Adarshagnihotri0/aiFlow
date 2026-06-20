---
description: Rapid impact assessment (30 seconds)
agent: prp-analyst
tools: ['search', 'codebase']
---
Quick scan for impact assessment.

Feature/change: ${input:change:What are you changing?}

---

## Auto-Capture

**Files affected:**
[Git diff analysis - what changed in last commit]

**Dependencies:**
[Static analysis - what imports these files]

**Test coverage:**
[Check if tests exist for affected files]

---

## Impact Assessment

Risk Level: [LOW | MEDIUM | HIGH]
- LOW: Well-tested, isolated change
- MEDIUM: Some tests, shared dependencies
- HIGH: No tests, core files affected

---

## Evidence (Auto-detected)

| Evidence Type | Present? |
|---------------|----------|
| Unit tests | [YES/NO] |
| Integration tests | [YES/NO] |
| Runtime traces | [YES/NO] |
| Documentation | [YES/NO] |

---

## Decision Point

- Continue to `/prp-decide` for planning
- Direct implementation if LOW risk
- Abort if HIGH risk without tests

---

**Output:** Impact summary in under 30 seconds.
