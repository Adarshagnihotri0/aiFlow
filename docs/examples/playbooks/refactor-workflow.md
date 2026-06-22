# Refactor Workflow Playbook

This playbook operationalizes the Architecture Reasoning framework for refactoring tasks.

---

## 1. Highest-Leverage First

When multiple architectural issues exist:

1. **Measure all violations** — Count actual problems, not theoretical ones
2. **Rank by impact** — Which violations affect most code paths
3. **Refactor highest-impact violation first** — Maximum architectural improvement per effort

**Do not create new layers unless they address a measured architectural problem.**

Example calculation:
```
BC-006 violations in trace routes = 2 (affects 2 endpoints, db skip)
BC-006 violations in message routes = 0 (no db imports)

Result:
Refactor trace routes first.
Message routes already clean.
```

---

## 2. Baseline Before Refactor

Every architectural change must record:

- **Current LOC** — Lines of code in affected files
- **Current violations** — Count and location of boundary violations
- **Current dependency graph** — Import structure before changes
- **Current test status** — All tests passing/failing

Refactors are measured against a baseline.

**No refactor begins without a baseline.**

Example baseline:
```
File: src/server.ts (493 LOC)
Violations: 2 (lines 208, 458)
Imports: saveTraceAsync, getPool (skip-layer)
Tests: 9/9 passing
```

---

## 3. Refactor Success Criteria

A refactor is complete only if:

- ✅ **Complexity decreases** — Fewer lines or simpler structure
- ✅ **Violations decrease** — Boundary violations reduced
- ✅ **Tests pass** — All tests still passing
- ✅ **Build passes** — TypeScript compilation successful
- ✅ **Lint passes** — 0 errors

**Creating new files alone is not a successful refactor.**

Example:
```
❌ MessageService extraction:
  - New file created ✅
  - Violations unchanged ❌ (0 → 0)
  - Not integrated ⚠️
  
  Result: INCOMPLETE

✅ TraceService extraction:
  - New file created ✅
  - Violations reduced ✅ (2 → 0)
  - Integrated ✅
  - Tests pass ✅
  
  Result: COMPLETE
```

---

## Reference

See: `docs/examples/retrospectives/bc006-investigation.md` for full case study demonstrating Observation → Interpretation → Recommendation failure and recovery.
