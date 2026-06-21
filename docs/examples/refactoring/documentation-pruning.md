# Documentation Pruning Example

## Context

Observation from Architecture Audit 2026-06-22:

```
Markdown files: 53
TypeScript source files: 14
Ratio: 3.8 : 1
```

## Problem

Documentation growth exceeded code growth without corresponding architectural improvement.

**Symptoms:**
- Multiple documents covering same concept
- Documents created but never referenced during implementation
- Governance artifacts accumulating without codebase changes
- New developers overwhelmed by documentation volume

**Root Cause:**
- No process for retiring obsolete documentation
- Treating documentation as "added value" without measuring usage
- Lack of documentation-to-code ratio tracking

## Solution

### 1. Measure Documentation Usage

Track during architectural changes:

```
TraceService refactor referenced:
  ✅ Constitution (factory function pattern)
  ✅ GOOD_FACTORY_FUNCTION example  
  ✅ Import Graph (dependency visualization)
  
Not referenced:
  ❌ Architecture Audit dashboard
  ❌ Session Summary document
  ❌ Refactor Complete checklist
```

### 2. Archive Aggressively

Archived documents that weren't referenced in 3 consecutive changes:
- Moved to `docs/archive/`
- Retained for historical reference
- Removed from active documentation set

### 3. Track Ratio

```
Before: 53 docs : 14 files (3.8:1)
Target: 21 docs : 14 files (1.5:1)
```

## Metrics

**Consolidation Results:**
- Documents reduced: 40 → 21 active
- Archive created for historical docs
- Repository structure clearer

**Key Documents Retained:**
- Constitution (copilot-instructions.md)
- Architecture Audit (ARCHITECTURE_AUDIT_2026-06-22.md)
- Examples library (docs/examples/)
- Project README

## Lesson

**Track documentation-to-code ratio.**

**Archive unused governance artifacts.**

**Unused documentation is technical debt, not an asset.**

## Hypothesis

**Claim:** Unused documentation becomes technical debt.

**Experiment:** Track document usage across 3 refactors.

**Success Criteria:**
- Same documents remain unused across multiple refactors
- Pattern repeats across different architectural changes
- Evidence of governance accumulation

**Then:** Consider promotion to constitutional rule.

---

## Tracking Template

```
Refactor: [TraceService extraction]

Referenced:
  ✅ Constitution (factory function pattern)
  ✅ GOOD_FACTORY_FUNCTION example
  ✅ Import Graph (dependency baseline)

Not referenced:
  ❌ Architecture Audit dashboard
  ❌ Session Summary
  ❌ Refactor Complete checklist

Next: Track same documents in next refactor
```

---

## Constitutional Impact

This is a **hypothesis in progress**, not a constitutional rule, because:

1. **Insufficient data** - Only one refactor cycle observed
2. **Repository-specific** - Different projects have different documentation scales
3. **Needs validation** - Pattern must repeat across repos before becoming a rule

**Status:** Track for 2 more refactors before promoting to constitution.

---

## Application

When adding documentation:
1. Ask: "Will this be referenced during implementation?"
2. If unsure: Create as example, not governance
3. Track actual usage across 3 architectural changes
4. Promote to rule only after validated across repositories
