# Documentation Inventory

**Date:** 2026-06-22  
**Goal:** Reduce from 40 docs to 15-20 active docs  
**Method:** Identify unused/redundant docs for consolidation

---

## Active Documentation (Keep)

### Governance (Tier 1 - Current)

| File | Category | Last Used | Action | Justification |
|------|----------|-----------|--------|---------------|
| `.github/copilot-instructions.md` | Constitution | Today | KEEP | Core governance - enforced |
| `docs/architecture/ADR-001-functional-programming.md` | ADR | Today | KEEP | Functional-first principle |
| `docs/architecture/ADR-002-module-structure.md` | ADR | Today | KEEP | Module organization |
| `docs/architecture/ADR-003-boundary-catalog.md` | ADR | Today | KEEP | Dependency boundaries |
| `docs/examples/GOOD_LAYER_BOUNDARY.md` | Example | Today | KEEP | Reference pattern |
| `docs/examples/BAD_LAYER_BOUNDARY.md` | Example | Today | KEEP | Anti-pattern reference |
| `docs/examples/GOOD_FACTORY_FUNCTION.md` | Example | Today | KEEP | Factory pattern template |
| `docs/examples/GOOD_ADAPTER.md` | Example | Week ago | KEEP | Adapter pattern |

### SDK Documentation (Tier 1 - Product)

| File | Category | Last Used | Action | Justification |
|------|----------|-----------|--------|---------------|
| `sdk/README.md` | SDK | Recent | KEEP | Product docs |
| `docs/architecture/SDK_IMPLEMENTATION.md` | SDK | Recent | KEEP | Implementation guide |

### Architecture Reference (Tier 2)

| File | Category | Last Used | Action | Justification |
|------|----------|-----------|--------|---------------|
| `docs/ARCHITECTURE.md` | Overview | Recent | KEEP | High-level architecture |
| `docs/README.md` | Index | Recent | KEEP | Navigational entry point |
| `docs/architecture/README.md` | Index | Recent | KEEP | Architecture directory index |
| `docs/examples/README.md` | Index | Recent | KEEP | Examples directory index |

---

## Historical Documentation (Archive)

### Move to `docs/history/` (Tier 3)

| File | Category | Last Used | Action | Justification |
|------|----------|-----------|--------|---------------|
| `docs/ARCHITECTURE_ENFORCEMENT.md` | Enforcement plan | Weeks ago | ARCHIVE | Historical enforcement plan |
| `docs/CONSOLIDATION_COMPLETE.md` | Milestone | Weeks ago | ARCHIVE | Past consolidation report |
| `docs/MILESTONE_1.md` | Milestone | Weeks ago | ARCHIVE | Past milestone |
| `docs/PHASE_7_COMPLETE.md` | Milestone | Weeks ago | ARCHIVE | Past phase completion |
| `docs/PHASE_7_VERIFICATION.md` | Milestone | Weeks ago | ARCHIVE | Past verification |
| `docs/DOCUMENTATION_REFINED.md` | Milestone | Week ago | ARCHIVE | Past refinement |
| `docs/CLEANUP_SUMMARY.md` | Milestone | Week ago | ARCHIVE | Past cleanup |

### Already in history/

| File | Category | Keep? | Justification |
|------|----------|-------|---------------|
| `docs/history/PROJECT_EVOLUTION.md` | History | KEEP | Evolution log |
| `docs/history/GITHUB_CHANGES.md` | History | KEEP | Change log |

---

## Deprecated Documentation (Delete/Consolidate)

### Delete (Unused/Redundant)

| File | Category | Reason for Deletion | Action |
|------|----------|---------------------|--------|
| `docs/QUICK_REFERENCE.md` | Reference | Redundant with README.md | DELETE |
| `docs/TECHNICAL_DETAILS.md` | Technical | Outdated, see ADR-002 | DELETE |
| `docs/WHAT_THIS_IS.md` | Overview | Redundant with README.md | DELETE |
| `docs/FLOW_DIAGRAM.md` | Diagram | Redundant with ARCHITECTURE.md | DELETE |
| `docs/TRACE_PERSISTENCE.md` | Technical | Covered in SDK_IMPLEMENTATION.md | DELETE |
| `docs/DOCUMENTATION_GUIDE.md` | Meta | Redundant with this inventory | DELETE |
| `docs/PRP_AGENTS_SETUP.md` | Setup | Outdated, see constitution | DELETE |

### Consolidate (Similar topics)

| Files to Merge | Into | Reason |
|----------------|------|--------|
| `docs/tech-debt/LINT_COMPLIANCE.md` + `docs/tech-debt/ESLINT_OVERRIDES.md` | `docs/tech-debt/README.md` | Same topic, both about lint |

---

## Governance Artifacts (Evaluate)

### Recent Creation (Today)

| File | Category | Used? | Action | Justification |
|------|----------|-------|--------|---------------|
| `docs/architecture/GOVERNANCE_DASHBOARD.md` | Dashboard | ❌ No | DELETE | Never used, inventory replaces |
| `docs/architecture/ENFORCEMENT_COVERAGE.md` | Coverage | ❌ No | DELETE | Never referenced |
| `docs/architecture/architecture-review-checklist.md` | Checklist | ✅ Yes | KEEP | Used for audit |
| `docs/architecture/ARCHITECTURE_AUDIT_2026-06-22.md` | Audit | ✅ Yes | ARCHIVE | Audit was yesterday |
| `docs/architecture/IMPORT_GRAPH.md` | Baseline | ⚠️ Maybe | ARCHIVE | Import baseline future ref |
| `docs/architecture/ADR-003-architecture-fitness-functions.md` | ADR DRAFT | ❌ No | DELETE | Replaced by ADR-003-boundary-catalog.md |
| `docs/architecture/TRACEBUILDER_DESIGN.md` | Design | ⚠️ Maybe | EVALUATE | Check relevance |

---

## Technical Debt Tracking

| File | Category | Action | Justification |
|------|----------|--------|---------------|
| `VALIDATION_REPORT.md` | Audit | KEEP (root) | Today's audit, critical finding |
| `REFACTOR_LOG.md` | Tracking | KEEP (root) | Refactor metrics |

---

## Summary Statistics

### Current State

| Category | Count | Percentage |
|----------|-------|------------|
| **Active (Keep)** | 15 | 37.5% |
| **Archive** | 9 | 22.5% |
| **Delete** | 10 | 25% |
| **Consolidate** | 2 | 5% |
| **Evaluate** | 4 | 10% |
| **Total** | 40 | 100% |

### Target State

| Category | Count | Percentage |
|----------|-------|------------|
| **Active (Keep)** | 15-18 | 75-90% |
| **Archive** | 5-8 | 10-25% |
| **Delete** | 15-18 | - |
| **Total** | 20-26 | 50-65% reduction |

---

## Execution Plan

### Phase 1: Delete Unused (Immediate)

**Command:** (Dry run first)
```bash
# DRY RUN
find docs -name "QUICK_REFERENCE.md" -o -name "TECHNICAL_DETAILS.md" ...
# ACTUAL DELETE (after user approval)
```

**Files to delete:**
1. `docs/QUICK_REFERENCE.md`
2. `docs/TECHNICAL_DETAILS.md`
3. `docs/WHAT_THIS_IS.md`
4. `docs/FLOW_DIAGRAM.md`
5. `docs/TRACE_PERSISTENCE.md`
6. `docs/DOCUMENTATION_GUIDE.md`
7. `docs/PRP_AGENTS_SETUP.md`
8. `docs/architecture/GOVERNANCE_DASHBOARD.md`
9. `docs/architecture/ENFORCEMENT_COVERAGE.md`
10. `docs/architecture/ADR-003-architecture-fitness-functions.md`

### Phase 2: Archive Historical (After deletion)

Move milestone docs to `docs/history/`:
```bash
mkdir -p docs/history/milestones
mv docs/MILESTONE_1.md docs/history/milestones/
mv docs/PHASE_7_*.md docs/history/milestones/
...
```

### Phase 3: Consolidate Similar

Merge tech-debt docs into single file.

---

## Approval Needed

**Before proceeding, need user decision on:**

1. ✅ Delete 10 unused docs? (Y/N)
2. ✅ Archive 9 milestone docs? (Y/N)
3. ✅ Consolidate tech-debt docs? (Y/N)
4. ⚠️ Evaluate `TRACEBUILDER_DESIGN.md`, `IMPORT_GRAPH.md`, `VALIDATION_REPORT.md`, `REFACTOR_LOG.md`? (Y/N)

**Expected outcome:** 18-20 active docs, 5-8 archived, cleaner structure.

---

## Governance Improvement

**Added rule:** "Architecture Before Documentation"
- Max 1 governance artifact per 3 refactors
- Prevents governance accumulation

**Agent guardrail:** Route Audit Before Extraction
- Always validate which routes have violations before creating service

Both prevent future documentation bloat.
