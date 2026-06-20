# Decision Record: Execution Context & Observability System

**ID:** DR-002  
**Date:** 2026-06-20  
**Status:** IMPLEMENTED (Phase 1)  
**Decision Maker:** System Architecture Team  
**Risk Level:** MEDIUM

---

## Context

The current proxy is a **stateless translation layer** using basic `console.log` statements. This creates critical gaps:

- ❌ No request correlation — can't trace multi-step flows
- ❌ No route classification — all endpoints log identically
- ❌ No structured logging — impossible to parse logs programmatically
- ❌ No performance monitoring — can't identify slow requests
- ❌ No error context — errors lack trace IDs for debugging

The vision requires **controlled probabilistic execution with observability**, not a deterministic compilation pipeline.

---

## Decision

**Implement Incremental Execution Context + Prompt Builder (Option B)**

Phase 1 MVP: Focus on **traceability and prompt assembly**, not full compilation.

### Components

1. **ExecutionContext** (20 lines)
   - Attach `trace_id`, `route`, `timestamp` to every request
   - Classify routes: `anthropic`, `openai`, `legacy`

2. **Context Middleware** (50 lines)
   - Generate trace IDs
   - Track request timing
   - Inject context into Express Request

3. **Structured Logger** (30 lines)
   - Winston-based JSON logging
   - Automatic trace context injection
   - Context-aware log methods

4. **Prompt Builder** (40 lines)
   - Simple assembly function (not compiler)
   - Message extraction/validation
   - Ready for Phase 2 policy integration

---

## Reasoning

### Why Not Option A (Full Deterministic Runtime)?

- ❌ **Over-engineering** — Merging 3 layers before validating runtime behavior
- ❌ **Premature formalization** — "Prompt Manifest" and "Policy Engine Service" add complexity before needed
- ❌ **Evidence:** Only 4 TypeScript files exist — minimal codebase doesn't justify enterprise architecture
- ❌ **Risk:** Building enterprise architecture before understanding failure modes

### Why Not Option C (Client-Level Configuration)?

- ❌ **Control loss** — Cannot guarantee all clients obey configuration
- ❌ **Evidence:** `.env` shows proxy designed as transparent replacement — clients unaware of backend
- ❌ **No routing control** — Can't enforce per-route policies

### Why Option B (Incremental Approach)?

- ✅ **Pattern match** — Extends existing `console.log` patterns instead of replacing
- ✅ **TypeScript ready** — tsconfig strict mode supports type-safe utility modules
- ✅ **Minimal dependencies** — Add `uuid` and `winston` incrementally
- ✅ **Gap closure** — Addresses identified observability gaps directly
- ✅ **Evidence-driven** — DR-001 used evidence ledger — this architecture measurable
- ✅ **Production realistic** — Follows existing layered architecture

---

## Implementation

### Phase 1 (COMPLETE - 2026-06-20)

**Files Created:**
- `src/types/context.ts` — ExecutionContext types
- `src/utils/logger.ts` — Winston logger with trace context
- `src/utils/prompt-builder.ts` — Simple prompt assembly
- `src/middleware/context.ts` — Context middleware
- `docs/OBSERVABILITY.md` — Documentation

**Files Updated:**
- `src/server.ts` — Added middleware chain
- `package.json` — Added `uuid@^10.0.0`, `winston@^3.13.0`

**Dependencies Added:**
- `uuid@^10.0.0` + `@types/uuid` — Trace ID generation
- `winston@^3.13.0` — Structured logging

### Phase 2 (FUTURE - After Phase 1 validated)

- CREATE: `src/policies/route-policies.ts` — Route-based policy resolution
- UPDATE: `src/utils/prompt-builder.ts` — Accept policy parameter
- UPDATE: `evidence-config.yml` — Add `route_policies` section

**Trigger:** Only proceed if Phase 1 proves insufficient in production.

### Phase 3 (ONLY IF NEEDED)

- CREATE: `src/policy-engine.ts` — Formal policy system
- CREATE: `src/prompt-compiler.ts` — Advanced compilation

**Trigger:** Only if Phase 1-2 insufficient.

---

## Alternatives Considered

| Option | Cost | Pros | Cons |
|--------|------|------|------|
| **A: Full Runtime** | HIGH | Enterprise architecture | Over-engineered for 4-file codebase |
| **B: Incremental** | MEDIUM | MVP-first, measurable | Requires validation before Phase 2 |
| **C: Client Config** | LOW | Simple implementation | No routing control, can't guarantee compliance |

---

## Validation Plan

### Automated Tests (TO BE CREATED)
- [ ] `src/__tests__/context.test.ts` — Verify trace_id generation
- [ ] `src/__tests__/logger.test.ts` — Verify structured logging
- [ ] `src/__tests__/prompt-builder.test.ts` — Verify message extraction

### Manual Validation
- [ ] Send request → verify `trace_id` in logs
- [ ] Test different routes → verify classification
- [ ] Force error → verify `trace_id` in error path
- [ ] Send multiple requests → verify unique trace IDs
- [ ] Check Winston output → verify JSON structure

---

## Impact

### Before (Phase 0)
```
[2024-01-15T10:30:00.000Z] anthropic stream → claude-3-sonnet
Bedrock error: some error message
```
- No correlation between requests
- No route classification
- No structured parsing

### After (Phase 1)
```json
{
  "level": "info",
  "message": "Request received",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "route": "anthropic",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "method": "POST",
  "path": "/v1/messages"
}
```
- ✅ Unique trace_id for request correlation
- ✅ Route classification for policy resolution
- ✅ Structured JSON for programmatic parsing
- ✅ Performance timing for monitoring

---

## Monitoring

Track the following metrics:

1. **Trace ID Uniqueness** — Ensure no collisions
2. **Route Distribution** — Balance of anthropic/openai/legacy
3. **Request Duration** — P50, P95, P99 latencies
4. **Error Rate** — Errors with trace context
5. **Log Volume** — Structured log size vs. capacity

---

## Rollback Plan

If Phase 1 causes issues:

1. Remove `contextMiddleware` from server.ts
2. Revert to `console.log` statements
3. Phase 2 implementation blocked until Phase 1 stable

**Rollback Cost:** LOW (middleware can be removed, logging reverts to console.log)

---

## References

- **Evidence Ledger:** `.ai/evidence-ledger/current.md`
- **Implementation:** `IMPLEMENTATION_COMPLETE.md`
- **Documentation:** `docs/OBSERVABILITY.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Previous Decision:** DR-001 (Evidence-Driven System)

---

## Lessons Learned

1. **LLMs are probabilistic** — Build for controlled execution, not deterministic compilation
2. **MVP-first mindset** — Start with observability, add complexity when needed
3. **Evidence-driven architecture** — Validate each phase before proceeding
4. **Minimal codebase** — Don't over-architect for small projects
5. **Phased implementation** — Reduces risk and allows validation at each step

---

## Next Steps

1. **Validate Phase 1 in production**
2. **Monitor metrics for 2-4 weeks**
3. **Collect user feedback**
4. **Decide on Phase 2** — Only if Phase 1 gaps identified

**Estimated Time to Phase 1 Validation:** 2-4 weeks

**Trigger for Phase 2:** Evidence shows route-based policies needed
