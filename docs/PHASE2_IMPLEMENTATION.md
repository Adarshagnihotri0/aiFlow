# Phase 2: Execution Trace System (Minimal Implementation)

## Overview

**Phase 2 adds stage-level timing to identify bottlenecks.**

This is NOT a full monitoring platform — it's a **microscope for LLM requests**.

---

## Architecture

### Three Primitive Model

```
ExecutionContext (Identity)
     ↓
ExecutionTrace (Behavior) ← PHASE 2 CORE
     ↓
ExecutionResult (Outcome) ← NOT IMPLEMENTED YET
```

---

## What Phase 2 Implements (MINIMAL SCOPE)

### ✅ Core Features
1. **ExecutionTrace** — Stage timing only
2. **3 Stage Instrumentations:**
   - `routing` — Route classification
   - `prompt_build` — Prompt assembly
   - `adapter` — LLM call duration
3. **ExecutionContext Extension** — Added `start_time`
4. **Trace Logging** — Correlate trace_id → stages in logs

---

## What Phase 2 Does NOT Implement (CRITICAL RESTRAINT)

❌ **NOT building:**
- ExecutionEnvelope system
- Cost calculator
- Result builder layer
- SQL analytics queries
- Performance fingerprinting
- Dashboards

**Reason:** Need baseline behavioral data first before adding platform features.

---

## Implementation Details

### Files Created
```
src/types/trace.ts           — ExecutionTrace + ExecutionTraceBuilder
```

### Files Updated
```
src/types/context.ts         — Added start_time field
src/middleware/context.ts    — Initialize trace + attach to request
src/server.ts                — Instrument 3 stages (routing, prompt_build, adapter)
```

---

## Execution Trace Structure

```typescript
interface ExecutionTrace {
  trace_id: string;
  stages: Array<{
    name: string;           // "routing", "prompt_build", "adapter"
    start_time: number;
    end_time: number;
    duration_ms: number;
  }>;
  total_ms: number;
}
```

---

## Stage Tracking Usage

```typescript
const trace = new ExecutionTraceBuilder(trace_id);

trace.start("prompt_build");
// ... work happens ...
trace.end("prompt_build");

const result = trace.complete();
// Result:
{
  trace_id: "abc123",
  stages: [
    { name: "routing", duration_ms: 2 },
    { name: "prompt_build", duration_ms: 3 },
    { name: "adapter", duration_ms: 380 }
  ],
  total_ms: 385
}
```

---

## Log Output Example

### Before Phase 2
```json
{
  "trace_id": "abc123",
  "message": "Request completed",
  "duration_ms": 385
}
```

### After Phase 2
```json
{
  "trace_id": "abc123",
  "message": "Request completed",
  "trace": {
    "stages": [
      { "name": "routing", "duration_ms": 2 },
      { "name": "prompt_build", "duration_ms": 3 },
      { "name": "adapter", "duration_ms": 380 }
    ],
    "total_ms": 385
  }
}
```

**Insight:** "Adapter call is 98% of latency" → Focus optimization there.

---

## Zero-Overhead Design

**Performance Target:** <5ms instrumentation overhead

**Techniques:**
- Use `Date.now()` for timestamps (fast, sufficient precision)
- Lazy evaluation — compute totals only on `complete()`
- No async operations in timing code
- Minimal memory allocation

---

## Validation Plan

### Manual Tests
1. Send request → verify all 3 stages timed
2. Check logs → verify trace structure present
3. Multiple requests → verify unique trace IDs
4. Different routes → verify stage durations differ

### Success Criteria
- ✅ All requests have stage-level timing
- ✅ Performance overhead <5ms
- ✅ Can identify which stage dominates latency
- ✅ Can compare route performance profiles

---

## Evolution Path

### Phase 2 (Current)
**Goal:** Measure internal behavior

**Output:** Stage timing data

---

### Phase 3 (Future — After Phase 2 validated)
**Goal:** Optimize based on data

**Triggers:**
- Clear bottleneck patterns identified
- Route performance differences measurable
- Cost attribution possible

**Potential Features:**
- Prompt tuning based on metrics
- Route optimization
- Caching frequent prompts
- Model selection logic

**Decision Rule:** Only add optimization AFTER behavioral data exists.

---

### Phase 4 (Future — After Phase 3 shows control points)
**Goal:** Control execution

**Triggers:**
- Optimization constraints identified
- Failure modes understood
- Control points clear

**Potential Features:**
- Token limits per route
- Cost caps
- Latency SLAs
- Policy engine

**Decision Rule:** Only add control AFTER optimization patterns clear.

---

## Architecture Maturity

| Phase | System Type | Capability |
|-------|-------------|------------|
| **Phase 1** | Observable Proxy | Event logs |
| **Phase 2** | Execution Trace System (CURRENT) | Stage timing |
| **Phase 3** | Optimization Layer | Data-driven tuning |
| **Phase 4** | Control System | Policy enforcement |

---

## Key Principle

> **Phase 2 is a microscope, not a platform.**

It measures behavior. It does NOT:
- Optimize
- Control
- Analyze at scale

Those come later, after baseline data exists.

---

## Monitoring (If Desired Later)

### Basic Queries
```sql
-- Slowest stages
SELECT route, name, avg(duration_ms)
FROM traces
GROUP BY route, name
ORDER BY avg(duration_ms) DESC;

-- Latency distribution per route
SELECT route, avg(total_ms), percentile(total_ms, 0.95)
FROM traces
GROUP BY route;
```

**Note:** Analytics NOT part of Phase 2 — only added if needed after data exists.

---

## Related Decision Records

- **DR-002:** Execution Context & Observability (Phase 1)
- **DR-003:** Execution Telemetry Expansion (Phase 2 — Proposed Extended Version)
- **This Document:** Phase 2 Minimal Implementation (What we actually built)

---

**Status:** IMPLEMENTED (2026-06-20)

**Implementation Scope:** Minimal (30-40% of proposed DR-003)

**Next Step:** Monitor in production for 2-4 weeks before Phase 3 planning.
