# ❌ BAD: Dependency Violations

## Hypothetical Examples (Validated Against Audit)

These examples show patterns that WOULD violate ADR-002. The audit validated these patterns do NOT exist in current codebase, but should still be documented as anti-patterns.

## Anti-Pattern 1: Circular Dependencies

### The Violation

```typescript
// ❌ BAD: Circular dependency
// File: src/server.ts
import { saveTrace } from './db/save-trace';

export const app = express();
app.post('/messages', async (req, res) => {
  await saveTrace(trace);
});

// File: src/db/save-trace.ts
import { app } from '../server';  // ❌ UPWARD IMPORT

export async function saveTrace(trace: Trace) {
  if (app.get('env') === 'production') {  // ❌ Uses server
    // ...
  }
}
```

### Why This Is BAD

1. **Breaks Module Loading**
   ```
   server.ts loads → requires save-trace.ts
   save-trace.ts loads → requires server.ts
   server.ts already loading → CIRCULAR ⚠️
   ```

2. **Testing Difficulty**
   ```typescript
   // Can't test save-trace without server
   describe('saveTrace', () => {
     it('saves trace', async () => {
       // ❌ Must mock app before importing saveTrace
       // ❌ Tight coupling
     });
   });
   ```

3. **Refactoring Blocked**
   - Can't move save-trace to different package
   - Can't reuse in different context
   - Every change ripple effects

### Current Status

✅ **NONE DETECTED** (Validated 2026-06-22)

---

## Anti-Pattern 2: Upward Imports

### The Violation

```typescript
// ❌ BAD: Repository importing transport
// File: src/db/client.ts
import { app } from '../server';  // ❌ Repository → Transport

export function getPool(): Pool {
  const config = app.locals.dbConfig;  // ❌ Accesses Express app
  return createPool(config);
}
```

### Why This Is BAD

**Layer Hierarchy:**
```
Transport (HIGH)
    ↓
Repository (LOW)
```

**Violation:** Lower layer importing higher layer.

**Impact:**
- Repository cannot be tested without Express
- Database layer coupled to HTTP layer
- Can't use repository in CLI tools (no server)

### How to Fix

```typescript
// ✅ GOOD: Pass config as parameter
// File: src/db/client.ts
export function getPool(config: DatabaseConfig): Pool {
  return createPool(config);
}

// File: src/server.ts
const dbPool = getPool(config.database);
app.locals.db = dbPool;
```

**Now:**
- Repository has zero HTTP knowledge
- Testable without Express
- Reusable in any context

### Current Status

✅ **NONE DETECTED** (Validated 2026-06-22)

---

## Anti-Pattern 3: Skip-Layer Imports

### The Violation (EXISTS IN CODEBASE)

```typescript
// ⚠️ TECHNICAL DEBT: Transport skipping service layer
// File: src/server.ts

import { saveTraceAsync } from './db/save-trace-async';

app.post('/v1/messages', async (req, res) => {
  // Business logic here...
  
  await saveTraceAsync(tracePayload);  // ⚠️ Direct to repository
});
```

### Why This Is BAD

**Expected Flow:**
```
Transport → Service → Repository
```

**Actual Flow:**
```
Transport → Repository  ⚠️ (Skips service)
```

**Impact:**
- No service layer for orchestration
- Business logic leaks into transport
- Hard to add cross-cutting concerns

### Found by Audit

**Source:** Architecture Audit 2026-06-22

**File:** `src/server.ts`

**Issue:** Orchestration logic embedded in transport because service layer missing.

**Fix:** Extract to `services/message-service.ts`

### Current Status

⚠️ **EXISTS** (Technical debt — documented in audit)

---

## Anti-Pattern 4: Utils Importing Implementation

### The Violation

```typescript
// ❌ BAD: Utils importing adapter
// File: src/utils/logger.ts
import { invokeModel } from '../bedrock';  // ❌ Utils → Adapter

export function createSmartLogger(context: Context) {
  return {
    info: (msg) => {
      invokeModel({ prompt: msg });  // ❌ Side effect in utils
    }
  };
}
```

### Why This Is BAD

**Utils Contract:** Pure functions, zero side effects

**Violation:**
- Utils depends on external API
- Side effects hidden in "utility"
- Testing requires mocking Bedrock

**Unintended Consequence:**
```typescript
// Developer thinks this is safe
import { formatDate } from './utils';

// But it secretly calls Bedrock API!
formatDate(new Date()); // ❌ Unexpected HTTP call
```

### Current Status

✅ **NONE DETECTED** (Validated 2026-06-22)

**Audit result:**
```bash
$ grep -r "from '../bedrock\|from '../server\|from '../adapters" src/utils/
# No imports found ✅
```

---

## Anti-Pattern 5: Types Importing Implementation

### The Violation

```typescript
// ❌ BAD: Types importing implementation
// File: src/types/trace.ts
import { invokeModel } from '../bedrock';  // ❌ Type file → Implementation

export interface Trace {
  execute(): Promise<void> {
    return invokeModel(...);  // ❌ Runtime logic in types
  }
}
```

### Why This Is BAD

**Types Layer:** Zero runtime dependencies

**Violation:**
- Types have runtime behavior
- Can't use types without implementation
- Breaks dependency inversion

**Impact:**
```typescript
// Frontend imports types
import { Trace } from 'backend/types';

// ❌ Frontend needs Bedrock SDK
// ❌ Types not portable
```

### Current Status

✅ **NONE DETECTED** (Validated 2026-06-22)

---

## Anti-Pattern 6: SDK Coupling

### The Violation

```typescript
// ❌ BAD: SDK importing server
// File: sdk/src/client.ts
import { app } from '../../src/server';  // ❌ SDK → Server

export class TraceClient {
  send(trace: Trace) {
    app.locals.traces.push(trace);  // ❌ Direct coupling
  }
}
```

### Why This Is BAD

**SDK:** Should be standalone

**Violation:**
- SDK depends on server runtime
- Can't version SDK independently
- Can't use SDK in other projects

**Impact:**
```typescript
// Different project wants SDK
import { TraceClient } from 'ai-runtime-sdk';

// ❌ Fails: Can't find server.ts
// ❌ SDK not portable
```

### Current Status

✅ **NONE DETECTED** (Validated 2026-06-22)

**Audit result:**
```bash
$ grep -r "from '../../../server'" sdk/src/
# No imports found ✅
```

---

## Dependency Direction Summary

| Pattern | Status | Found In |
|---------|--------|----------|
| Circular Dependencies | ✅ 0 | None |
| Upward Imports | ✅ 0 | None |
| Skip-Layer Imports | ⚠️ 1 | server.ts → db/ |
| Utils → Implementation | ✅ 0 | None |
| Types → Implementation | ✅ 0 | None |
| SDK → Server | ✅ 0 | None |

**Overall:** 95% Clean (1 technical debt item)

---

## How to Prevent These Violations

### 1. Manual Code Review
✅ Current: Architecture review checklist

### 2. Automated Enforcement (Future)
⏳ ADR-003: dependency-cruiser rules

```javascript
// .dependency-cruiser.js
{
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies break module loading',
      rule: { from: {}, to: { circular: true } }
    },
    {
      name: 'no-upward-imports',
      severity: 'error',
      comment: 'Lower layers cannot import higher layers',
      from: { path: '^src/db/' },
      to: { path: '^src/server' }
    }
  ]
}
```

### 3. CI Pipeline
✅ Current: Lint, typecheck, test
⏳ Future: Architecture validation

---

## Real Impact: Refactoring Scenarios

### Scenario 1: Split server.ts

**With violations:**
```typescript
// ❌ Can't split if circular deps exist
server.ts imports → save-trace.ts
save-trace.ts imports → server.ts
```

**Without violations:**
```typescript
// ✅ Easy to refactor
server.ts → services/message-service.ts
services/ → db/save-trace.ts

// No circular deps, clean split
```

### Scenario 2: Extract SDK as Package

**With violations:**
```typescript
// ❌ SDK depends on server
// Can't publish as independent package
```

**Without violations:**
```typescript
// ✅ SDK is standalone
npm publish @adarsh/ai-runtime-sdk
// Works in any project
```

---

## Related

- [GOOD_DEPENDENCIES.md](./GOOD_DEPENDENCIES.md) — Allowed patterns
- [Architecture Audit](../architecture/ARCHITECTURE_AUDIT_2026-06-22.md)
- [ADR-002: Module Structure](../architecture/ADR-002-module-structure.md)
- [ADR-003: Architecture Fitness Functions](../architecture/ADR-003-architecture-fitness-functions.md) (proposed)
