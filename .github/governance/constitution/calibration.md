# Calibration

## Definition

Calibration = How well your confidence matches reality.

**Well-calibrated**:
- 90% confidence claims are correct 90% of the time
- 50% confidence claims are correct 50% of the time

**Poorly-calibrated**:
- 90% confidence claims are correct only 60% of the time (overconfident)
- 50% confidence claims are correct 80% of the time (underconfident)

---

## Calibration Ledger

Track every claim:

```markdown
Claim: [Statement]
Evidence Level: [P0/P1/P2/P3/P4]
Confidence: [0-100%]
Outcome: [Correct/Incorrect/Pending]
Issue: [What went wrong, if anything]
```

---

## Metrics

### Primary Metric
```
Calibration Accuracy = Correct Claims / Total Claims
```

### Secondary Metrics
```
Overconfidence Rate = Claims marked 90%+ that were wrong
Underconfidence Rate = Claims marked 50%- that were correct
```

### Target
```
Calibration Accuracy: >90%
Overconfidence Rate: <5%
```

---

## Example Entries

### Example 1: JWT Guard (Good Outcome, Process Issue)

```markdown
Claim: JWT Guard caused failure
Evidence Level: P3 (inferred from code reading)
Confidence: 90%
Outcome: Correct
Issue: Declared "ROOT CAUSE" before direct observation
Resolution: Should have added guard-level logging first
```

### Example 2: TypeScript Deprecation (Good)

```markdown
Claim: Config flag deprecated
Evidence Level: P0 (direct observation of warning)
Confidence: 100%
Outcome: Correct
Issue: None
```

### Example 3: Hypothetical Failure

```markdown
Claim: Database connection failed
Evidence Level: P4 (hypothesis without evidence)
Confidence: 70%
Outcome: Incorrect (actual root cause: missing API key)
Issue: Proposed fix before collecting P0
```

---

## Calibration Review Process

1. **Log claims** at time of declaration
2. **Update outcomes** when verified/proven wrong
3. **Review weekly** to identify patterns
4. **Adjust methodology** based on drift

### Patterns to Watch

**Overconfidence Pattern**:
```
Claims: 10
90%+ confidence: 8
Correct: 5
=> Overconfidence detected
```

**Fix**: Require more evidence before high-confidence claims.

**Premature Declaration Pattern**:
```
Claims: 10
Declared "ROOT CAUSE": 6
Before P0: 4
=> Drift detected
```

**Fix**: Enforce "no root cause before P0-P2" rule.
