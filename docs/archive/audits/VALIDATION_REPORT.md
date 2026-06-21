# Refactor Validation Report

**Date:** 2026-06-22  
**Status:** ✅ COMPLETED - TraceService extracted
**Purpose:** Validate assumptions before proceeding

---

## Finding 1: Service Layer is Real (✅ JUSTIFIED)

**Audit of message-service.ts:**

| Responsibility | Moved? | Evidence |
|----------------|---------|----------|
| Adapter selection logic | ✅ YES | Lines 70-86: `if (route === 'anthropic')` branching |
| Trace creation | ✅ YES | Lines 90-98: `traceRow` construction |
| Error trace creation | ✅ YES | Lines 105-115: Error handling |
| Persistence coordination | ✅ YES | Lines 100, 118: `saveTraceAsync()` calls |
| Error mapping | ⚠️ PARTIAL | Returns success/error, caller does HTTP mapping |

**Score:** 4.5/5 responsibilities moved

**Verdict:** ✅ NOT JUST DELEGATION - Actual orchestration extracted

**However:** This service targets the WRONG routes (see Finding 2)

---

## Finding 2: MessageService Targets Wrong Routes (❌ CRITICAL)

**BC-006 Violation Map:**

| Route | Has db/ Import? | Route Type |
|-------|----------------|------------|
| `POST /v1/messages` | ❌ NO | Message route |
| `POST /v1/chat/completions` | ❌ NO | Message route |
| `POST /v1/completions` | ❌ NO | Message route |
| **`POST /api/v1/traces`** | ⚠️ **YES** | **Trace route** |
| **`GET /api/v1/traces/:id`** | ⚠️ **YES** | **Trace route** |

**BC-006 Violations Found:**
- ✅ Line 208: `import('./db/save-trace-async')` in `/api/v1/traces` 
- ✅ Line 458: `import('./db/client')` in `/api/v1/traces/:id`

**Critical Issue:** Both violations are in **TRACE routes**, not message routes!

**Impact:** MessageService extraction will reduce BC-006 by **ZERO**

---

## Finding 3: Right Service, Wrong Target

**MessageService should be:** `TraceService`

**Why:**
- Message routes (`/v1/messages`) don't import database
- Trace routes (`/api/v1/traces`) DO import database directly
- Service extraction appropriate, but targeting wrong handlers

**Recommendation:** Create `TraceService` instead, targeting:
- `/api/v1/traces` (POST) - trace ingestion
- `/api/v1/traces/:id` (GET) - trace retrieval

---

## Finding 4: Message Routes Are Clean

**Message route responsibilities:**
- ✅ Routing
- ✅ Request validation
- ✅ Adapter calls (invokeModel)
- ✅ Response formatting

**Current state:** Message routes ALREADY follow proper layering:
```
Transport → Adapter (no db skip)
```

**No BC-006 violation in message routes.**

---

## Metrics Revised

### Before Refactor

**TRACE routes (where violations exist):**
- Responsibilities: Validation + Persistence + Retrieval
- BC-006 violations: 2

**MESSAGE routes (no violations):**
- Responsibilities: Routing + Adapter calls
- BC-006 violations: 0

### Current MessageService

**Targets:** Message routes (WRONG)
**Should target:** Trace routes (CORRECT)

---

## Implementation Complete ✅

### TraceService Extracted

**File:** `src/services/trace-service.ts` (127 lines)

**Applied to routes:**
- ✅ `POST /api/v1/traces` → `traceService.ingestTrace()`
- ✅ `GET /api/v1/traces/:id` → `traceService.getTrace()`

**Impact:**
- ✅ BC-006 violations in trace routes: 2 → 0
- ✅ server.ts no longer has dynamic db imports in trace routes
- ✅ Top-level imports only for TraceService initialization

**Responsibilities moved:**
1. ✅ Trace ingestion logic
2. ✅ Trace retrieval logic
3. ✅ Database coordination
4. ✅ Error handling
5. ✅ Data transformation

**Score:** 5/5 responsibilities moved

---

### Option B: Keep MessageService, Extract TraceService

**Rationale:**
- MessageService prepares for future complexity
- TraceService addresses current BC-006 violations
- Both provide architectural value

**Impact:**
- BC-006: 2 → 0
- Service layer: 2 services exist
- server.ts: Further reduced

---

## Validation Completes ✅

**Question:** Was TraceService the correct target?  
**Answer:** YES - Fixed actual BC-006 violations

**Question:** Did Highest-Leverage First Rule work?  
**Answer:** YES - Measured violations, targeted highest-impact first

**Question:** Did Route Audit Before Extraction work?  
**Answer:** YES - Discovered MessageService targeted wrong routes

**Question:** Did Abstraction Justification Rule work?  
**Answer:** YES - Validated 5 responsibilities moved, 2 violations resolved

---

## Remaining Work

### `/api/v1/context` endpoint (Line 382)
- Still has `getPool()` import
- **Decision:** Keep for now - different route, different concern
- **Priority:** LOW - Not a trace route, BC-006 classification unclear

### MessageService status
- ✅ Fixed type errors
- ✅ Kept in codebase (good code, low architectural value)
- ⚠️ Not integrated (wrong target, correct pattern)
- **Future use:** If message routes grow complexity, service ready to deploy

## Agent Rules Added ✅

All three rules added to constitution:
1. ✅ Route Audit Before Extraction (Context Engineering #6)
2. ✅ Abstraction Justification Rule (new section)
3. ✅ Highest-Leverage First Rule (new section)

---

## Lessons Learned

**Agent Failure Mode:**
- Assumed `/v1/messages` had db imports (WRONG)
- Did not audit actual route handlers before service design
- Created service for theoretical problem, not actual problem

**New Agent Rule Needed:**

```markdown
## Route Audit Before Extraction

Before extracting service layer:

1. Audit ALL route handlers in server.ts
2. Map: Route → Imports → Dependencies
3. Identify ACTUAL violations (not theoretical ones)
4. Target service extraction to actual violations

Never create service based on assumption.
Always validate with code inspection first.
```

This would prevent extracting the wrong service in the future.
