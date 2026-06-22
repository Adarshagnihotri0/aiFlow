# Assumption Risk Matrix Framework

**Purpose:** Prevent recommendations that depend on unresolved high-impact assumptions.

---

## Framework Overview

### Version 4: Assumption Risk Matrix + Recommendation Gate

```
Assumption  | Evidence | Impact | Status
------------|----------|--------|--------
A1          | None     | HIGH   | BLOCKING

Gate Rule:
- HIGH impact + NO evidence = BLOCK recommendation
- MEDIUM impact = PREFER verification
- LOW impact = CAN proceed
```

---

## Phase 1: Findings

### Verified Findings
```markdown
F1: [Finding text]
Evidence: [attached]
Status: VERIFIED
```

### Inferences
```markdown
I1: [Inference from findings]
Based on: [F1, F2]
Confidence: HIGH/MEDIUM/LOW
Status: SUPPORTED
```

### Assumptions
```markdown
A1: [Assumption text]
Evidence: NONE/PARTIAL/THEORY
Impact: HIGH/MEDIUM/LOW
Status: UNVERIFIED/HYPOTHESIS/TESTED
```

---

## Phase 2: Assumption Audit

### Risk Matrix Template

| ID  | Assumption                          | Evidence | Impact | Status    |
|-----|-------------------------------------|----------|--------|-----------|
| A1  | [Description]                       | None     | HIGH   | BLOCKING  |
| A2  | [Description]                       | Theory   | MEDIUM | INVESTIGATE |
| A3  | [Description]                       | Partial  | LOW    | PROCEED   |

### Impact Levels

**HIGH**
- Determines recommendation target
- Affects which files modified
- Changes architecture structure

**MEDIUM**
- Affects implementation approach
- Influences design decisions

**LOW**
- Nice-to-have improvement
- Minor optimization

### Evidence Levels

**None**
- No data
- No investigation
- Pure assumption

**Theory**
- Architectural principle
- Best practice knowledge
- Industry pattern

**Partial**
- Some audit performed
- Incomplete investigation
- Mixed signals

**Verified**
- Full investigation
- Data attached
- Confirmed or disproven

---

## Phase 3: Investigation Gate

### Gate Rules

```
HIGH impact + NO evidence
  → Status: BLOCKING
  → Must resolve before recommendation

MEDIUM impact + THEORY/PARTIAL evidence
  → Status: INVESTIGATE
  → Prefer verification before recommendation

LOW impact
  → Status: PROCEED
  → Can recommend with caveat
```

### Recommendation Status

```
Status: BLOCKED
  - Cannot proceed
  - Investigation required
  - Update matrix with findings

Status: CONDITIONAL
  - Can proceed with caveats
  - Document assumptions
  - Recommend investigation

Status: READY
  - All blockers resolved
  - Evidence attached
  - Proceed to recommendation
```

---

## Phase 4: Recommendation

### Prerequisites

Before any recommendation:

```
✓ Finding → Evidence attached
✓ Expected improvement → Measured
✓ High-impact assumptions → Resolved
```

Missing any:

```
Status: Design Idea (not Recommendation)
```

All present:

```
Status: Recommendation
```

---

## Complete Workflow Example

### BC-006 Incident (Correct Process)

**Phase 1: Findings**
```
F1: server.ts has db imports
I1: May indicate BC-006 violations
A1: Message routes contain most violations (NONE evidence)
```

**Phase 2: Audit**
```
Assumption           | Evidence | Impact | Status
---------------------|----------|--------|--------
A1: Message routes   | None     | HIGH   | BLOCKING
```

**Gate Check:** A1 is BLOCKING → Cannot recommend MessageService

**Phase 3: Investigation**
```
Audit route imports
Count violations by route
Finding: Trace routes have 2 violations, message routes clean
Update: A1 DISPROVEN, F2: Trace routes = hotspot
```

**Phase 4: Recommendation**
```
Recommendation: Extract TraceService
Finding: F2 (verified)
Expected: 2→0 violations
Assumptions: All resolved
Status: RECOMMENDATION
```

---

## Application Scope

**Applies to:**
- Service extraction
- Repository pattern introduction
- Layer addition
- Documentation creation
- Governance proposals
- Abstraction creation
- Refactoring proposals

**Does NOT apply to:**
- Bug fixes (clear problem, clear solution)
- Type fixes (error → no error)
- Minor refactorings (extract function, rename)

---

## Implementation Location

### Constitution (What)

```markdown
## Recommendation Prerequisites

Recommendations require:
1. Verified finding (evidence attached)
2. Measured expected improvement
3. High-impact assumptions resolved

Missing any: Status = Design Idea
```

### Agent Instructions (How)

```markdown
## Assumption Risk Matrix

Before recommendations:
1. List assumptions
2. Assess evidence and impact
3. Apply gate rules
4. Resolve blockers before recommending
```

---

## Metrics

**Track:**
- Recommendations blocked by matrix
- Assumptions resolved before recommendation
- Design Ideas vs Recommendations

**Target:**
```
100% of recommendations have assumptions audited
0 recommendations with unresolved HIGH-impact assumptions
```

---

## Key Distinction

**Assumption vs Inference**

Assumption: External claim, no supporting data
```
A1: Message routes have violations
Evidence: None
```

Inference: Logical conclusion from evidence
```
I1: TraceService reduces violations
Based on: F1 (verified)
```

**Hierarchy:**
```
Evidence → Inference → Recommendation
Assumption → (tracked separately)
```

---

## History

**Version 1:** No evidence check
**Version 2:** Evidence Over Claims (constitution)
**Version 3:** Evidence Classification
**Version 4:** Assumption Risk Matrix + Recommendation Gate

**Version 4 prevents the MessageService/Evidence Violation class of failures.**

---

**Status:** Framework-level improvement  
**Location:** Agent instruction (all repos)  
**Impact:** Universal recommendation quality
