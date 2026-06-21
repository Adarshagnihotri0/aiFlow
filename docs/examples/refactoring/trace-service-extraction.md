# Trace Service Extraction

**Type:** Successful Refactor  
**Date:** 2026-06-22  
**BC-006 Violations Resolved:** 2

---

## Problem

**Boundary violation detected:**
- `POST /api/v1/traces` imported `saveTraceAsync` from `db/`
- `GET /api/v1/traces/:id` imported `getPool` from `db/`

Both violated BC-006: Transport layer should not import Repository layer directly.

---

## Investigation Process

### Step 1: Route Audit

Mapped all route handlers → their imports:

```bash
grep -n "import.*db/save-trace-async" src/server.ts
grep -n "import.*db/client" src/server.ts
```

**Results:**
```
Line 208: import('./db/save-trace-async') in POST /api/v1/traces
Line 458: import('./db/client') in GET /api/v1/traces/:id
```

---

### Step 2: Map Violations by Route

| Route | db Import? | Violation |
|-------|-----------|-----------|
| `/v1/messages` | ❌ NO | Clean |
| `/v1/chat/completions` | ❌ NO | Clean |
| `/api/v1/traces` | ✅ YES | BC-006 |
| `/api/v1/traces/:id` | ✅ YES | BC-006 |

**Discovery:** Only trace routes violated boundaries. Message routes were already clean.

---

### Step 3: Baseline Metrics

**Before extraction:**
- `src/server.ts`: 493 LOC
- BC-006 violations: 2
- db imports: `saveTraceAsync`, `getPool`
- Tests: 9/9 passing

---

## Solution

### Created: `src/services/trace-service.ts`

**Pattern:** Factory function with dependency injection

```typescript
export function createTraceService(deps: TraceServiceDeps): TraceService {
  return {
    ingestTrace: (payload: TracePayload) => {
      const traceRow: ExecutionTraceRow = { /* transform */ };
      deps.saveTraceAsync(traceRow);
      return { trace_id, received_at, api_version };
    },
    getTrace: async (traceId: string) => {
      const pool = deps.getPool();
      const result = await pool.query(/* ... */);
      return { found: true, trace: formatted };
    }
  };
}
```

**Design decisions:**
1. ✅ Factory function (not class) - Functional-first principle
2. ✅ Dependency injection - Testability
3. ✅ No Express imports - Layer purity
4. ✅ Orchestration logic - 5 responsibilities moved

---

### Integration

**Modified:** `src/server.ts`

```typescript
// Before
const { saveTraceAsync } = await import('./db/save-trace-async');
saveTraceAsync(traceRow);

// After
const traceService = createTraceService({ saveTraceAsync, getPool });
const result = traceService.ingestTrace(payload);
res.json({ status: 'ok', ...result });
```

---

## Results

### Metrics After Extraction

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| BC-006 violations | 2 | 0 | ✅ -2 |
| server.ts db imports | 2 | 0 (service init only) | ✅ Removed |
| TraceService LOC | 0 | 127 | Created |
| Test pass rate | 9/9 | 9/9 | ✅ Maintained |

---

### Responsibilities Moved

1. ✅ **Trace ingestion logic** - Payload transformation
2. ✅ **Trace retrieval logic** - Database query
3. ✅ **Database coordination** - Pool management
4. ✅ **Error handling** - Error trace creation
5. ✅ **Response formatting** - Data transformation

**Score:** 5/5 responsibilities justified layer existence

---

## Pattern Validated

### Used From Examples Library

- `GOOD_FACTORY_FUNCTION.md` - Factory pattern
- `GOOD_LAYER_BOUNDARY.md` - Service → Repository

### Applied Constitution Rules

- ✅ Functional-First Design
- ✅ Problem-First Refactoring
- ✅ Abstraction Justification (5 responsibilities)
- ✅ Refactor Success Criteria (violations decreased)

---

## Lessons

### What Worked

1. **Route audit** - Mapped actual violations before creating service
2. **Baseline metrics** - Had concrete starting point
3. **Dependency injection** - Service testable in isolation
4. **Examples library** - Followed existing patterns

### What We Avoided

**False positive:** Almost created MessageService for wrong routes  
**Reason:** Route audit caught assumption error before integration

---

## Anti-Pattern Comparison

**See also:** `wrong-message-service-attempt.md`

The MessageService was created first, targeting message routes.  
Route audit revealed: message routes had NO violations.  
TraceService was the correct target.

**Difference:** Evidence-driven vs assumption-driven refactoring

---

## Code Location

- **Service:** `src/services/trace-service.ts`
- **Integration:** `src/server.ts` lines 7-8 (imports), line 14 (init)
- **Tests:** `npm test` → 9/9 passing

---

## Governance Impact

**Before:** 2 BC-006 violations blocked architecture fitness  
**After:** BC-006 count: 0  
**Architecture:** Services layer now validated pattern

---

## Related Examples

- `GOOD_LAYER_BOUNDARY.md` - Repository pattern reference
- `GOOD_FACTORY_FUNCTION.md` - Factory pattern used
- `bc006-investigation.md` - Violation discovery process
- `wrong-message-service-attempt.md` - Anti-pattern avoided
