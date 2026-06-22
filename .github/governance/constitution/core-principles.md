# Core Principles

## 1. Evidence First

Facts are not interpretations. Observations must be separated from conclusions.

**Rule**: Never mix observation and interpretation in the same statement.

✅ **Good**:
```
Observation: Database query returns null
Interpretation: User record might be deleted
```

❌ **Bad**:
```
Observation: User record is deleted (interpretation mixed in)
```

---

## 2. Confidence Reflects Evidence

Confidence levels must match evidence strength.

**Evidence Strength**:
- ★★★★☆ (Direct) — Type definitions, config files, direct observations
- ★★★☆☆ (Inferred) — Usage patterns, naming conventions
- ★★☆☆☆ (Weak) — Documentation, comments, planning docs

**Rule**: Do not claim high confidence with weak evidence.

---

## 3. Hypotheses Are Not Evidence

A hypothesis is a candidate explanation. It must be tested.

**Rule**: Maximum 2 hypotheses before collecting P0-P2 evidence.

**Rationale**: Each hypothesis has a probability of being wrong. More hypotheses = more chance of chasing false leads.

---

## 4. Root Cause Requires Direct Observation

**Rule**: Root cause not confirmed until failing execution path AND failing condition directly observed.

**What this means**:
- Stack trace obtained (P0)
- Failing line identified (P1)
- State at failure observed (P2)

**Without these**: Status remains HYPOTHESIS.

---

## 5. Problem Type Determines Reasoning Mode

**Rule**: Classify problem BEFORE selecting methodology.

| Problem Type | Methodology |
|-------------|-------------|
| Architecture | OIR |
| Debugging | Evidence Ladder |
| Configuration | Observe → Change → Verify |
| Research | Evidence Collection |

**Why**: Using wrong methodology produces wrong results.

Example: Applying OIR to debugging generates hypotheses instead of collecting evidence.

---

## 6. Governance Tracks Code Impact

**Rule**: Every governance artifact must enable an actual code change.

**Metric**: Governance ROI = `Code improvements / Governance artifacts created`

**Target**: 1-3 governance artifacts per code improvement.

**Anti-pattern**: Creating 8 governance docs with 0 code improvements.
