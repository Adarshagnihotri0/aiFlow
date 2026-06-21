# ❌ BAD: Layer Boundary Violation

## Real Example from Codebase

**File:** `src/server.ts`  
**Found by:** Architecture Audit 2026-06-22  
**Issue:** Transport layer doing orchestration, validation, and error handling

### The Problem

```typescript
// ❌ BAD: Server.ts doing 4+ responsibilities
app.post('/v1/messages', async (req, res) => {
  const logger = req.context ? createContextLogger(req.context) : null;
  const trace = req.trace;
  
  try {
    // ❌ Orchestration in transport layer
    trace?.start('routing');
    trace?.end('routing');
    
    trace?.start('prompt_build');
    const body = req.body as Record<string, unknown>;
    trace?.end('prompt_build');
    
    const isStream = body['stream'] === true;  // ❌ Validation here

    logger?.info('Processing Anthropic request', {
      streaming: isStream,
      model: STATIC_MODEL_ID
    });

    // ❌ Direct adapter call from transport
    trace?.start('adapter');
    if (isStream) {
      await invokeModelStream(body, res);
    } else {
      const result = await invokeModel(body);
      res.json(result);
    }
    trace?.end('adapter');
  } catch (err: unknown) {
    // ❌ Error handling mixed in
    const message = err instanceof Error ? err.message : String(err);
    logger?.error('Bedrock error', { error: message });
    res.status(500).json({ type: 'error', error: { type: 'bedrock_error', message } });
  }
});
```

## Why This Is BAD

### 1. Multiple Responsibilities

| Responsibility | Current Location | Should Be |
|----------------|------------------|-----------|
| Route registration | transport ✅ | transport |
| Request validation | transport ❌ | controller |
| Trace orchestration | transport ❌ | service |
| Error formatting | transport ❌ | controller |
| HTTP status codes | transport ✅ | transport |

**Result:** 4+ responsibilities in one file (491 lines).

### 2. Testing Difficulty

```typescript
// ❌ Problem: Testing orchestration requires Express mocks
describe('POST /v1/messages', () => {
  it('tracks stages correctly', async () => {
    const req = mockRequest({ body: {...} });
    const res = mockResponse();
    
    // Need to mock: trace, logger, bedrock, Express
    // All coupled together - can't test in isolation
  });
});
```

### 3. Violates ADR-002

**Expected:**
```
Transport → Controllers → Services → Repositories
```

**Reality:**
```
Transport (server.ts)
  ├─ Routing ✅
  ├─ Validation (should be Controller)
  ├─ Orchestration (should be Service)
  └─ Error Handling (mixed)
```

## The Fix

### Extract to Layers

```typescript
// ✅ GOOD: Transport only (server.ts)
app.post('/v1/messages', async (req, res) => {
  const result = await messagesController.handle(req);
  res.json(result);
});

// ✅ GOOD: Controller validates (controllers/messages.ts)
export async function handle(req: Request): Promise<Response> {
  validate(req.body);  // Validation here
  return service.execute(req.body);  // Delegate to service
}

// ✅ GOOD: Service orchestrates (services/trace-service.ts)
export async function execute(request: Request): Promise<Result> {
  trace.start('routing');
  trace.start('adapter');
  const result = await adapter.invoke(request);
  trace.end('adapter');
  return result;
}
```

## Architecture Audit Finding

**Source:** Architecture Audit 2026-06-22

**Impact:**
- Orchestration has no home
- Business logic embedded in transport
- Testing requires mocking HTTP layer

**Debt Level:** MEDIUM

## Related

- [Architecture Audit](../architecture/ARCHITECTURE_AUDIT_2026-06-22.md)
- [ADR-002: Module Structure](../architecture/ADR-002-module-structure.md)
- [Governance Dashboard](../architecture/GOVERNANCE_DASHBOARD.md)
