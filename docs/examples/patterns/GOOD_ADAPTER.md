# ✅ GOOD: Adapter Pattern

## Real Example from Codebase

**File:** `src/adapters.ts`  
**Audit Status:** ✅ PASS — Proper layer boundary

### The Pattern

```typescript
// ✅ GOOD: Pure format conversion, no side effects
// File: src/adapters.ts

import type { Record<string, unknown> } from 'typescript';

/**
 * Convert Anthropic request body to Bedrock ConverseCommand input
 * Single responsibility: Format transformation
 */
export function toConverseInput(body: Record<string, unknown>): Record<string, unknown> {
  const messages = ((body['messages'] ?? []) as Record<string, unknown>[])
    .map((m) => ({
      role: m['role'] === 'assistant' ? 'assistant' : 'user',
      content: toConverseContent(m['content'])
    }));

  return {
    modelId: STATIC_MODEL_ID,
    messages,
    system: body['system'] ? [{ text: body['system'] }] : undefined,
    inferenceConfig: {
      maxTokens: body['max_tokens'] ?? 4096,
      temperature: body['temperature'] ?? 0.7,
    }
  };
}

/**
 * Convert Bedrock response to Anthropic format
 * Bidirectional adapter
 */
export function fromConverseResponse(response: Record<string, unknown>): Record<string, unknown> {
  const output = response['output'] as Record<string, unknown>;
  const message = output?.['message'] as Record<string, unknown>;
  
  return {
    id: `msg_${generateId()}`,
    type: 'message',
    role: 'assistant',
    content: message['content'],
    model: STATIC_MODEL_ID,
    stop_reason: mapStopReason(message['stop_reason']),
    usage: {
      input_tokens: response['usage']?.['inputTokens'],
      output_tokens: response['usage']?.['outputTokens']
    }
  };
}
```

## Why This Is GOOD

### 1. Pure Transformation
- Input → Output transformation only
- No database calls
- No HTTP requests
- No state mutation

### 2. Bidirectional

```typescript
toConverseInput()      // Anthropic → Bedrock
fromConverseResponse() // Bedrock → Anthropic
```

Both directions handled. Symmetric API.

### 3. Boundary Isolation

**What it imports:**
- ✅ `types/` (domain types only)
- ✅ Helper functions (pure)

**What it does NOT import:**
- ❌ server.ts (transport)
- ❌ bedrock.ts (external API)
- ❌ db/ (repositories)

### 4. Testable in Isolation

```typescript
// ✅ GOOD: No mocking needed
describe('toConverseInput', () => {
  it('converts Anthropic format to Bedrock', () => {
    const anthropic = {
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024
    };
    
    const bedrock = toConverseInput(anthropic);
    
    expect(bedrock.modelId).toBeDefined();
    expect(bedrock.messages).toHaveLength(1);
    expect(bedrock.inferenceConfig.maxTokens).toBe(1024);
  });
});
```

**Test characteristics:**
- ✅ No HTTP mocks
- ✅ No database mocks
- ✅ Pure function testing
- ✅ Fast execution

### 5. Single Source of Truth

```typescript
export const STATIC_MODEL_ID = 'zai.glm-5';
```

Model ID defined once, used everywhere.

## Layer Position in ADR-002

```
Transport (server.ts)
    ↓ calls
Adapters (adapters.ts)  ← This example
    ↓ transforms for
External Service (bedrock.ts)
    ↓ calls
Amazon Bedrock API
```

**Adapter rules (followed):**
- ✅ Format conversion only
- ✅ No business logic
- ✅ No orchestration
- ✅ Returns domain types

## What Problem It Solves

### Without Adapter (Coupling)

```typescript
// ❌ BAD: Transport coupled to external API
app.post('/v1/messages', async (req, res) => {
  const bedrockRequest = {
    modelId: 'zai.glm-5',  // ❌ Hardcoded in transport
    messages: req.body.messages.map(m => ({
      role: m.role,  // ❌ Format knowledge in transport
      content: [{ text: m.content }]
    }))
  };
  
  await bedrockClient.send(new ConverseCommand(bedrockRequest));
});
```

**Problems:**
- Transport knows Bedrock format
- Changes in Bedrock → changes in transport
- Can't test without mocking AWS SDK
- Hard to swap providers

### With Adapter (Decoupled)

```typescript
// ✅ GOOD: Transport agnostic of external format
app.post('/v1/messages', async (req, res) => {
  const bedrockRequest = toConverseInput(req.body);  // Adapter
  await bedrock.invoke(bedrockRequest);
});
```

**Benefits:**
- Transport doesn't know Bedrock format
- Adapter isolates format knowledge
- Easy to test (mock adapter)
- Easy to swap providers (new adapter)

## When to Use Adapter Pattern

**Use adapters when:**
- Integrating third-party APIs
- Converting between formats (XML ↔ JSON)
- Protocol translation (REST ↔ GraphQL)
- Wrapping legacy systems

**Adapter characteristics:**
- ✅ Pure functions (no state)
- ✅ Bidirectional transformation
- ✅ Zero side effects
- ✅ Isolated from business logic

## Anti-Pattern to Avoid

### ❌ BAD: Business Logic in Adapter

```typescript
// DON'T DO THIS
export function toConverseInput(body: Record<string, unknown>) {
  // ❌ Business logic
  if (body['user'] === 'admin') {
    body['permissions'] = 'full';
  }
  
  // ❌ Database call
  const user = await db.getUser(body['user_id']);
  
  // ❌ Orchestration
  await notificationService.send('Request started');
  
  return transform(body);
}
```

**Why bad:**
- Adapter becomes god object
- Mixed responsibilities
- Testing requires mocking
- Violates layer boundaries

## Real Testing Example

From actual test suite:

```typescript
// Test exists in: sdk/tests/sdk.test.ts
describe('Format Adapters', () => {
  it('converts OpenAI to Bedrock format', () => {
    const openai = {
      messages: [{ role: 'user', content: 'test' }],
      stream: false
    };
    
    const bedrock = openaiToConverseInput(openai);
    
    expect(bedrock).toBeDefined();
    expect(bedrock.messages).toHaveLength(1);
  });
});
```

## Architecture Audit Validation

**Status:** ✅ PASS

**Checking against ADR-002:**
- [x] Pure format conversion
- [x] No business logic
- [x] No upward imports
- [x] Testable in isolation

## Related

- [BAD_LAYER_BOUNDARY.md](./BAD_LAYER_BOUNDARY.md) — When adapter crosses boundaries
- [ADR-002: Module Structure](../architecture/ADR-002-module-structure.md)
- [Architecture Audit](../architecture/ARCHITECTURE_AUDIT_2026-06-22.md)
