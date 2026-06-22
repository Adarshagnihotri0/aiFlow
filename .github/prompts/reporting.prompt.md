# Agent Reporting Standard

**Purpose:** Define how AI agents structure and report work execution.

**Scope:** All automated code changes, refactors, and implementations.

---

## Status Vocabulary

Use precise status indicators:

**COMPLETE** — Validated with evidence attached  
**IMPLEMENTED** — Code changed, verification pending  
**PARTIALLY COMPLETE** — Known issues documented  
**BLOCKED** — Cannot proceed, external input needed  
**FAILED** — Execution unsuccessful  

**NEVER** use "COMPLETE" without validation evidence.

---

## Evidence Requirements

Every claim requires proof:

### Commands Run
```bash
$ npm run typecheck
> tsc --noEmit
[success]

$ npm test
✓ 9/9 tests passing
```

### Files Changed
```
Modified: src/utils/logger.ts (+3, -1)
Created: src/types/api.ts (+85)
Deleted: src/deprecated.ts
```

### Lint Status
```bash
$ npm run lint
✖ 0 errors, 23 warnings
```

**FORBIDDEN:**
- "Tests pass" (without output)
- "Build successful" (without command)
- "Lint clean" (without count)
- "No errors" (without evidence)

---

## Verified Facts vs Confidence Assessments

### Verified Facts (Deterministic - No Confidence)
Report pass/fail results without confidence ratings:

```markdown
## Validation Evidence

**TypeScript:** PASS
```bash
$ npm run typecheck
> tsc --noEmit
[success - no output]
```

**Tests:** PASS (9/9)
```bash
$ npm test
✓ 9/9 tests passing
```

**ESLint:** 0 errors, 23 warnings
```bash
$ npm run lint
✖ 23 problems (0 errors, 23 warnings)
```

These are **verified facts**. Do NOT add confidence levels.

### Confidence Assessments (For Uncertain Claims)
Use ★★★★★ for architectural judgments:

```
## Architectural Claims

**Claim:** Module structure will scale to 100+ files
**Confidence:** ★★★☆☆ (Medium)
**Reasoning:** Based on similar patterns in codebases with 50-150 files

**Claim:** No architectural drift will occur
**Confidence:** ★★☆☆☆ (Low)
**Risk:** Without fitness functions, violations likely over time
```

**DO NOT use confidence for:**
- Test results (verified)
- Lint errors (deterministic)
- Build status (pass/fail)

**USE confidence for:**
- Scalability predictions
- Maintainability claims  
- Future risk assessments
- Pattern appropriateness

---

Use 5-star confidence for architectural claims:

★★★★★ **Very High** — Verified multiple ways  
★★★★☆ **High** — Verified one way  
★★★☆☆ **Medium** — Pattern inferred from context  
★★☆☆☆ **Low** — Assumed, not verified  
★☆☆☆☆ **Very Low** — Speculative  

**Example:**
```
Claim: API follows REST conventions
Confidence: ★★★★☆ (High)
Evidence: Checked OpenAI/Anthropic route patterns, matches /v1/messages
```

---

## Resolution Classification

Differentiate between fix methods:

**FIXED** — Code changed to satisfy rule  
**SUPPRESSED** — Rule disabled with documented justification  
**CONFIGURED** — Config changed to allow pattern  
**FALSE POSITIVE** — Rule doesn't apply to this context  

**Example:**
```
145 Issues Removed:
- 82 FIXED (code corrected)
- 59 SUPPRESSED (ESLint override with justification)
- 4 FALSE POSITIVE (separate tsconfig)

Method: 56% fixed, 41% suppressed, 3% not applicable
```

---

## Risk Assessment Format

Every change includes tradeoff analysis:

```markdown
## Change Impact

**What:** Disabled `no-unsafe-*` for server.ts  
**Why:** Express route handlers require async functions  
**Benefits:** Eliminates 117 false positive errors  
**Risks:**
- ⚠️ Future unsafe code won't be caught automatically
- ⚠️ Type safety relies on manual review

**Mitigation:** Code review + integration tests compensate  
**Tradeoff:** Acceptable for Express pattern, documented in .eslintrc.json
```

---

## Next Steps Format

Always prioritize:

```markdown
## Next Steps

### Blocking (must fix before next work)
1. Create ADR-002 module structure

### High Priority (this sprint)
1. Add GitHub Actions linting
2. Review explicit `any` usages (12 locations)

### Medium Priority (next sprint)
1. Reduce warnings from 23 → 15
2. Add pre-commit hooks
```

---

## Implementation vs Verification

Report separately:

```markdown
## Implementation Status
✅ Code changed
✅ Files created
✅ Lint passes (0 errors)

## Verification Status  
⏳ Tests pending
⏳ Integration check pending

**Overall:** IMPLEMENTED (verification needed)
```

---

## Pattern Analysis

For non-trivial changes, document alternatives:

```markdown
## Alternative Analysis

**Chosen:** Factory function pattern
**Found:** src/trace/create-trace.ts (existing pattern)

**Alternatives Considered:**

1. **Class-based builder**
   - Rejected: No stateful lifecycle needed
   - Rejected: Adds unnecessary complexity

2. **Direct object creation**
   - Rejected: Doesn't match existing pattern
   - Rejected: No validation hook

**Decision:** Mirror factory pattern for consistency
```

---

## What Could Go Wrong

Every report ends with risk assessment:

```markdown
## Potential Problems

1. **ESLint Overrides Hide Issues** (HIGH risk)
   - 117 checks disabled for server.ts
   - New unsafe code won't trigger CI failure
   - Mitigation: Manual review + tests

2. **Technical Debt Accumulation** (MEDIUM risk)
   - 23 warnings remain
   - Risk: Slow degradation over time
   - Mitigation: Add warning threshold to CI

3. **No Module Structure Defined** (HIGH risk)
   - Files placed inconsistently
   - Risk: Architectural drift
   - Mitigation: Create ADR-002 immediately
```

---

## Summary Template

Use this format for all completion reports:

```markdown
## Summary

**Task:** [Description]
**Status:** COMPLETE / IMPLEMENTED / PARTIALLY COMPLETE

### Changes Made
- [List of modifications]

### Validation
```bash
[Paste command output]
```

### Resolution Breakdown
- X FIXED
- Y SUPPRESSED  
- Z CONFIGURED

### Risks Introduced
1. [Risk 1]
2. [Risk 2]

### Next Steps
1. [Blocking]
2. [High priority]
3. [Medium priority]
```
