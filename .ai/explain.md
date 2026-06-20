# Explain: Model Identity Analysis

**Date**: 2026-06-20
**Based on**: .ai/observe.md

---

## Findings

### F1: Model Identity Inconsistency (BUG)
```
Type: Runtime Bug
Confidence: High

Observation:
  AVAILABLE_MODELS returns 'amazon-nova-pro'
  Runtime uses 'zai.glm-5'

Evidence:
  src/adapters.ts:122 → AVAILABLE_MODELS hardcoded to 'amazon-nova-pro'
  src/adapters.ts:12  → STATIC_MODEL_ID = 'zai.glm-5'
  
Inference:
  AVAILABLE_MODELS should reflect the actual running model
  
Impact:
  Users querying /v1/models see incorrect information
  
Severity: Medium (misleading but not breaking)
```

---

### F2: OpenAI Response Model Incorrect (BUG)
```
Type: Runtime Bug
Confidence: High

Observation:
  OpenAI responses return 'amazon-nova-micro'
  Actual model is 'zai.glm-5'

Evidence:
  src/adapters.ts:252 → model: 'amazon-nova-micro'
  src/bedrock.ts:183  → model: 'amazon-nova-micro'

Inference:
  These should use STATIC_MODEL_ID instead
  
Impact:
  API clients receive incorrect model identity
  
Severity: High (violates API contract)
```

---

### F3: Token Constants Differ Intentionally (DESIGN)
```
Type: Intentional Design
Confidence: Medium

Observation:
  NOVA_LITE_MAX_TOKENS = 1640000 (Anthropic)
  NOVA_LITE_MAX_TOKENS = 5000 (OpenAI)

Evidence:
  Different values in different contexts
  Same variable name (confusing)

Inference Strength: Medium
  - May represent different API constraints
  
Evidence Strength: Low
  - No comments explaining the difference
  
Resolution:
  Rename for clarity (ANTHROPIC_MAX_TOKENS, OPENAI_MAX_TOKENS)
  Do NOT unify values
  
Risk: Low (cosmetic rename only)
```

---

### F4: profilePrefix Unused (RESERVED)
```
Type: Reserved Infrastructure
Confidence: Low

Observation:
  profilePrefix computed from AWS_REGION
  Zero runtime references
  Referenced in commented configuration

Evidence:
  src/adapters.ts:5-9 → Defined
  src/adapters.ts:11  → Referenced in comment

Inference Strength: Medium
  - Pattern matches Bedrock regional inference profiles
  - Comment suggests deepseek configuration
  
Evidence Strength: Low
  - No runtime usage
  
Resolution:
  Keep unchanged
  Add clarifying comment about future purpose
  
Risk: None (no changes)
```

---

### F5: Region Defaults Inconsistent (CONFIG)
```
Type: Configuration Drift
Confidence: High

Observation:
  adapters.ts defaults to 'ap-south-1'
  bedrock.ts defaults to 'us-east-1'
  .env sets 'ap-south-1'

Evidence:
  src/adapters.ts:4  → process.env.AWS_REGION ?? 'ap-south-1'
  src/bedrock.ts:12  → process.env.AWS_REGION ?? 'us-east-1'
  .env:7             → AWS_REGION=ap-south-1

Inference:
  Defaults should align with .env
  
Interference Strength: High
  - .env makes this academic (runtime uses .env)
  
Evidence Strength: High
  - Direct code observation
  
Impact:
  Confusing if .env missing
  
Severity: Low (cosmetic, .env overrides)
```

---

### F6: Debug Logging Noisy (CLEANUP)
```
Type: Code Quality
Confidence: High

Observation:
  Several debug logs in production code

Evidence:
  src/server.ts:27   → "streaming response...1"
  src/server.ts:30   → "streaming response...2"
  src/bedrock.ts:160 → console.log('Converse response:', JSON.stringify(response))

Inference:
  These are development artifacts
  
Evidence Strength: High
  - Logs without context
  
Impact:
  Noisy production logs, potential sensitive data exposure
  
Severity: Medium (security/cleanup)
```

---

## Impact Analysis

### Changing STATIC_MODEL_ID
```
Affects:
  ✓ src/adapters.ts (lines 80, 112, 211)
  ✓ src/bedrock.ts (line 62)
  ✓ src/server.ts (lines 24, 49, 70)
  ✓ Available models endpoint
  ✓ All logging

Risk: HIGH
  - Central dependency
  - Would require updating model availability checks
```

### Fixing AVAILABLE_MODELS
```
Affects:
  ✓ GET /v1/models response

Risk: LOW
  - Single location
  - Informational endpoint only
```

### Fixing OpenAI Response Model
```
Affects:
  ✓ src/adapters.ts:252 (non-streaming)
  ✓ src/bedrock.ts:183 (streaming)

Risk: LOW
  - Two locations
  - Response field only
```

### Renaming Token Constants
```
Affects:
  ✓ src/adapters.ts:59, 61, 62
  ✓ src/adapters.ts:186, 188, 189

Risk: LOW
  - Internal rename only
  - No API changes
```

### Unifying Region Defaults
```
Affects:
  ✓ src/bedrock.ts:12

Risk: LOW
  - Fallback only (overridden by .env)
```

### Removing Debug Logs
```
Affects:
  ✓ src/server.ts:27, 30
  ✓ src/bedrock.ts:160

Risk: NONE
  - Pure deletion
```

---

## Risks

### R1: No Test Coverage
```
Risk: Changes cannot be automatically validated

Mitigation:
  Manual API testing before/after
  Build verification (npm run build)
```

### R2: OpenAI Client Expectations
```
Risk: Clients may be parsing model field

Mitigation:
  Documented in decision record
  Model field now reflects reality (improvement, not regression)
```

### R3: Stream Behavior Unchanged
```
Risk: Streaming responses still use hardcoded model in chunks

Evidence:
  src/bedrock.ts:183 → 'amazon-nova-micro' in streaming chunks
  
Mitigation:
  Fix included in execution plan
```

---

## Blocking Issues

```
None identified
```

---

## Recommended Actions

### High Priority (Correctness)
```
A1: Fix AVAILABLE_MODELS to use STATIC_MODEL_ID
A2: Fix OpenAI response model field to use STATIC_MODEL_ID
A3: Fix OpenAI streaming model field to use STATIC_MODEL_ID
```

### Medium Priority (Clarity)
```
A4: Rename token constants for clarity (ANTHROPIC_MAX_TOKENS, OPENAI_MAX_TOKENS)
A5: Unify region defaults to 'ap-south-1'
```

### Low Priority (Cleanup)
```
A6: Remove debug logs in server.ts
A7: Gate verbose response logging with DEBUG env var
A8: Add clarifying comment for profilePrefix
```

---

## Confidence Summary

```
F1 (Model identity bug)         → Evidence: High, Inference: High  → HIGH
F2 (OpenAI response bug)        → Evidence: High, Inference: High  → HIGH
F3 (Token constants design)     → Evidence: Low,  Inference: Med   → MEDIUM
F4 (profilePrefix reserved)     → Evidence: Low,  Inference: Med   → LOW
F5 (Region defaults)            → Evidence: High, Inference: High  → HIGH
F6 (Debug logging)              → Evidence: High, Inference: High  → HIGH
```
