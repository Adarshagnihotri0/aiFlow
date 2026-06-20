# Observability & Tracing System

## Overview

Phase 1 implementation of the Execution Context System for controlled probabilistic execution with observability.

## Architecture

### Components

1. **ExecutionContext** (`src/types/context.ts`)
   - Unique `trace_id` for request tracing
   - Route classification (`anthropic`, `openai`, `legacy`)
   - Request metadata (timestamp, method, path)

2. **Context Middleware** (`src/middleware/context.ts`)
   - Attaches ExecutionContext to every request
   - Tracks request timing and completion
   - Logs request entry/exit with trace context

3. **Structured Logger** (`src/utils/logger.ts`)
   - Winston-based JSON logging
   - Automatic trace_id injection
   - Context-aware log methods

4. **Prompt Builder** (`src/utils/prompt-builder.ts`)
   - Simple prompt assembly utility
   - Message extraction and validation
   - Ready for Phase 2 policy integration

## Request Flow

```
Request → ContextMiddleware → Router → Logger → Adapter → Bedrock
         (attach context)            (trace)  (route)
```

### Log Example

```json
{
  "level": "info",
  "message": "Request received",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "route": "anthropic",
  "method": "POST",
  "path": "/v1/messages",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Usage

### Automatic Context Attachment

Every request automatically receives:

```typescript
req.context = {
  trace_id: string,
  route: 'anthropic' | 'openai' | 'legacy',
  timestamp: string,
  method: string,
  path: string
}
```

### Context-Aware Logging

```typescript
import { createContextLogger } from './utils/logger';

const logger = createContextLogger(req.context);
logger.info('Processing request', { model: 'claude-3-sonnet' });
```

### Route Classification

| Path | Route Type |
|------|-----------|
| `/v1/messages` | `anthropic` |
| `/v1/chat/completions` | `openai` |
| `/v1/completions` | `legacy` |

## Observability Gains

### Before (Phase 0)
- Basic `console.log` with timestamps
- No request correlation
- No route classification
- No structured output

### After (Phase 1)
- ✅ Unique trace_id per request
- ✅ Structured JSON logs
- ✅ Route classification
- ✅ Request duration tracking
- ✅ Context propagation through error paths

## Validation Checklist

Manual tests to verify system:

1. **Trace ID Generation**
   ```bash
   curl -X POST http://localhost:3000/v1/messages -d '{"model":"claude-3-sonnet"}'
   # Check logs for unique trace_id
   ```

2. **Route Classification**
   ```bash
   # Should log route: "anthropic"
   curl -X POST http://localhost:3000/v1/messages
   
   # Should log route: "openai"
   curl -X POST http://localhost:3000/v1/chat/completions
   
   # Should log route: "legacy"
   curl -X POST http://localhost:3000/v1/completions
   ```

3. **Error Propagation**
   ```bash
   # Force error - trace_id should appear in error log
   curl -X POST http://localhost:3000/v1/messages -d '{"invalid"}'
   ```

4. **Multiple Requests**
   ```bash
   # Each request should have different trace_id
   for i in {1..5}; do curl http://localhost:3000/health; done
   ```

## Phase 2 Extensions

When ready to add route-based policies:

1. **Create** `src/policies/route-policies.ts`
2. **Update** `src/utils/prompt-builder.ts` to accept policy parameter
3. **Add** `route_policies` section to evidence-config.yml

Phase 2 will be validated only after Phase 1 proves sufficient in production.

## Environment Variables

- `LOG_LEVEL`: Set log verbosity (default: `info`)

## Dependencies Added

- `uuid@^10.0.0` - Trace ID generation
- `winston@^3.13.0` - Structured logging
- `@types/uuid` - TypeScript definitions

## Related

- Decision Record: `.ai/decision-records/DR-002-execution-context-observability.md`
- Architecture: `docs/ARCHITECTURE.md`
