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

## Constitutional Impact

This example informed the **Documentation Usage Rule** without requiring a new constitutional amendment.

The rule: "If a document is not referenced during three consecutive architectural changes, review it for archival."

This is an **example**, not a constitutional rule, because:
- Repository-specific (different projects have different scales)
- Self-documenting (the ratio speaks for itself)
- Best taught through demonstration

## Application

When adding documentation:
1. Ask: "Will this be referenced during implementation?"
2. If unsure: Create as example, not governance
3. Track actual usage over 3 changes
4. Archive if not referenced
