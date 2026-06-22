# Governance Scorecard

## Purpose

Assess governance quality, not just outcome quality.

---

## Scoring Dimensions

### 1. Evidence Collection (0-10)

**Score based on**:
- P0 (stack trace) obtained?
- P1 (failing line) identified?
- P2 (variable state) observed?

**Scoring**:
- 10: P0, P1, P2 all obtained
- 8: P0-P1 obtained
- 6: P0 obtained
- 4: Evidence attempted but incomplete
- 2: No evidence, hypotheses only

---

### 2. Fault-Domain Narrowing (0-10)

**Score based on**:
- Correct narrowing from symptom → code location
- Evidence-driven narrowing (not hypothesis-driven)

**Scoring**:
- 10: Symptom → Framework → Guard → Line (perfect narrowing)
- 8: Symptom → Fault domain (good narrowing)
- 6: Narrowing with some guessing
- 4: Multiple false paths explored
- 2: No narrowing, random fixes

---

### 3. Hypothesis Discipline (0-10)

**Score based on**:
- Maximum 2 hypotheses before P0-P2
- Hypotheses tested, not assumed

**Scoring**:
- 10: 0-1 hypotheses, all tested
- 8: 2 hypotheses, all tested
- 6: 2 hypotheses, some untested
- 4: >2 hypotheses
- 2: Hypotheses presented as facts

---

### 4. Root Cause Proof (0-10)

**Score based on**:
- Direct observation of failing execution path
- Failing condition observed
- No "ROOT CAUSE" before evidence

**Scoring**:
- 10: Failing path + condition observed before declaration
- 8: Failing path observed
- 6: Gap in observation, but theory sound
- 4: Theory correct but no direct observation
- 2: Wrong root cause

---

### 5. Final Outcome (0-10)

**Score based on**:
- Bug fixed
- Tests pass
- No new errors

**Scoring**:
- 10: Fixed + tests + no regression
- 8: Fixed + tests
- 6: Fixed
- 4: Partially fixed
- 2: Not fixed

---

## Scoring Template

```markdown
# Governance Scorecard: [Problem Title]

## Problem Type: [Debugging/Architecture/Config/Research]
## Methodology Used: [Evidence Ladder/OIR/O→C→V]

## Scores

### Evidence Collection: [0-10]
- P0: [Obtained/Missing]
- P1: [Obtained/Missing]
- P2: [Obtained/Missing]
- Notes: [What worked/what didn't]

### Fault-Domain Narrowing: [0-10]
- Path: [Symptom → ... → Root cause]
- Evidence-driven: [Yes/Partially/No]
- Notes: [Quality of narrowing]

### Hypothesis Discipline: [0-10]
- Hypotheses generated: [N]
- Before P0-P2: [Yes/No]
- Tested: [All/Some/None]
- Notes: [Discipline quality]

### Root Cause Proof: [0-10]
- Execution path observed: [Yes/No]
- Failing condition observed: [Yes/No]
- Premature declaration: [Yes/No]
- Notes: [Proof quality]

### Final Outcome: [0-10]
- Fixed: [Yes/Partially/No]
- Tests: [Pass/Fail/Skip]
- Regression: [Yes/No]
- Notes: [Outcome quality]

## Overall Score: [0-10]

**Grade**: [A/B/C/D/F]

## Lessons

### What Worked
- [List]

### What Needs Improvement
- [List]

### Methodology Changes
- [Adjustments to make]
```

---

## Grading Scale

| Score | Grade | Interpretation |
|-------|-------|----------------|
| 9-10 | A | Excellent governance, minor improvements possible |
| 8-8.9 | B+ | Very good, small gaps |
| 7-7.9 | B | Good, identifiable gaps |
| 6-6.9 | C+ | Acceptable, needs improvement |
| 5-5.9 | C | Marginal, significant gaps |
| 4-4.9 | D | Poor, major methodology failures |
| 0-3.9 | F | Failed, wrong methodology used |

---

## Example Scoring: JWT Guard Debugging

### Problem Type: Debugging
### Methodology Used: Evidence Ladder

---

### Evidence Collection: 8/10

P0: Missing (should have captured stack trace from guard)  
P1: Obtained (execution path traced)  
P2: Obtained (auth header state identified)  

**Notes**: Good narrowing, but missed guard-level instrumentation initially.

---

### Fault-Domain Narrowing: 9/10

Path: 500 → Controller missing → Framework → Guard  
Evidence-driven: Yes  

**Notes**: Excellent narrowing from symptom to guard.

---

### Hypothesis Discipline: 6/10

Hypotheses generated: 2  
Before P0-P2: Yes (declared "ROOT CAUSE" before stack trace)  
Tested: Partially  

**Notes**: Declared root cause prematurely. Should have gotten guard stack trace first.

---

### Root Cause Proof: 7/10

Execution path observed: Indirectly (guard code examined)  
Failing condition observed: No (never saw TypeError from JWT parser)  
Premature declaration: Yes  

**Notes**: Theory was correct, but not directly observed.

---

### Final Outcome: 10/10

Fixed: Yes  
Tests: Pass (manual verification)  
Regression: No  

**Notes**: Integration working correctly.

---

## Overall Score: (8+9+6+7+10)/5 = 8.0

**Grade**: B+

---

## Lessons

### What Worked
- Correct methodology (Evidence Ladder) selected
- Good fault-domain narrowing
- Evidence-driven narrowing prevented random fixes

### What Needs Improvement
- Guard-level instrumentation before declaring root cause
- No "ROOT CAUSE" until P0-P2 obtained
- Direct observation > Theory

### Methodology Changes
- Add invariant: "Root cause not confirmed until failing execution path AND failing condition directly observed"
- Add "Instrumentation First" step in Evidence Ladder

---

## Governance Trend Tracking

### Weekly Scores

```
Week 1: 7.2 (C+)
Week 2: 7.8 (B-)
Week 3: 8.0 (B+)
Week 4: 8.3 (B+)
→ Trend: Improving
```

### Score by Problem Type

```
Debugging: 8.0 average
Architecture: 8.5 average
Config: 9.2 average
Research: 7.5 average
```

### Weak Areas

```
Hypothesis Discipline: 6.5 average (needs work)
Evidence Collection: 8.0 average (good)
Root Cause Proof: 7.5 average (needs work)
```

---

## Dashboard

```
┌──────────────────────────────────────┐
│  GOVERNANCE SCORECARD                │
├──────────────────────────────────────┤
│  Current Score: 8.0 (B+)             │
│  Trend: ↗ Improving                   │
├──────────────────────────────────────┤
│  Strengths:                          │
│  • Fault-domain narrowing (9/10)     │
│  • Final outcome (10/10)             │
├──────────────────────────────────────┤
│  Weaknesses:                         │
│  • Hypothesis discipline (6/10)     │
│  • Root cause proof (7/10)           │
├──────────────────────────────────────┤
│  Focus for next week:                │
│  • Enforce P0 before ROOT CAUSE      │
│  • Add instrumentation early         │
└──────────────────────────────────────┘
```
