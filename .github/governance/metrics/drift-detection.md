# Drift Detection

## What is Drift?

Drift = Using wrong reasoning mode for the problem type.

---

## Drift Types

### 1. Architecture Drift

**Symptom**: Applying OIR to debugging problems

**Example**:
```
Problem: 500 error (Debugging)
Approach: Generate 5 hypotheses, rank them, propose fixes
Issue: Should use Evidence Ladder instead
```

**Detection**:
- Multiple hypotheses generated without P0-P2
- "Trade-offs" discussed for failure investigation
- Architecture reasoning applied to runtime failure

**Correction**: Switch to Evidence Ladder immediately

---

### 2. Debugging Drift

**Symptom**: Applying Evidence Ladder to architecture problems

**Example**:
```
Problem: "Should we extract a service?" (Architecture)
Approach: Get stack trace, find failing line
Issue: Should use OIR instead
```

**Detection**:
- Looking for "root cause" in design decisions
- Treating trade-off as single correct answer
- Trying to "fix" rather than "design"

**Correction**: Switch to OIR framework

---

### 3. Over-Analysis Drift

**Symptom**: Applying full OIR to C0 (trivial) problems

**Example**:
```
Problem: TypeScript deprecation warning (Config)
Approach: 5-line analysis, alternatives considered
Issue: Should use Observe → Change → Verify
```

**Detection**:
- More than 3 minutes on config change
- Alternative analysis for flag changes
- Decision Cost Filter not applied

**Correction**: Apply Decision Cost Filter, use C0 process

---

### 4. Guessing Drift

**Symptom**: Hypotheses before evidence

**Example**:
```
Problem: 500 error
Approach: 5 hypotheses, rank by probability
Issue: Should get P0 (stack trace) first
```

**Detection**:
- >2 hypotheses before P0 obtained
- "ROOT CAUSE" declared without P0-P2
- Recommendation before evidence

**Correction**: Stop, get evidence first

---

## Drift Detection Checklist

### At Problem Start

- [ ] Problem type classified (Arch/Debug/Config/Research)
- [ ] Decision cost estimated (C0-C4)
- [ ] Methodology selected (OIR/Evidence Ladder/O→C→V)

### During Investigation

- [ ] Architecture problem → Using OIR template?
- [ ] Debugging problem → Following Evidence Ladder?
- [ ] Config problem → Observe → Change → Verify?
- [ ] <2 hypotheses before P0-P2?

### At Conclusion

- [ ] ROOT CAUSE declared only with P0-P2 evidence?
- [ ] Confidence matches evidence level?
- [ ] Calibration entry created?

---

## Drift Indicators

### Red Flags

```
⚠️  "Let me consider the alternatives..."
    → For a 500 error? Wrong track.

⚠️  "Root cause found!"
    → Before stack trace? Premature.

⚠️  "What's the trade-off?"
    → For config change? Over-analysis.

⚠️  "Let me hypothesize why..."
    → Without stack trace? Drift.
```

### Green Flags

```
✅ "Get stack trace first" → Debugging track
✅ "Use OIR template" → Architecture track
✅ "Just change the flag" → Config track
✅ "Collect evidence" → Research track
```

---

## Automatic Drift Detection

### Template Usage Check

```
If debugging AND NOT using debugging-report.md:
  → Alert: Using wrong methodology

If architecture AND NOT using oir.md:
  → Alert: Using wrong methodology

If config AND using OIR template:
  → Alert: Over-analysis detected
```

### Hypothesis Counter

```
If hypotheses > 2 AND P0 not obtained:
  → Alert: Premature hypothesis generation
```

### Root Cause Guard

```
If "ROOT CAUSE" appears in text AND P0 not obtained:
  → Alert: Premature declaration
```

---

## Drift Recovery

### When Drift Detected

1. **Stop immediately**
2. **Classify problem type**
3. **Select correct methodology**
4. **Restart investigation**
5. **Document drift in calibration ledger**

### Example Recovery

```
Problem: 500 error

❌ Drift Path:
"Let me theorize 5 reasons why this could fail..."
[3 hypotheses later]
"Root cause: Probably database connection"
[Fix: Check database config]

✅ Recovery:
"Drift detected. Switching to Evidence Ladder."
P0: Get stack trace
→ TypeError at jwt.strategy.ts:45
P1: Line 45
P2: State = session token in JWT parser
Root cause: JWT parser on session token
Fix: Skip JWT validation for @Public routes
```

---

## Drift Metrics

### Drift Rate

```
Drift Rate = Investigations with drift / Total investigations
```

**Target**: <10%

**Example**:
```
Week 1: 20 investigations, 5 drift = 25%
Week 2: 22 investigations, 3 drift = 14%
Week 3: 25 investigations, 2 drift = 8%
→ Trend: Improving
```

### Drift by Type

```
Architecture Drift: 40% (applying OIR to debugging)
Over-Analysis Drift: 30% (applying OIR to config)
Guessing Drift: 20% (hypotheses before evidence)
Debugging Drift: 10% (applying Evidence Ladder to architecture)
```

---

## Prevention Strategies

### 1. Problem Classification First

Always classify BEFORE analyzing:

```
Problem: [description]
Type: [Arch/Debug/Config/Research]
Methodology: [OIR/Evidence Ladder/O→C→V]
Decision Cost: [C0-C4]

[Then proceed]
```

### 2. Template Enforcement

Use templates as guardrails:

- Debugging → Must use `debugging-report.md`
- Architecture → Must use `oir.md`
- Config → Must use minimal process

### 3. Auto-Checks

Add checks in workflow:

```markdown
## Evidence Check (Debugging Only)

- [ ] P0 obtained?
- [ ] <2 hypotheses?
- [ ] ROOT CAUSE only after P0-P2?
```

### 4. Calibration Feedback

Track drift in calibration ledger:

```markdown
Drift Detected: [Type]
Problem: [What was being investigated]
Correction: [What should have been done]
Lesson: [What was learned]
```
