# TraceBuilder Architecture

## Overview

This document explains the architectural decision to maintain two separate TraceBuilder implementations.

---

## Components

### 1. ExecutionTraceBuilder (Server)

**Location:** `src/types/trace.ts`

**Purpose:** Internal server request tracing with route validation

**Key Features:**
- Route type restrictions (`'anthropic' | 'openai' | 'legacy'`)
- DB serialization via `toRow()` method
- Stage-duration aggregation for `total_ms`
- PostgreSQL persistence

**Usage:**
```typescript
const trace = new ExecutionTraceBuilder(traceId, 'anthropic');
trace.start('routing');
// ... work ...
trace.end('routing');
const row = trace.toRow(); // For DB insertion
```

---

### 2. TraceBuilder (SDK)

**Location:** `sdk/src/trace.ts`

**Purpose:** External application tracing with metadata support

**Key Features:**
- Flexible route names (string)
- Metadata support (arbitrary key-value pairs)
- Project root auto-capture
- Wall-clock timing for `total_ms`
- HTTP transmission to server

**Usage:**
```typescript
const t = aiRuntime.trace('my-operation');
t.start('validation');
await validate();
t.end('validation');
const payload = t.complete(); // For HTTP POST
```

---

## Why Separate Implementations?

### Different Consumers

| Component | Consumer | Deployment |
|-----------|----------|------------|
| ExecutionTraceBuilder | Server middleware | Internal to server process |
| TraceBuilder | External applications | Installed via npm |

### Different Serialization

| ExecutionTraceBuilder | TraceBuilder |
|----------------------|--------------|
| `toRow()` → PostgreSQL flat row | `complete()` → JSON payload |
| Fields: routing_ms, prompt_build_ms, adapter_ms | Fields: stages array, metadata, project_root |
| Stage-sum timing | Wall-clock timing |

### Different Constraints

| ExecutionTraceBuilder | TraceBuilder |
|----------------------|--------------|
| Route must be server route type | Route can be any string |
| No metadata (internal) | Supports arbitrary metadata |
| No project_root | Auto-captures project root |
| Used by middleware | Used by SDK consumers |

---

## Shared Behavior

Both implementations provide identical stage timing:

```typescript
start(name: string): void
end(name: string): void
setError(message: string): void
setTimeout(): void
```

This is **intentional duplication** to avoid circular dependencies between SDK and server.

---

## Future Considerations

If these implementations need to share more logic:

### Option A: Extract to Shared Package

```
@adarsh/trace-core
  ├── BaseTraceBuilder
  └── Shared types
```

This would allow:
```typescript
import { BaseTraceBuilder } from '@adarsh/trace-core';
```

### Option B: Keep Separate

Current approach is preferred because:
- No circular dependency between SDK and server
- Different serialization requirements
- Different type constraints
- Different deployment targets

---

## Decision Record

**Decision:** Maintain separate implementations with documented divergence.

**Rationale:**
1. SDK cannot depend on server (would be circular)
2. Server cannot depend on SDK (mixes internal/external concerns)
3. Serialization formats differ fundamentally
4. Type constraints differ fundamentally

**Alternatives Considered:**
- Shared base class → Rejected due to TypeScript compilation complexity
- Copy-paste with comment → Current approach with documentation
- Monorepo with shared package → Potential future path

**Review Date:** Re-evaluate if implementations diverge further.
