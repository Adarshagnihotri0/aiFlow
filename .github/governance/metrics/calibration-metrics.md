# Calibration Metrics

## Purpose

Track reasoning quality over time.

---

## Primary Metrics

### Calibration Accuracy

```
Calibration Accuracy = Correct Claims / Total Claims
```

**Target**: >90%

**Calculation**:
```
Week 1: 20 claims, 16 correct = 80%
Week 2: 25 claims, 23 correct = 92%
Week 3: 30 claims, 28 correct = 93%
→ Trend: Improving
```

---

### Overconfidence Rate

```
Overconfidence Rate = Wrong claims with ≥90% confidence / Total claims with ≥90% confidence
```

**Target**: <5%

**Example**:
```
High confidence claims: 15
Wrong: 2
Rate: 13%
→ Problem: Being overconfident
```

---

### Premature Declaration Rate

```
Premature Rate = "ROOT CAUSE" declared before P0-P2 / Total "ROOT CAUSE" declarations
```

**Target**: 0%

**Example**:
```
Root cause declarations: 10
Before P0: 3
Rate: 30%
→ Problem: Declaring too early
```

---

## Secondary Metrics

### Evidence Quality Distribution

```
P0 (Direct): 40%
P1 (Strong): 30%
P2 (Moderate): 20%
P3 (Weak): 8%
P4 (Hypothesis): 2%
```

**Goal**: Shift toward P0-P1 over time.

---

### Problem Type Distribution

```
Architecture: 30%
Debugging: 40%
Configuration: 20%
Research: 10%
```

**Goal**: Understand what types of problems you face most.

---

### Methodology Accuracy

```
Correct methodology used / Total problems
```

**Target**: >95%

**Example**:
```
Problems: 50
Correct methodology: 45 (90%)
OIR used for debugging: 3 (wrong)
Evidence Ladder used for config: 2 (wrong)
→ Problem: Classification errors
```

---

## Tracking Methods

### Per-Session Tracking

After each debugging/architecture session:

1. Log claim in calibration ledger
2. Track evidence level (P0-P4)
3. Record confidence (0-100%)
4. Update when resolved

### Weekly Review

Every week:

1. Calculate calibration accuracy
2. Identify patterns (overconfidence, premature declarations)
3. Adjust methodology based on findings
4. Update governance rules if needed

### Monthly Trend Analysis

Every month:

1. Plot calibration accuracy over time
2. Check evidence quality distribution
3. Check problem type distribution
4. Assess governance ROI

---

## Reporting Template

### Weekly Report

```markdown
# Calibration Report: Week N

## Metrics
- Total claims: 25
- Correct: 23
- Calibration accuracy: 92%

## Issues Identified
- Overconfidence: 2 claims at 95%+ confidence were wrong
- Premature declarations: 1 ROOT CAUSE before P0

## Adjustments
- Require P1 evidence for 90%+ confidence
- Enforce "No ROOT CAUSE until P0-P2" rule

## Wins
- Evidence Ladder applied correctly 10/12 times (83%)
- OIR template usage improved
```

---

## Dashboard Metrics

```
┌─────────────────────────────────────┐
│  CALIBRATION DASHBOARD              │
├─────────────────────────────────────┤
│  Calibration Accuracy: 92%     ✓    │
│  Overconfidence Rate: 3%        ✓    │
│  Premature Declarations: 0      ✓    │
│  Methodology Accuracy: 96%      ✓    │
├─────────────────────────────────────┤
│  Claims this week: 25                │
│  Evidence quality: P0=40%            │
│  Problem types: Debug=40%            │
└─────────────────────────────────────┘
```

---

## Calibration Thresholds

| Metric | Excellent | Good | Acceptable | Poor |
|--------|-----------|------|------------|------|
| Calibration Accuracy | >95% | >90% | >85% | <85% |
| Overconfidence Rate | <2% | <5% | <10% | >10% |
| Premature Declarations | 0% | <5% | <10% | >10% |
| Methodology Accuracy | >98% | >95% | >90% | <90% |

---

## Action Triggers

**Calibration < 85%**:
- Review last 10 claims
- Identify systematic drift
- Add guardrails to methodology

**Overconfidence > 10%**:
- Require higher evidence for high confidence
- Add "Evidence required" checklist

**Premature Declarations > 5%**:
- Enforce "No ROOT CAUSE until P0-P2" rule
- Add automated check in templates
