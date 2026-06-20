# Minimal Execution Trace Persistence (PostgreSQL)

## Overview

**Phase 2+ Extension:** Append-only execution log to PostgreSQL

Every LLM request leaves a permanent footprint in the database for historical analysis.

---

## Architecture

### Design Principles

1. **Append-Only Log** — INSERT only, no updates
2. **Async Persistence** — Non-blocking, fire-and-forget
3. **Simple Schema** — Single table, minimal indexes
4. **Direct pg Client** — No ORM overhead
5. **Silent Failures** — DB down = logs only, requests succeed

---

## Data Flow

```
Request
  ↓
Execution Trace (in memory)
  ↓
trace.toRow() → Flat structure
  ↓
setImmediate() → Async queue
  ↓
PostgreSQL INSERT
  ↓
Permanent storage
```

---

## Database Schema

**Table: `execution_traces`**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | SERIAL | Primary key |
| `trace_id` | TEXT | Unique request identifier |
| `route` | TEXT | Route classification (anthropic, openai, legacy) |
| `routing_ms` | INT | Routing stage duration |
| `prompt_build_ms` | INT | Prompt building duration |
| `adapter_ms` | INT | LLM call duration |
| `total_ms` | INT | Total request latency |
| `status` | TEXT | Request status (success, error, timeout) |
| `error_message` | TEXT | Error details (optional) |
| `created_at` | TIMESTAMP | Timestamp of request |

**Indexes:**
- `idx_execution_traces_route` — Filter by route
- `idx_execution_traces_created_at` — Time-based queries
- `idx_execution_traces_total_ms` — Latency analysis

---

## Implementation Details

### Files Created

1. **`src/db/client.ts`** — PostgreSQL connection pool
   - Singleton pool with minimal connections (max: 5)
   - Graceful error handling
   - Mock pool if DATABASE_URL not set

2. **`src/db/save-trace.ts`** — Core INSERT logic
   - Parameterized query (SQL injection safe)
   - ON CONFLICT DO NOTHING (handle duplicates)
   - Silent failure logging

3. **`src/db/save-trace-async.ts`** — Async wrapper
   - setImmediate() for non-blocking execution
   - Fire-and-forget pattern
   - Never throws errors

4. **`migrations/001_create_execution_traces.sql`** — Database schema

### Files Updated

1. **`src/types/trace.ts`**
   - Added route, status, error_message fields
   - Added ExecutionTraceRow interface
   - Added toRow() method for DB insertion
   - Added setError() method

2. **`src/middleware/context.ts`**
   - Integrated saveTraceAsync on response finish
   - Set error status on HTTP errors (>=400)
   - Trace persists BEFORE logs written

3. **`.env`**
   - Added DATABASE_URL configuration

4. **`package.json`**
   - Added dependencies: `pg`, `@types/pg`

---

## Usage Example

### Automatic Trace Persistence

Every request automatically:

```typescript
// Middleware builds trace during request lifecycle
trace.start('routing');
trace.end('routing');

trace.start('prompt_build');
trace.end('prompt_build');

trace.start('adapter');
await invokeModel();
trace.end('adapter');

// On response finish, trace auto-persists to DB
res.on('finish', () => {
  saveTraceAsync(trace.toRow());
});
```

### Manual Trace Query

```sql
-- Recent traces
SELECT * FROM execution_traces
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Average latency by route
SELECT route, AVG(total_ms) as avg_latency
FROM execution_traces
GROUP BY route;

-- Slowest requests
SELECT trace_id, route, total_ms, created_at
FROM execution_traces
ORDER BY total_ms DESC
LIMIT 10;

-- Error rate by route
SELECT route, 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
       ROUND(100.0 * SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) / COUNT(*), 2) as error_rate
FROM execution_traces
GROUP BY route;
```

---

## Configuration

### Environment Variables

```bash
# Required for persistence
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/future_db?schema=public"
```

**Optional:**
- If `DATABASE_URL` not set, traces log but don't persist
- System remains functional without database

---

## Migration Instructions

### Option 1: Direct SQL Execution

```bash
# Create table manually
psql -h localhost -U postgres -d future_db -f migrations/001_create_execution_traces.sql
```

### Option 2: Using Prisma (if bhavishya backend available)

```bash
cd /path/to/bhavishya/apps/backend
# Add migration to Prisma schema
# Run: npx prisma migrate dev --name add_execution_traces
```

### Verify Table Creation

```sql
\d execution_traces
```

Expected output:
```
Table "public.execution_traces"
   Column    |            Type             |
-------------+-----------------------------+---------
 id          | integer                     |
 trace_id    | text                        |
 route       | text                        |
 routing_ms  | integer                     |
 prompt_build_ms | integer                 |
 adapter_ms  | integer                     |
 total_ms    | integer                     |
 status      | text                        |
 error_message | text                      |
 created_at  | timestamp without time zone |
```

---

## Performance Characteristics

### Overhead
- **Insertion:** ~2-5ms (async, non-blocking)
- **Memory:** ~1KB per trace in queue
- **Connection Pool:** 5 max connections

### Scalability
- **Writes:** Append-only (no locking)
- **Volume:** Suitable for 1K-10K requests/day
- **Future:** Consider ClickHouse for >10K/day

---

## Failure Modes

### Database Down
- ✅ Requests continue successfully
- ⚠️ Traces not persisted
- ✅ Errors logged to console

### Duplicate trace_id
- ✅ ON CONFLICT DO NOTHING
- ✅ No errors thrown

### Connection Pool Exhausted
- ⚠️ New connections wait (2s timeout)
- ⚠️ trace.save fails silently
- ✅ Requests not affected

---

## Key Design Decisions

### Why NOT Prisma?
- Simple INSERT only — ORM overhead unnecessary
- Minimal dependencies — direct pg faster
- No complex queries yet

### Why Async?
- Request latency never affected
- DB failures don't break proxy
- Logs remain primary truth source

### Why Append-Only?
- Historical data preserved
- No UPDATE/DELETE complexity
- Time-series analysis possible

---

## Evolution Path

### Current State (Phase 2+)
- ✅ Append-only trace persistence
- ✅ Async, non-blocking
- ✅ Single table, minimal schema

### Phase 3 (Future)
Potential additions:
- Query utilities for analysis
- Aggregation functions
- Cost tracking (tokens + cost columns)
- Visualization dashboards

### Phase 4 (Advanced)
Potential additions:
- Prisma integration (if queries complex)
- ClickHouse migration (if volume >10K/day)
- Real-time monitoring
- Alerting system

---

## Validation Checklist

### Manual Tests
- [ ] Database table created successfully
- [ ] Trace persists on successful request
- [ ] Trace persists on error request
- [ ] Request succeeds when DB is down
- [ ] No duplicate trace_id errors
- [ ] Async writes don't block requests

### Test Commands
```bash
# 1. Create table
psql -d future_db -f migrations/001_create_execution_traces.sql

# 2. Send test request
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-sonnet","messages":[{"role":"user","content":"test"}]}'

# 3. Verify persistence
psql -d future_db -c "SELECT * FROM execution_traces ORDER BY created_at DESC LIMIT 1;"

# 4. Stop database and verify proxy still works
# (Traces will log but not persist)
```

---

## Related Documentation

- **Phase 1:** `docs/OBSERVABILITY.md`
- **Phase 2:** `docs/PHASE2_IMPLEMENTATION.md`
- **Architecture:** `docs/ARCHITECTURE.md`

---

**Status:** IMPLEMENTED (2026-06-20)

**Implementation Scope:** Minimal append-only persistence

**Next Step:** Test in production, analyze query patterns, consider Phase 3 utilities
