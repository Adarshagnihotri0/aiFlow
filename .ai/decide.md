# Decide: Model Identity Fix Plan

**Date**: 2026-06-20
**Based on**: .ai/explain.md

---

## Problem

Model identity is inconsistent across the API:
- `/v1/models` returns `amazon-nova-pro`
- OpenAI responses return `amazon-nova-micro`
- Runtime actually uses `zai.glm-5`

This violates the API contract and misleads clients.

---

## Alternatives

### Option A: Use STATIC_MODEL_ID everywhere

```
Action:
  Replace all hardcoded model strings with STATIC_MODEL_ID

Changes:
  1. AVAILABLE_MODELS[0].id = STATIC_MODEL_ID
  2. OpenAI response model = STATIC_MODEL_ID
  3. OpenAI streaming model = STATIC_MODEL_ID

Pros:
  ✓ Single source of truth
  ✓ Automatically stays in sync
  ✓ Minimal code changes

Cons:
  ✗ Must import STATIC_MODEL_ID (minor dependency)

Risk: LOW
  - Cosmetic changes
  - No logic modifications
```

### Option B: Create MODEL_ID constant

```
Action:
  Create new MODEL_ID = 'zai.glm-5'
  Use it in AVAILABLE_MODELS
  Keep STATIC_MODEL_ID for Bedrock

Pros:
  ✓ Separation of concerns (API vs Bedrock)

Cons:
  ✗ Two constants for same value
  ✗ Risk of drift
  ✗ More complex

Risk: MEDIUM
  - Additional constant to maintain
```

### Option C: Keep hardcoded, update values

```
Action:
  Change hardcoded values to 'zai.glm-5'

Pros:
  ✓ No imports needed

Cons:
  ✗ Three places to update if model changes
  ✗ Violates DRY
  ✗ Risk of future drift

Risk: HIGH
  - Guaranteed drift over time
```

---

## Decision

**Chosen: Option A**

**Reason:**
- Eliminates duplication
- Single source of truth
- Prevents future drift
- Aligns with existing code patterns (STATIC_MODEL_ID already imported elsewhere)

---

## Execution Plan

### Task 1: Fix AVAILABLE_MODELS
```
File: src/adapters.ts
Lines: 120-125

Change:
  FROM: id: 'amazon-nova-pro'
  TO:   id: STATIC_MODEL_ID

Reason:
  Reflect actual running model

Risk: LOW
```

### Task 2: Fix OpenAI Non-Streaming Response
```
File: src/adapters.ts
Line: 252

Change:
  FROM: model: 'amazon-nova-micro'
  TO:   model: STATIC_MODEL_ID

Reason:
  Match Anthropic behavior, reflect reality

Risk: LOW
```

### Task 3: Fix OpenAI Streaming Response
```
File: src/bedrock.ts
Line: 183

Change:
  FROM: model: 'amazon-nova-micro'
  TO:   model: STATIC_MODEL_ID

Reason:
  Consistent with non-streaming

Risk: LOW
```

### Task 4: Rename Token Constants
```
File: src/adapters.ts
Lines: 59, 186

Change:
  FROM: NOVA_LITE_MAX_TOKENS → ANTHROPIC_MAX_TOKENS
        NOVA_LITE_MAX_TOKENS → OPENAI_MAX_TOKENS

Reason:
  Clarify intent, remove confusion
  Keep values different (intentional)

Risk: LOW
```

### Task 5: Unify Region Default
```
File: src/bedrock.ts
Line: 12

Change:
  FROM: 'us-east-1'
  TO:   'ap-south-1'

Reason:
  Consistent with .env and adapters.ts

Risk: NONE (overridden by .env)
```

### Task 6: Remove Debug Logs
```
File: src/server.ts
Lines: 27, 30

Action:
  DELETE both console.log statements

Reason:
  Noisy, no purpose

Risk: NONE
```

### Task 7: Gate Verbose Logging
```
File: src/bedrock.ts
Line: 160

Change:
  FROM: console.log('Converse response:', JSON.stringify(response))
  TO:   if (process.env.DEBUG) console.log('Converse response:', JSON.stringify(response))

Reason:
  Prevent production log noise, preserve debugging capability

Risk: LOW
```

---

## Validation Plan

### Build Validation
```
Command: npm run build

Expected: ✓ TypeScript compilation succeeds
```

### API Validation
```
1. Health Check
   curl http://localhost:3000/health
   Expected: {"status":"ok"}

2. Model List
   curl http://localhost:3000/v1/models
   Expected: {"id":"zai.glm-5",...}
   
3. Anthropic Non-Streaming
   curl -X POST http://localhost:3000/v1/messages \
     -H "Content-Type: application/json" \
     -d '{"model":"zai.glm-5","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
   Expected: response.model === "zai.glm-5"

4. OpenAI Non-Streaming
   curl -X POST http://localhost:3000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"zai.glm-5","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
   Expected: response.model === "zai.glm-5"

5. OpenAI Streaming
   curl -X POST http://localhost:3000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"zai.glm-5","max_tokens":10,"messages":[{"role":"user","content":"hi"}],"stream":true}'
   Expected: chunks contain model === "zai.glm-5"
```

---

## Rollback Plan

If issues arise:

```
git diff  # Review changes
git checkout -- src/adapters.ts src/bedrock.ts src/server.ts  # Restore originals
npm run build  # Verify clean build
```

---

## Expected Behavior Changes

```
Before:
  /v1/models → amazon-nova-pro
  OpenAI responses → amazon-nova-micro
  
After:
  /v1/models → zai.glm-5
  OpenAI responses → zai.glm-5
  
Impact:
  Clients relying on hardcoded model names will see different values
  This is an IMPROVEMENT (reflects reality), not a regression
```

---

## What We're NOT Changing

```
✗ STATIC_MODEL_ID value (remains 'zai.glm-5')
✗ Token limit VALUES (only renaming constants)
✗ profilePrefix (kept as-is)
✗ Documentation examples (not runtime code)
✗ Region in .env (already correct)
```

---

## Risk Assessment

```
Overall Risk: LOW

Reasoning:
  - All changes are cosmetic (no logic changes)
  - No API contract violations (fixing them)
  - No test coverage (manual validation required)
  - Easy rollback (git checkout)
```

---

## Files Modified

```
src/adapters.ts  → 4 changes
src/bedrock.ts   → 2 changes
src/server.ts    → 2 changes (deletions)
```

---

## Execution Order

```
1. Build → Verify clean state
2. Apply changes → All 7 tasks
3. Build → Verify TypeScript
4. Validate → Manual API tests
5. Decision Record → Document for future
```

---

## Decision Record Reference

After execution, will create:
```
.ai/decision-records/DR-001.md
```

This will document:
- What was changed
- Why it was changed
- What alternatives were rejected
- What evidence supported the decision
