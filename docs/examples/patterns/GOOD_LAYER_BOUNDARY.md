# ✅ GOOD: Proper Layer Boundary

## Real Example from Codebase

**File:** `src/db/save-trace.ts`  
**Audit Status:** ✅ PASS — Proper layer boundary

### The Pattern

```typescript
// ✅ GOOD: Repository layer only knows about database
// File: src/db/save-trace.ts

import { getPool } from './client';
import type { ExecutionTraceRow } from '../types/trace';

/**
 * Save execution trace to database
 * Single responsibility: Persist trace data
 */
export async function saveTrace(trace: ExecutionTraceRow): Promise<void> {
  const pool = getPool();
  
  await pool.query(`
    INSERT INTO execution_traces (
      trace_id, route, routing_ms, prompt_build_ms, 
      adapter_ms, total_ms, status, error_message, project_root
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    trace.trace_id,
    trace.route,
    trace.routing_ms,
    trace.prompt_build_ms,
    trace.adapter_ms,
    trace.total_ms,
    trace.status,
    trace.error_message,
    trace.project_root
  ]);
}
```

## Why This Is GOOD

### 1. Single Responsibility
- Does ONE thing: Save trace to database
- No HTTP knowledge
- No business logic
- No orchestration

### 2. Dependency Direction Correct

```
Repository (save-trace.ts)
    ↓ imports
Database Client (db/client.ts)
    ↓ imports
Types (types/trace.ts)
```

**What it does NOT import:**
- ❌ server.ts (transport)
- ❌ bedrock.ts (adapter)
- ❌ Any business logic

### 3. Testable in Isolation

```typescript
// ✅ GOOD: Can test without Express mocks
describe('saveTrace', () => {
  it('persists trace to database', async () => {
    const trace = createTestTrace();
    
    await saveTrace(trace);  // Only need DB mock
    
    const saved = await pool.query('SELECT * FROM execution_traces');
    expect(saved.rows).toHaveLength(1);
  });
});
```

### 4. Clean Interface

```typescript
// ✅ GOOD: Clear contract
export async function saveTrace(trace: ExecutionTraceRow): Promise<void>
```

- Explicit input type
- Explicit return type
- No hidden dependencies
- No global state mutation

## Layer Position in ADR-002

```
Transport (server.ts)
    ↓
Controller (missing - logic in server.ts)
    ↓
Service (missing - logic in server.ts)
    ↓
Repository (db/save-trace.ts)  ← This example
    ↓
Database (PostgreSQL)
```

**Repository rules (followed):**
- ✅ Contains SQL only
- ✅ No business logic
- ✅ Returns domain types
- ✅ No upward imports

## Contrast with Violation

**BAD (from server.ts):**
```typescript
// ❌ BAD: Transport calling repository directly
import { saveTraceAsync } from './db/save-trace-async';

app.post('/v1/messages', async (req, res) => {
  // Business logic here
  
  // ❌ Skips service layer
  await saveTraceAsync(tracePayload);
});
```

**GOOD (future refactor):**
```typescript
// ✅ GOOD: Through proper layers
app.post('/v1/messages', async (req, res) => {
  const result = await controller.handle(req);
  res.json(result);
});

// controllers/messages.ts
export async function handle(req: Request) {
  return service.execute(req.body);
}

// services/trace-service.ts
export async function execute(request) {
  // Orchestration here
  await saveTraceAsync(trace);
}
```

## Architecture Audit Validation

**Status:** ✅ PASS

**Checking against ADR-002:**
- [x] Repository contains data access only
- [x] No upward imports (server, bedrock, adapters)
- [x] Clean interface (trace → void)
- [x] Testable without HTTP mocks

## Key Takeaways

### Repository Layer Should:
- ✅ Execute SQL queries
- ✅ Map database results to domain types
- ✅ Handle connection management
- ✅ Return promises

### Repository Layer Should NOT:
- ❌ Know about HTTP
- ❌ Validate business rules
- ❌ Orchestrate workflows
- ❌ Import from higher layers

## Related

- [BAD_LAYER_BOUNDARY.md](./BAD_LAYER_BOUNDARY.md) — The violation
- [ADR-002: Module Structure](../architecture/ADR-002-module-structure.md)
- [Architecture Audit](../architecture/ARCHITECTURE_AUDIT_2026-06-22.md)
