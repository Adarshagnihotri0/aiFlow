# Wrong MessageService Attempt

**Type:** Avoided Anti-Pattern  
**Date:** 2026-06-22  
**Status:** Created but NOT integrated  
**Why:** Targeted wrong routes (0 BC-006 violations)

---

## The Mistake

### What Happened

**Assumption:**
```
BC-006 violations exist
→ Message routes must be causing them
→ Create MessageService
```

**Action Taken:**
- Created `src/services/message-service.ts` (120 lines)
- Targeted `/v1/messages` and `/v1/chat/completions`
- Followed factory function pattern

**Result:**
- BC-006 violations resolved: 0
- Message routes: Already clean (no db imports)

---

## Discovery Process

### Validation Question

**User asked:** "Which routes own each BC-006 violation? Don't assume. Measure."

### Route Audit

```bash
# Check message routes
src/server.ts:
  Line ~35: POST /v1/messages → invokeModel (no db)
  Line ~65: POST /v1/chat/completions → invokeModelOpenAI (no db)

# Check trace routes
src/server.ts:
  Line 208: POST /api/v1/traces → saveTraceAsync ❌ VIOLATION
  Line 458: GET /api/v1/traces/:id → getPool ❌ VIOLATION
```

**Discovery:** Both violations in **trace routes**, not message routes.

---

## Why This Was Wrong

### Assumption Error

**Assumed:**
- Message routes must have violations
- Services layer needed for message handling
- ADR-002 "suggests" services should exist

**Reality:**
- Message routes had zero db imports
- Already clean architecture
- Service extraction unnecessary

---

### Governance-Driven Refactoring

**Anti-pattern:**
```
ADR-002 says → "services should exist"
         ↓
   Create service
         ↓
   Target assumed routes
         ↓
   Result: No impact
```

**Correct approach (Problem-First Refactoring):**
```
Measure violations → Find: 2 in trace routes
                ↓
        Audit routes → Map: Route → Imports
                ↓
    Locate exact problem → Lines 208, 458
                ↓
       Design abstraction → TraceService
                ↓
        Result: 2 violations resolved
```

---

## What We Kept

### MessageService Status

**Decision:** Keep file, don't integrate

**Reasons:**
1. ✅ Good code quality (factory pattern)
2. ✅ Valid architectural pattern
3. ✅ May be useful if message routes grow complexity
4. ⚠️ Currently: Low architectural value (0 violations resolved)

**File location:** `src/services/message-service.ts`
**Status:** Pattern ready, not deployed

---

## Anti-Pattern Details

### Code vs Architecture Disconnect

**ADR-002 claimed:**
```
services/ layer exists
```

**Implementation reality:**
```
No services/ layer
```

**Wrong inference:**
```
"Services should exist"
→ Create MessageService
```

**Correct inference:**
```
Audit code → Find actual violations
→ Create TraceService
```

---

### Example of Repository Reality Rule

**Constitution rule applied:**
> "When architecture documentation conflicts with implementation: Implementation is the source of truth."

**This session validated the rule.**

Architecture doc said: Services exist  
Reality: Services don't exist  
Wrong: Assume services needed  
Correct: Audit actual violations

---

## Lesson

### The Important Output

**Not:** message-service.ts (120 lines of code)  
**Not:** ADR updates  

**The important output:**
- Route audit process (discovered wrong target)
- Repository Reality Over Planned Architecture rule
- Rule Creation Filter (amend examples, not constitution)

---

## Impact If Integrated

**If MessageService had been integrated:**

```typescript
// Would have added layer to routes that:
POST /v1/messages
  → messageService.processMessage()
    → invokeModel()
      → Already clean architecture
```

**Result:**
- Unnecessary indirection
- Complexity increased
- Violations unchanged (still at 2)
- Architecture fitness: No improvement

**Avoided by:** Route audit before integration

---

## Process Validation

### What Caught This

1. **User validation** - "Which routes own violations?"
2. **Constitution: Evidence Over Claims** - Required actual route mapping
3. **Problem-First Refactoring** - Should have located violation first
4. **Pattern Consistency First** - Would have found trace routes different

---

## Correct Solution

**See:** `trace-service-extraction.md`

MessageService was wrong target.  
TraceService was correct target.  
Route audit prevented wrong abstraction.

---

## Constitutional Rules Validated

This mistake validated three rules:

### 1. Rule Creation Filter

**Question:** "Will this happen again across repos?"  
**Answer:** YES - Assuming problem location is universal  
**Action:** Add "Problem-First Refactoring" (timeless rule)  
**Not:** Add "Route Audit Before Extraction" (repository-specific)

---

### 2. Repository Reality Over Planned Architecture

**Conflict:** ADR-002 vs implementation  
**Resolution:** Implementation is source of truth  
**Result:** Audit first, create abstraction second

---

### 3. Highest-Leverage First

**Measured:** 2 violations in trace routes, 0 in message routes  
**Decision:** Refactor trace routes first  
**Outcome:** Maximum architectural improvement

---

## Related Examples

- `trace-service-extraction.md` - Correct solution
- `bc006-investigation.md` - Discovery process
- `governance-accumulation-retrospective.md` - Why we created wrong service

---

## Governance Cost

**Artifacts created for wrong service:**
- MessageService creation time
- Type definitions
- Integration planning

**Total cost:** Wasted effort (0 architectural value)

**Avoided cost:** Integration would have added permanent indirection

**Lesson:** Validation is cheaper than refactoring wrong abstractions

---

## Key Takeaway

**The most valuable thing produced was not MessageService.**

**The most valuable thing was:**

> The process caught a wrong architectural assumption before it became permanent architecture.

That's a successful iteration.

---

## See Also

**Constitution references:**
- Problem-First Refactoring (violated initially)
- Repository Reality Over Planned Architecture (added after)
- Rule Creation Filter (added after)

**Examples of correct application:**
- `trace-service-extraction.md`
- `GOOD_LAYER_BOUNDARY.md`
