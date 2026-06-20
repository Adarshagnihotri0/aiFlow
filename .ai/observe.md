# Observe: Model Identity Consistency

**Date**: 2026-06-20
**Story**: Fix model identity and configuration consistency in Bedrock Proxy

---

## Architecture

### System Type
```
Single-model gateway (not a router)

Client → Proxy → [STATIC_MODEL_ID] → Bedrock
```

### Core Components
```
src/
  adapters.ts     → Request/response transformation
  bedrock.ts      → AWS Bedrock client
  server.ts       → Express endpoints
  index.ts        → Entry point
```

---

## Symbol Graph

### STATIC_MODEL_ID
```
Definition:
  src/adapters.ts:12 → 'zai.glm-5'

Used in:
  ✓ Anthropic adapter (modelId: line 80)
  ✓ Anthropic response (model: line 112)
  ✓ OpenAI adapter (modelId: line 211)
  ✓ OpenAI response (model: line 252 - CORRECT)
  ✓ Streaming adapter (modelId: line 211)
  ✓ Streaming response (model: src/bedrock.ts:62)
  ✓ /v1/models endpoint (indirect via AVAILABLE_MODELS)
  ✓ Logging (server.ts:24, 49, 70)
```

### AVAILABLE_MODELS
```
Definition:
  src/adapters.ts:120-125

Value:
  id: 'amazon-nova-pro' (HARDCODED)

Used in:
  ✓ GET /v1/models (server.ts:15)
```

### Token Limit Constants
```
NOVA_LITE_MAX_TOKENS (Anthropic):
  src/adapters.ts:59 → 1640000
  Used in: lines 61, 62

NOVA_LITE_MAX_TOKENS (OpenAI):
  src/adapters.ts:186 → 5000
  Used in: lines 188, 189
```

### profilePrefix
```
Definition:
  src/adapters.ts:5-9

Value:
  Computed from AWS_REGION
  'eu' | 'apac' | 'us'

References:
  ✓ Line 11 (commented: //export const STATIC_MODEL_ID = ...)
  ✗ No runtime usage
```

### Region Defaults
```
adapters.ts:4  → 'ap-south-1'
bedrock.ts:12  → 'us-east-1'
.env           → 'ap-south-1'
```

---

## Runtime Flow

### Request Path (Anthropic)
```
POST /v1/messages
  → toConverseInput(body)
    → modelId: STATIC_MODEL_ID (line 80)
  → BedrockRuntimeClient.send(ConverseCommand)
  → fromConverseResponse(response)
    → model: STATIC_MODEL_ID (line 112)
```

### Request Path (OpenAI)
```
POST /v1/chat/completions
  → openaiToConverseInput(body)
    → modelId: STATIC_MODEL_ID (line 211)
  → BedrockRuntimeClient.send(ConverseCommand)
  → fromConverseResponseOpenAI(response)
    → model: 'amazon-nova-micro' (line 252) ← BUG
```

### Request Path (Streaming)
```
POST /v1/messages (stream=true)
  → invokeModelStream(body, res)
    → model: STATIC_MODEL_ID (line 62)
    
POST /v1/chat/completions (stream=true)
  → invokeModelStreamOpenAI(body, res)
    → model: 'amazon-nova-micro' (bedrock.ts:183) ← BUG
```

---

## Hardcoded Model References

### Runtime Code
```
src/adapters.ts:122   → 'amazon-nova-pro' (AVAILABLE_MODELS)
src/adapters.ts:252   → 'amazon-nova-micro' (OpenAI response)
src/bedrock.ts:183    → 'amazon-nova-micro' (OpenAI streaming)
```

### Documentation
```
docs/QUICK_REFERENCE.md:228   → 'amazon-nova-micro' (example)
docs/TECHNICAL_DETAILS.md:368 → 'amazon-nova-pro' (example)
```

**Classification**: Documentation is examples (non-runtime), keep unchanged.

---

## Unknowns

### U1: Token Limit Intent
```
Question: Why do Anthropic/OpenAI adapters have different token limits?

Evidence:
  - Anthropic: 1640000
  - OpenAI: 5000
  - No comments explaining the difference

Status: Unverified
Required: Check git history or ask owner
```

### U2: profilePrefix Purpose
```
Question: Is profilePrefix dead code or intentionally reserved?

Evidence:
  - Computed but never used in runtime
  - Referenced in commented configuration
  - Pattern suggests Bedrock regional inference profiles

Interpretation: Reserved for future regional routing
Confidence: Low
Status: Unverified
Required: Confirm with architecture owner
```

---

## Invariants

### I1: Single-Model Gateway
```
Invariant:
  Every request routes through STATIC_MODEL_ID

Evidence:
  - No model parameter read from requests
  - No conditional routing logic
  - All adapters use STATIC_MODEL_ID

Confidence: High
```

### I2: Gateway Protocol
```
Invariant:
  Gateway speaks Anthropic and OpenAI protocols

Evidence:
  - /v1/messages endpoint (Anthropic)
  - /v1/chat/completions endpoint (OpenAI)
  - Separate adapters for each

Confidence: High
```

---

## Files Structure

### Files to Modify
```
src/adapters.ts    → Model identity in responses
src/bedrock.ts     → Debug logging, streaming model
src/server.ts      → Remove noisy debug logs
```

### Files to Leave Unchanged
```
docs/**/*.md       → Examples, not runtime code
package.json       → No dependency changes
.env               → Runtime config (out of scope)
tsconfig.json      → Build config (no changes needed)
```
