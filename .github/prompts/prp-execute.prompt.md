---
description: Minimal execution with validation (variable time)
agent: prp-executor
tools: ['edit', 'search', 'runCommands', 'terminal']
---
Execute with validation gates.

Plan: ${input:plan:What to implement?}

---

## Pre-flight Check

**Risk Level:** [from prp-quick]
**Decision:** [from prp-decide]
**Files:** [List what will change]

---

## Execution Rules

1. **One task at a time**
   - Make change
   - Show diff
   - Run tests IMMEDIATELY

2. **Stop on failure**
   - Do NOT proceed if tests fail
   - Report error
   - Ask for guidance

3. **Evidence-based changes**
   - Each change traces to decision

---

## Execution Log

```
TASK 1: [File:line]
Evidence: [From decision]
Changes:
[Diff]

Validation:
[Run test command]
Status: [PASS/FAIL]

─────────────────────────

TASK 2: [Continue...]

─────────────────────────

VALIDATION SUMMARY:
Build: [PASS/FAIL]
Tests: [PASS/FAIL - X/Y]
Lint: [PASS/FAIL]

VERDICT: [READY | NEEDS FIXES]
```

---

## Minimal Output

- Show ONLY what changed
- Show ONLY test results
- No verbose explanations

---

## If Validation Fails

STOP here.

**Report:**
- Task that failed
- Test output
- Suggested fix

Do NOT continue to next task.

---

## Success Criteria

- All tests pass
- Build succeeds
- Decision record created (if high-risk)

---

**Goal:** Implement with confidence, minimal overhead.
