# Repository Architecture

This document provides a complete overview of the Developer Context Generator repository structure.

---

## Repository Components

```
developer-context-generator
│
├── airuntime CLI
│   └── Generates AI-ready project context from any repository
│
├── Trace Collection Server (src/)
│   ├── Express API server
│   ├── AWS Bedrock proxy
│   ├── Trace ingestion endpoint
│   └── Context generation API
│
├── @adarsh/ai-runtime SDK (sdk/)
│   ├── TraceBuilder for external applications
│   ├── Auto-trace middleware
│   └── HTTP client for trace transmission
│
└── PostgreSQL Database
    └── Stores execution traces
```

---

## Architecture Diagram

```
External Application
      │
      ▼
@adarsh/ai-runtime SDK
      │
      │ HTTP POST
      ▼
POST /api/v1/traces
      │
      ▼
Server (src/server.ts)
      │
      ├───→ PostgreSQL (persistence)
      │
      └───→ Context Generation
                │
                ▼
         airuntime CLI
                │
                ▼
          AI-Ready Context
```

---

## Component Details

### 1. airuntime CLI (`ai-runtime-cli/`)

**Purpose:** Generate AI-ready project context from any repository

**Commands:**
```bash
airuntime prep              # Basic context (files + dependencies)
airuntime prep --deep       # With file previews
airuntime prep --json       # JSON output
airuntime trace <id>        # Fetch specific trace
```

**Output Example:**
```markdown
# Project: my-app

## Important Files (4)
- src/server.ts (409 lines)
- package.json (16 lines)

## Dependencies
Production: express, pg, aws-sdk
Development: typescript, ts-node

## Recent Traces (10)
- ✓ anthropic: 2059ms
- ✓ openai: 3421ms
```

---

### 2. Trace Collection Server (`src/`)

**Purpose:** Receive, store, and serve execution traces

**Key Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/traces` | POST | SDK trace ingestion |
| `/api/v1/traces/:id` | GET | Fetch trace by ID |
| `/api/v1/context` | GET | Generate AI context |
| `/v1/messages` | POST | Bedrock proxy (Anthropic) |
| `/health` | GET | Health check |

**Internal Components:**
- `src/types/trace.ts` - ExecutionTraceBuilder (server tracing)
- `src/middleware/context.ts` - Request context middleware
- `src/db/save-trace.ts` - PostgreSQL persistence
- `src/server.ts` - Express API server

---

### 3. @adarsh/ai-runtime SDK (`sdk/`)

**Purpose:** Allow external applications to emit traces

**Installation:**
```bash
npm install @adarsh/ai-runtime
```

**Usage:**
```typescript
import { aiRuntime } from '@adarsh/ai-runtime';

// Manual tracing
const t = aiRuntime.trace('my-operation');
t.start('validation');
await validate();
t.end('validation');
await aiRuntime.sendTrace(t.complete());

// Auto-tracing
const tracedFn = aiRuntime.autoTrace('operation', async (data) => {
  return processData(data);
});
```

**Configuration:**
```bash
export AI_RUNTIME_ENDPOINT=http://localhost:3000/api/v1/traces
```

---

### 4. PostgreSQL Database

**Schema:**
```sql
CREATE TABLE execution_traces (
  id SERIAL PRIMARY KEY,
  trace_id TEXT UNIQUE NOT NULL,
  route TEXT NOT NULL,
  routing_ms INT,
  prompt_build_ms INT,
  adapter_ms INT,
  total_ms INT,
  status TEXT,
  error_message TEXT,
  project_root TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `idx_execution_traces_project_root` - Project isolation
- `idx_execution_traces_created_at` - Time-based queries
- `idx_execution_traces_route` - Route filtering

---

## Trace Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    External Application                       │
│                                                               │
│  import { aiRuntime } from '@adarsh/ai-runtime';            │
│                                                               │
│  const t = aiRuntime.trace('api-request');                   │
│  t.start('validation');                                       │
│  await validate();                                            │
│  t.end('validation');                                         │
│  await aiRuntime.sendTrace(t.complete());                    │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        │ HTTP POST /api/v1/traces
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Server (src/server.ts)                    │
│                                                               │
│  app.post('/api/v1/traces', async (req, res) => {           │
│    const tracePayload = req.body;                            │
│    saveTraceAsync(traceRow);                                 │
│    res.json({ status: 'ok' });                               │
│  });                                                          │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        │ INSERT
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                        │
│                                                               │
│  execution_traces (trace_id, route, ..., project_root)      │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        │ SELECT
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Context Generation                         │
│                                                               │
│  SELECT * FROM execution_traces                              │
│  WHERE project_root = '/path/to/project'                     │
│  ORDER BY created_at DESC LIMIT 10                           │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI-Ready Output                            │
│                                                               │
│  ## Recent Traces (10)                                       │
│  - ✓ GET /api/users: 45ms                                    │
│  - ✓ POST /api/orders: 123ms                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Naming Conventions

| Component | Package Name | Binary | Usage |
|-----------|-------------|--------|-------|
| CLI | `@adarsh/ai-runtime-cli` | `airuntime` | Command-line tool |
| SDK | `@adarsh/ai-runtime` | N/A | NPM package |
| Server | `developer-context-generator` | N/A | Main repository |

---

## Environment Variables

| Variable | Component | Purpose |
|----------|-----------|---------|
| `AI_RUNTIME_ENDPOINT` | SDK | Trace ingestion endpoint |
| `PORT` | Server | Server port (default: 3000) |
| `DATABASE_URL` | Server | PostgreSQL connection string |

---

## Project Isolation (Phase 7)

Each project's traces are isolated by `project_root`:

```sql
SELECT * FROM execution_traces
WHERE project_root = '/Users/adarsh/projects/my-app'
```

This ensures:
- TODO API traces don't appear in Express.js project
- Multiple projects can use the same server
- Context generation is project-specific

---

## Quick Reference

### Start the server
```bash
npm run build
npm start
```

### Use CLI from any project
```bash
cd ~/projects/my-app
airuntime prep --deep
```

### Add tracing to external application
```bash
npm install @adarsh/ai-runtime
```

```typescript
import { aiRuntime } from '@adarsh/ai-runtime';

aiRuntime.configure({
  endpoint: 'http://localhost:3000/api/v1/traces'
});

const t = aiRuntime.trace('my-operation');
t.start('step');
await work();
t.end('step');
await aiRuntime.sendTrace(t.complete());
```

---

## What This Is NOT

- ❌ Not a general-purpose APM tool
- ❌ Not a production monitoring system
- ❌ Not a distributed tracing platform

## What This IS

- ✅ Developer context generator for AI assistants
- ✅ Lightweight observability for understanding runtime behavior
- ✅ Project-scoped trace collection
- ✅ Simple integration via SDK

---

## Further Reading

- `docs/architecture/TRACEBUILDER_DESIGN.md` - TraceBuilder architecture decision
- `docs/SDK_IMPLEMENTATION.md` - SDK implementation details
- `AI_CONTEXT.md` - Complete project documentation
- `PROJECT_EVOLUTION.md` - Project history and phases
