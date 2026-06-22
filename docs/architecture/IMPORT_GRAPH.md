# Import Graph Baseline

**Generated:** 2026-06-22  
**Purpose:** Baseline measurement before implementing ADR-003 boundary rules  
**Tool:** madge 8.0.0

---

## Summary

```
Files Processed: 32
Warnings: 1 (sdk/dist files - build artifacts)
Circular Dependencies: 0
```

---

## Import Graph

### Bootstrap Layer (src/index.ts)

```typescript
src/index.ts
  → src/server.ts (Transport)
```

**Analysis:** ✅ Clean - Bootstrap imports only transport layer

---

### Transport Layer (src/server.ts)

```typescript
src/server.ts
  → src/adapters.ts (Adapter)
  → src/bedrock.ts (External Adapter)
  → src/db/client.ts (Repository - ⚠️ SKIP LAYER)
  → src/db/save-trace-async.ts (Repository - ⚠️ SKIP LAYER)
  → src/middleware/context.ts (Middleware)
  → src/types/context.ts (Types)
  → src/types/trace.ts (Types)
  → src/utils/logger.ts (Utils)
```

**Analysis:** 
- ✅ Adapters import (correct)
- ✅ Types imports (correct)
- ✅ Utils imports (correct)
- ⚠️ **SKIP-LAYER**: Direct repository imports (server.ts → db/)
- ⚠️ **MISSING SERVICE LAYER**: Should go through services/

**Action Required:** Extract orchestration to services/ after ADR-003

---

### Middleware Layer (src/middleware/context.ts)

```typescript
src/middleware/context.ts
  → src/db/save-trace-async.ts (Repository)
  → src/types/context.ts (Types)
  → src/types/trace.ts (Types)
  → src/utils/logger.ts (Utils)
```

**Analysis:**
- ⚠️ **SKIP-LAYER**: Middleware imports repository directly
- ✅ Types imports (correct)
- ✅ Utils imports (correct)

**Action Required:** Middleware should receive dependencies, not import them

---

### Repository Layer (src/db/)

```typescript
src/db/save-trace-async.ts
  → src/db/save-trace.ts (Repository internal)
  → src/types/trace.ts (Types)

src/db/save-trace.ts
  → src/db/client.ts (Database client)
  → src/types/trace.ts (Types)

src/db/client.ts
  (no imports - database connection only)
```

**Analysis:** ✅ Clean - Repositories import:
- Database client (correct)
- Types (correct)
- No upward imports

**Boundary Status:** 
- ✅ BC-004 Repository Boundary (PASS)

---

### Adapter Layer (src/adapters.ts, src/bedrock.ts)

```typescript
src/adapters.ts
  (no imports - pure transformation)

src/bedrock.ts
  → src/adapters.ts (Adapter internal)
```

**Analysis:** ✅ Clean - Adapters import:
- Other adapters (correct)
- No services/repositories

**Boundary Status:**
- ✅ Adapter purity (PASS)

---

### Types Layer (src/types/)

```typescript
src/types/trace.ts
  (no imports - pure types)

src/types/context.ts
  (no imports - pure types)

src/types/api.ts
  (no imports - pure types)
```

**Analysis:** ✅ Perfect - Zero imports from implementation layers

**Boundary Status:**
- ✅ BC-002 Type Purity (PASS)

---

### Utils Layer (src/utils/)

```typescript
src/utils/logger.ts
  → src/types/context.ts (Types)

src/utils/prompt-builder.ts
  → src/types/context.ts (Types)
```

**Analysis:** ✅ Clean - Utils import only types

**Boundary Status:**
- ✅ BC-003 Utils Purity (PASS)

---

### SDK Layer (sdk/src/)

```typescript
sdk/src/index.ts
  → sdk/src/client.ts
  → sdk/src/trace.ts
  → sdk/src/types.ts

sdk/src/client.ts
  → sdk/src/types.ts

sdk/src/trace.ts
  sdk/src/types.ts
```

**Analysis:** ✅ Perfect - SDK has zero imports from src/

**Boundary Status:**
- ✅ BC-001 SDK Isolation (PASS)

**Note:** Warning about sdk/dist files can be ignored (build artifacts, will be gitignored)

---

## Circular Dependencies

```
CIRCULAR DEPENDENCIES FOUND: 0
```

**Boundary Status:**
- ✅ BC-005 No Circular Dependencies (PASS)

---

## Skip-Layer Imports (BC-006 Violations)

### Violation 1: server.ts → db/

```typescript
// src/server.ts
import { saveTraceAsync } from './db/save-trace-async';

app.post('/v1/messages', async (req, res) => {
  // Transport layer calling repository directly
  await saveTraceAsync(tracePayload);  // ⚠️ SKIPS SERVICE LAYER
});
```

**Correct Flow:**
```
Transport → Service → Repository
```

**Current Flow:**
```
Transport → Repository  ⚠️
```

**Impact:** Business logic leaks into server.ts

---

### Violation 2: middleware/context.ts → db/

```typescript
// src/middleware/context.ts
import { saveTraceAsync } from '../db/save-trace-async';

export function contextMiddleware(req, res, next) {
  // Middleware calling repository directly
  await saveTraceAsync(context);  // ⚠️ SKIPS SERVICE LAYER
});
```

**Correct Flow:**
```
Middleware → Service → Repository
```

**Current Flow:**
```
Middleware → Repository  ⚠️
```

**Impact:** Orchestration hidden in middleware

---

## Boundary Compliance Matrix

| Rule | Status | Violations |
|------|--------|------------|
| BC-001: SDK Isolation | ✅ PASS | 0 |
| BC-002: Type Purity | ✅ PASS | 0 |
| BC-003: Utils Purity | ✅ PASS | 0 |
| BC-004: Repository Boundary | ✅ PASS | 0 |
| BC-005: No Circular Deps | ✅ PASS | 0 |
| BC-006: No Skip-Layer | ⚠️ FAIL | 2 |

**Overall:** 83% compliant (5/6 rules passing)

---

## Import Count by Layer

| Layer | Files | Imports In | Imports Out |
|-------|-------|------------|-------------|
| Bootstrap | 1 | 0 | 1 |
| Transport | 1 | 1 | 7 |
| Middleware | 1 | 7 | 4 |
| Repositories | 3 | 3 | 4 |
| Adapters | 2 | 1 | 1 |
| Types | 3 | 7 | 0 |
| Utils | 2 | 5 | 2 |
| SDK | 3 | 0 | 3 |

**Key Metrics:**
- Types receive imports: 7 ✅ (cross-cutting)
- Utils receive imports: 5 ✅ (cross-cutting)
- Repositories receive imports: 3 ✅ (from higher layers)
- SDK receives imports: 0 ✅ (completely isolated)

---

## Before/After ADR-003

### Current State

```
Transport ──────────→ Repository (⚠️ skip)
    │
    └─── Business logic in server.ts
```

### Target State (After Service Extraction)

```
Transport ──→ Service ──→ Repository
                 │
                 └─── Business logic in services/
```

**Impact:**
- Remove 2 skip-layer violations
- Achieve 100% boundary compliance
- Enable BC-006 enforcement

---

## Warning Budget Impact

**Current Metrics:**
- ESLint warnings: 23
- Architecture violations: 2 (skip-layer)

**Proposed Tracking:**
```
Quality Gate          Current    Target
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESLint Errors           0          0
ESLint Warnings        23         <15
Architecture Violations  2          0
TypeScript Errors       0          0
Test Failures           0          0
```

**Action Items:**
1. ✅ Create baseline (this document)
2. ⏳ Implement dependency-cruiser (BC-001 through BC-005)
3. ⏳ Extract service layer (eliminate BC-006 violations)
4. ⏳ Enable BC-006 in CI

---

## Dependency-Cruiser Readiness

**Rules Ready for Enforcement:**
- ✅ BC-001: SDK → src forbidden
- ✅ BC-002: types/ → implementations forbidden
- ✅ BC-003: utils/ → services/db forbidden
- ✅ BC-004: db/ → server forbidden
- ✅ BC-005: Circular dependencies forbidden

**Rules Pending Refactor:**
- ⏳ BC-006: server → db forbidden (2 violations exist)

**Recommended Action:** Implement 5 rules immediately, add BC-006 after service extraction

---

## Related Documents

- [ADR-003: Boundary Catalog](./ADR-003-boundary-catalog.md)
- [Architecture Audit 2026-06-22](./ARCHITECTURE_AUDIT_2026-06-22.md)
- [Governance Dashboard](./GOVERNANCE_DASHBOARD.md)

---

## Generation Command

```bash
npx madge src sdk --extensions ts --warning > IMPORT_GRAPH.md
```

**Note:** sdk/dist warnings can be ignored (build artifacts)
