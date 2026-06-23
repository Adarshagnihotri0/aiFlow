# Calibration Ledger

Track all claims and their outcomes.

## Purpose

Measure reasoning quality, not just outcomes.

**Goal**: Calibration accuracy >90%

---

## Active Claims

| Date | Claim | Evidence | Confidence | Status | Outcome |
|------|-------|----------|------------|--------|---------|
| YYYY-MM-DD | [Claim] | [P0-P4] | [%] | Pending | - |

---

## Resolved Claims

| Date | Claim | Evidence | Confidence | Outcome | Issue |
|------|-------|----------|------------|---------|-------|
| YYYY-MM-DD | [Claim] | [P0-P4] | [%] | [Correct/Incorrect] | [Issue] |

---

## Metrics

### Current Period: [Date Range]

```
Total Claims: N
Correct: M
Incorrect: K
Pending: P

Calibration Accuracy: M/N
```

### Thresholds

```
Excellent: >95%
Good: >90%
Acceptable: >85%
Needs Improvement: <85%
```

---

## Patterns Detected

### Overconfidence Pattern

Claims with ≥90% confidence that were incorrect:

```
Claim: [Example]
Evidence: P3
Confidence: 95%
Outcome: Incorrect
```

**Fix**: Require P1 or higher for ≥90% confidence.

### Premature Declaration Pattern

Claims declared "ROOT CAUSE" before P0-P2:

```
Claim: [Example]
Declared: ROOT CAUSE
Evidence at declaration: P4
Evidence eventually: P0
```

**Fix**: Enforce "No ROOT CAUSE until P0-P2" rule.

---

## Insights

### What's Working

- [List methodologies producing correct claims]

### What Needs Adjustment

- [List failure patterns]

### Methodology Changes

- [Adjustments based on calibration data]

---

## Historical Trends

```
Week 1: X% accuracy, Y claims
Week 2: X% accuracy, Y claims
Week 3: X% accuracy, Y claims
→ Trend: [Improving/Stable/Declining]
```
