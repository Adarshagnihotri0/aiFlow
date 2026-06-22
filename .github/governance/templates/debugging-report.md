# Debugging Report

## Problem Statement
[What is broken?]

## Initial State
```
Observation: [What happened]
Status: Root cause UNKNOWN
Missing Evidence: [P0/P1/P2 as needed]
```

## Evidence Collected

### P0: Stack Trace
```
[Stack trace or "Not obtained"]
```

### P1: Failing Line
```
[File:line number or "Not identified"]
```

### P2: Variable State
```
[State at failure or "Not observed"]
```

### P3: Call Path
```
[How we got here or "Not traced"]
```

## Hypotheses

**Maximum 2 hypotheses allowed before P0-P2**

1. [Hypothesis 1]
   - Evidence for:
   - Evidence against:
   
2. [Hypothesis 2]
   - Evidence for:
   - Evidence against:

## Root Cause

**Status**: [UNKNOWN / HYPOTHESIS / CONFIRMED]

```
Root Cause: [If confident]
Evidence: [P0-P2 evidence that proves it]
```

If STATUS = UNKNOWN or HYPOTHESIS:
```
Stop. Do not propose fixes.
Get more evidence first.
```

## Fix

**Only after STATUS = CONFIRMED**

```
Fix: [What to change]
Minimal: [Smallest possible change]
Verification: [How to verify it works]
```

## Outcome

- [ ] Fix applied
- [ ] Tests pass
- [ ] No new errors introduced

---

## Calibration Entry

```
Claim: [Root cause statement]
Evidence Level: [P0-P4]
Confidence: [0-100%]
Outcome: [Pending/Correct/Incorrect]
```
