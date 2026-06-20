# Example Decision Record

# DR-001: Derive Model Field from STATIC_MODEL_ID

## Status
**IMPLEMENTED**

## Problem
Multiple locations in the codebase reference model identity, but these references can drift from the actual model ID defined in `STATIC_MODEL_ID`.

## Context
- `STATIC_MODEL_ID` is defined in `src/adapters.ts`
- Response formatting needs model field in multiple places
- Logs and responses should reflect the actual model in use
- Current hardcoding creates maintenance burden

## Alternatives Considered

### Option A: Keep separate model references
**Description:** Each endpoint defines its own model field
**Pros:** 
- Easier to test isolated endpoints
- No cross-file dependencies
**Cons:** 
- Requires manual sync when model changes
- Risk of drift between references
- Higher maintenance overhead
**Evidence:** None (status quo)
**Rejected:** Creates drift risk

### Option B: Derive from STATIC_MODEL_ID (CHOSEN)
**Description:** All model field references derive from `STATIC_MODEL_ID`
**Pros:** 
- Single source of truth
- Automatic consistency
- Lower maintenance
**Cons:** 
- Requires updating 3+ files
- Slightly more complex initially
**Evidence:** 
- EL-001: Runtime observation shows STATIC_MODEL_ID is authoritative
- EL-002: AST analysis confirms single definition point

## Decision
Derive all model field references from `STATIC_MODEL_ID` constant.

## Reasoning
Evidence shows `STATIC_MODEL_ID` is the single source of truth for model identity. Deriving references from it eliminates duplication and prevents drift. The initial refactoring cost is paid once; the benefit compounds over time.

## Evidence Ledger
```
EL-001: src/adapters.ts:7 - STATIC_MODEL_ID = 'zai.glm-5'
Strength: ★★★★☆ (AST reference)

EL-002: src/server.ts:42 - Response formatting uses model field
Strength: ★★★☆☆ (Grep search)

EL-003: src/bedrock.ts:28 - Streaming response needs model field
Strength: ★★★☆☆ (Grep search)

EL-004: Runtime test confirms all endpoints return 'zai.glm-5'
Strength: ★★★★★ (Runtime trace)
```

## Consequences

### Positive
- Single source of truth for model identity
- Automatic consistency across endpoints
- Easier future model changes
- Reduced maintenance burden

### Negative
- Requires updating 3+ files in initial refactor
- Slightly more complex import structure

### Risks
- **Risk:** Changing STATIC_MODEL_ID affects multiple endpoints
- **Mitigation:** Document impact scope; tests catch regressions
- **Level:** MEDIUM

## Validation
- [x] Tests: `npm test` passes (all 12 tests)
- [x] Build: `npm run build` succeeds
- [x] Manual: Verified `/v1/messages` returns correct model
- [x] Manual: Verified `/v1/chat/completions` returns correct model
- [x] Performance: No noticeable regression
- [x] Runtime: Live server confirms correct model field

## Implementation Date
2026-06-20

## Validated By
- Test suite: All unit tests passing
- Manual: Checked responses via curl
- Runtime: Proxy server running, logs show correct model

## Notes
This decision follows the principle: "Single source of truth eliminates drift."

## See Also
- Related decision: Could extend to log format
- Source: This refactor done during PRP workflow setup
