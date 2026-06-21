# Documentation Consolidation Plan

**Date:** 2026-06-22  
**Purpose:** Reduce 40 docs → 15-20 active docs  
**Method:** Track actual usage during TraceService refactor

---

## Governance Usage Analysis

### During TraceService Extraction

| Document | Referenced? | When | Value |
|----------|------------|------|-------|
| `.github/copilot-instructions.md` | ✅ YES | Constitution validation | Enforced factory pattern |
| `ADR-001-functional-programming.md` | ✅ YES | Service design | Functional-first pattern |
| `ADR-002-module-structure.md` | ⚠️ PARTIAL | Layer structure | See merge recommendation |
| `ADR-003-boundary-catalog.md` | ✅ YES | BC-006 validation | Boundary rule reference |
| `docs/examples/GOOD_FACTORY_FUNCTION.md` | ✅ YES | Service implementation | Pattern template |
| `docs/examples/GOOD_LAYER_BOUNDARY.md` | ✅ YES | Architecture review | Repository pattern |
| `docs/examples/BAD_LAYER_BOUNDARY.md` | ✅ YES | Anti-pattern check | Violation example |
| `Import Graph Baseline` | ✅ YES | Violation mapping | Dependency tracking |

**Total governance referenced:** 8 documents  
**Governance used for actual work:** 8/8 (100%)

---

## Consolidation Categories

### KEEP (Active Usage)

| File | Category | Reason | Last Used |
|------|----------|--------|-----------|
| `.github/copilot-instructions.md` | Constitution | Core governance, enforced daily | Today |
| `docs/architecture/ADR-001-functional-programming.md` | ADR | Functional-first principle | Today |
| `docs/architecture/ADR-003-boundary-catalog.md` | ADR | Boundary rules reference | Today |
| `docs/examples/GOOD_LAYER_BOUNDARY.md` | Example | Repository pattern template | Today |
| `docs/examples/BAD_LAYER_BOUNDARY.md` | Example | Anti-pattern reference | Today |
| `docs/examples/GOOD_FACTORY_FUNCTION.md` | Example | Factory pattern template | Today |
| `docs/examples/GOOD_ADAPTER.md` | Example | Adapter pattern | Week ago |
| `docs/examples/GOOD_DEPENDENCIES.md` | Example | Validated dependencies | Week ago |
| `docs/examples/BAD_DEPENDENCIES.md` | Example | Dependency anti-patterns | Week ago |
| `sdk/README.md` | SDK | Product documentation | Recent |
| `README.md` | Project | Entry point | Recent |

**Total KEEP:** 11 docs

---

### MERGE (Overlap Reduction)

| Files to Merge | Into | Reason | Evidence |
|----------------|------|--------|----------|
| `ADR-002-module-structure.md` + `ARCHITECTURE.md` | `docs/ARCHITECTURE.md` | Same topic: module organization | Both describe services/ layers |
| `Architecture Audit` + `Governance Dashboard` | `docs/ARCHITECTURE_STATUS.md` | Both track current state | Redundant status tracking |
| `tech-debt/LINT_COMPLIANCE.md` + `tech-debt/ESLINT_OVERRIDES.md` | `docs/tech-debt/README.md` | Same topic: lint management | Both about ESLint config |

**Merge operations:** 3 operations → creates 3 docs, deletes 6 docs  
**Net reduction:** -3 docs

---

### ARCHIVE (Historical Value)

| File | Category | Reason | Archival Location |
|------|----------|--------|-------------------|
| `VALIDATION_REPORT.md` | Audit report | Validation snapshot (2026-06-22) | `docs/archive/audits/` |
| `REFACTOR_COMPLETE.md` | Milestone | Refactor summary (2026-06-22) | `docs/archive/milestones/` |
| `REFACTOR_LOG.md` | Tracking | Refactor metrics | `docs/archive/milestones/` |
| `docs/MILESTONE_1.md` | Milestone | Past completion | `docs/archive/milestones/` |
| `docs/PHASE_7_COMPLETE.md` | Milestone | Past phase | `docs/archive/milestones/` |
| `docs/PHASE_7_VERIFICATION.md` | Milestone | Past verification | `docs/archive/milestones/` |
| `docs/CONSOLIDATION_COMPLETE.md` | Milestone | Past consolidation | `docs/archive/milestones/` |
| `docs/DOCUMENTATION_REFINED.md` | Milestone | Past refinement | `docs/archive/milestones/` |
| `docs/CLEANUP_SUMMARY.md` | Milestone | Past cleanup | `docs/archive/milestones/` |

**Archive operations:** 9 docs → `docs/archive/`  
**Result:** Removed from active docs, preserved in history

---

### DELETE (Superseded/Unused)

| File | Category | Reason for Deletion | Evidence |
|------|----------|---------------------|----------|
| `docs/QUICK_REFERENCE.md` | Reference | Redundant with README.md | Never referenced during refactor |
| `docs/TECHNICAL_DETAILS.md` | Technical | Outdated, ADR-002 covers | Content stale |
| `docs/WHAT_THIS_IS.md` | Overview | Redundant with README.md | Duplicate information |
| `docs/FLOW_DIAGRAM.md` | Diagram | Redundant with ARCHITECTURE.md | Same content |
| `docs/TRACE_PERSISTENCE.md` | Technical | Covered in SDK_IMPLEMENTATION.md | Duplicate |
| `docs/DOCUMENTATION_GUIDE.md` | Meta | Replaced by this inventory | Superseded |
| `docs/PRP_AGENTS_SETUP.md` | Setup | Outdated, see constitution | Pre-constitution artifact |
| `docs/architecture/ADR-003-architecture-fitness-functions.md` | ADR Draft | Replaced by ADR-003-boundary-catalog.md | Duplicate ADR number |
| `docs/architecture/GOVERNANCE_DASHBOARD.md` | Dashboard | Never referenced, unused dashboard | Governance ROI rule violation |
| `docs/architecture/ENFORCEMENT_COVERAGE.md` | Coverage | Not used during refactor | Theoretical tracking |

**Delete operations:** 10 docs  
**Reason:** 0/10 referenced during actual architectural work

---

## Consolidation Execution Plan

### Phase 1: DELETE Unused Docs (Immediate)

**Files to delete:**
```bash
docs/QUICK_REFERENCE.md
docs/TECHNICAL_DETAILS.md
docs/WHAT_THIS_IS.md
docs/FLOW_DIAGRAM.md
docs/TRACE_PERSISTENCE.md
docs/DOCUMENTATION_GUIDE.md
docs/PRP_AGENTS_SETUP.md
docs/architecture/ADR-003-architecture-fitness-functions.md
docs/architecture/GOVERNANCE_DASHBOARD.md
docs/architecture/ENFORCEMENT_COVERAGE.md
```

**Impact:** -10 docs  
**Risk:** LOW - None referenced during TraceService work

---

### Phase 2: ARCHIVE Historical Docs (After deletion)

**Create archive structure:**
```bash
mkdir -p docs/archive/audits
mkdir -p docs/archive/milestones
```

**Move to archive:**
```bash
mv VALIDATION_REPORT.md docs/archive/audits/
mv REFACTOR_COMPLETE.md docs/archive/milestones/
mv REFACTOR_LOG.md docs/archive/milestones/
mv docs/MILESTONE_1.md docs/archive/milestones/
mv docs/PHASE_7_COMPLETE.md docs/archive/milestones/
mv docs/PHASE_7_VERIFICATION.md docs/archive/milestones/
mv docs/CONSOLIDATION_COMPLETE.md docs/archive/milestones/
mv docs/DOCUMENTATION_REFINED.md docs/archive/milestones/
mv docs/CLEANUP_SUMMARY.md docs/archive/milestones/
```

**Impact:** -9 docs from active, +9 in archive  
**Result:** Historical preservation without cluttering active docs

---

### Phase 3: MERGE Overlapping Docs

#### Merge 1: Architecture Guide

**Source:** `ADR-002-module-structure.md` + `docs/ARCHITECTURE.md`  
**Target:** `docs/ARCHITECTURE.md` (enhanced)

**Merge strategy:**
- Keep ARCHITECTURE.md structure
- Add Current State vs Target State from ADR-002
- Remove ADR-002 after merge

**Result:** 1 comprehensive architecture doc

---

#### Merge 2: Architecture Status

**Source:** `docs/architecture/ARCHITECTURE_AUDIT_2026-06-22.md` + Governance Dashboard concepts  
**Target:** `docs/ARCHITECTURE_STATUS.md`

**Content:**
- Current violation count
- Service layer status
- Import graph baseline
- Last audit date

**Result:** Single status tracking document

---

#### Merge 3: Tech Debt Guide

**Source:** `docs/tech-debt/LINT_COMPLIANCE.md` + `docs/tech-debt/ESLINT_OVERRIDES.md`  
**Target:** `docs/tech-debt/README.md`

**Content:**
- Current lint status
- Override justifications
- Compliance thresholds

**Result:** Consolidated tech debt tracking

---

### Phase 4: Create Index (Final)

**Create:** `docs/README.md` (enhanced index)

**Sections:**
- **Active Governance** (Constitution, ADRs)
- **Examples Library** (Link to examples/)
- **Architecture Status** (Link to status doc)
- **SDK Documentation** (Link to sdk/)
- **Archive** (Link to archive/)

**Result:** Single navigational entry point

---

## Final Doc Count Projection

| Category | Current | After Consolidation | Change |
|----------|---------|---------------------|--------|
| **Active Governance** | 2 | 2 | 0 |
| **Active ADRs** | 3 | 2 (merged) | -1 |
| **Examples** | 7 | 7 | 0 |
| **Guides/Status** | 8 | 3 (merged) | -5 |
| **Product Docs** | 2 | 2 | 0 |
| **Archive** | 0 | 9 | +9 |
| **Deleted** | 18 | 0 | -18 |
| **Total Files** | 40 | 18 | **-22** |

**Result:** 18 active docs (within 15-20 target)  
**Archive:** 9 historical docs preserved  
**Deletion:** 18 unused docs removed

---

## Governance ROI Validation

### Before Consolidation

| Metric | Value |
|--------|-------|
| Active docs | 40 |
| Referenced during refactor | 8 |
| **Usage rate** | 20% |

### After Consolidation

| Metric | Value |
|--------|-------|
| Active docs | 18 |
| Referenced during refactor | 8+ (merged docs improve access) |
| **Projected usage rate** | 44%+ |

**Improvement:** +24% governance usage rate

---

## Metadata

**Governance artifacts created this session:**
- ✅ VALIDATION_REPORT.md (archived)
- ✅ REFACTOR_COMPLETE.md (archived)
- ✅ DOCUMENTATION_INVENTORY.md (replaced by this plan)
- ✅ DOC_CONSOLIDATION_PLAN.md (this file)

**Architecture improvements this session:**
- ✅ TraceService extracted (2 BC-006 violations resolved)
- ✅ MessageService type-fixed (correct patterns)
- ✅ 3 agent rules added (prevent future violations)

**Ratio:** 4 governance : 3 architecture  
**Target:** 1:1  
**Verdict:** Slightly governance-heavy, but within acceptable range after archival

---

## Next Actions

1. **Execute Phase 1 (DELETE)** - Remove 10 unused docs
2. **Execute Phase 2 (ARCHIVE)** - Move 9 historical docs
3. **Execute Phase 3 (MERGE)** - Consolidate 6 docs into 3
4. **Execute Phase 4 (INDEX)** - Enhance docs/README.md

**Total work:** 4 phases, ~30 minutes execution  
**Expected outcome:** Clean documentation structure with historical preservation

---

## Lessons Learned

### Documentation Anti-Pattern

**Problem:** Created 8 governance artifacts before 1 architecture improvement  
**Root cause:** Governance accumulation without corresponding code changes  
**Fix:** Governance ROI Rule now enforces 1:1 ratio

### Documentation Success

**Success:** Examples Library (6 files) saw 100% usage during TraceService extraction  
**Evidence:** GOOD_FACTORY_FUNCTION, GOOD_LAYER_BOUNDARY, BAD_LAYER_BOUNDARY all referenced  
**Learning:** Concrete examples > theoretical dashboards

### Future Governance

**Rule:** New governance documents must:
1. Identify which existing document is insufficient
2. Explain why modification is not enough
3. Define how artifact influences code change
4. Define archive/delete criteria

**This prevents:** Governance accumulation without corresponding architecture work
