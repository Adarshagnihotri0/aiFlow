# Governance Validation Tracking

**Purpose:** Track which rules have actually changed decisions vs. which are documentation.

**Last Updated:** 2026-06-22

---

## Rule Effectiveness Scorecard

| Rule | Triggered? | Decisions Changed? | Iterations | Status |
|------|-----------|-------------------|------------|--------|
| **Architecture Evidence Rule** | ✅ Yes | ✅ Yes (MessageService) | 1 | ⚠️ TESTING |
| **Rule Creation Filter** | ✅ Yes | ✅ Yes (Documentation Usage) | 1 | ⚠️ TESTING |
| **Governance ROI Rule** | ✅ Yes | ✅ Yes (measured TraceService) | 1 | ⚠️ TESTING |
| **Constitution Size Budget** | ✅ Yes | ✅ Yes (kept size stable) | 1 | ⚠️ TESTING |
| **Highest-Leverage First** | ✅ Yes | ✅ Yes (TraceService priority) | 1 | ⚠️ TESTING |
| **Problem-First Refactoring** | ✅ Yes | ✅ Yes (TraceService process) | 1 | ⚠️ TESTING |
| **Repository Reality** | ✅ Yes | ✅ Yes (audited before refactor) | 1 | ⚠️ TESTING |
| **Baseline Before Refactor** | ✅ Yes | ✅ Yes (TraceService baseline) | 1 | ⚠️ TESTING |
| **Refactor Success Criteria** | ✅ Yes | ✅ Yes (validates completeness) | 1 | ⚠️ TESTING |

**Note:** All rules are currently in TESTING status (need validation in iteration 2+).

---

## Validation Criteria

### ✅ Validated Rule

**Definition:** Changed decisions in 2+ independent architecture iterations.

**Evidence Required:**
1. Iteration 1: Created as hypothesis
2. Iteration 2: Reused in different context
3. Iteration 3+: Pattern confirmed

**Example:**
```
Architecture Evidence Rule:

Iteration 1 (TraceService):
  - Prevented MessageService mistake
  - Evidence: "Exact file" requirement caught assumption
  
Iteration 2 (Next refactor):
  - Apply same rule
  - Measure: Did it change the decision?
  
Iteration 3:
  - If yes: Promote to VALIDATED
  - If no: Demote to example
```

---

### ⚠️ Testing Rule

**Definition:** Applied in 1 iteration, awaiting validation.

**Current Status:** All rules in this category.

**Next Step:** Track usage in next refactor.

---

### 🧪 Hypothesis

**Definition:** Not yet applied to a real decision.

**Example:**
```
Documentation Usage Rule:

Status: HYPOTHESIS
Location: docs/examples/retrospectives/documentation-pruning.md
Reason: Only 1 refactor cycle observed
Action: Track usage for 2 more refactors before promoting
```

---

## Anti-Pattern: Over-Promotion

**What we're preventing:**

```
❌ Mistake → Lesson → Immediate Rule

Result:
- Constitution grows without validation
- Rules exist but don't change behavior
- Governance becomes documentation, not governance
```

**What we're doing instead:**

```
✅ Mistake → Example → Pattern → Validation → Rule

Result:
- Rules only added after proven effective
- Constitution stays lean and high-impact
- Governance changes decisions
```

---

## Rule Auditing Schedule

**Per Iteration:**
1. Track which rules were referenced
2. Document decisions changed by rules
3. Update validation status

**Monthly Review:**
1. Audit all TESTING rules
2. Promote VALIDATED if applied 2+ times
3. Demote to examples if never referenced

---

## Metrics

**Current State:**
- Validated rules: 0
- Testing rules: 9
- Hypotheses: 1 (Documentation Usage)
- Never triggered: 0

**Target:**
- Validated rules: 3-5 (after 2-3 more refactors)
- Testing rules: 2-3 (recent hypotheses)
- Hypotheses: 2-4 (new ideas under investigation)

---

**Key Insight:**

A rule that never changes behavior is **documentation**.

A rule that changes decisions is **governance**.

We track the difference.
