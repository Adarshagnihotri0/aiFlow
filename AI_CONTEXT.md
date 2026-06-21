# AI Runtime - Complete Project Documentation

## Project Overview

**Name:** AI Runtime Context Generator  
**Repository:** https://github.com/Adarshagnihotri0/aiFlow.git  
**Version:** 1.0.0  
**Status:** Production Ready  

### Purpose

A universal, zero-configuration context generator that enables AI assistants (ChatGPT, Claude, GitHub Copilot) to understand your project instantly. Combines static code analysis with runtime behavior tracing for comprehensive AI-ready context.

---

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: MCP Proxy                        │
│  Express API Gateway for AWS Bedrock/Anthropic translation   │
│  - Protocol translation (Anthropic ↔ Bedrock)                │
│  - Request/response streaming                                 │
│  - Execution tracing                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Layer 2: Trace SDK & Workflow                    │
│  Zero-dependency npm package for tracing execution           │
│  - Auto-trace middleware                                       │
│  - Stage-based timing                                          │
│  - Fire-and-forget persistence                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          Layer 3: Developer Context Generator                 │
│  AI-ready markdown generation from code + traces              │
│  - Static analysis (files, dependencies, git)                  │
│  - Runtime behavior (PostgreSQL traces)                        │
│  - Project-scoped isolation                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
mcp2.0/
├── ai-runtime-cli/           # CLI tool (airuntime command)
│   ├── dist/                 # Built CLI
│   ├── src/
│   │   └── index.ts          # CLI implementation
│   └── package.json
│
├── sdk/                      # Trace SDK (npm package)
│   ├── dist/                 # Built SDK
│   ├── src/
│   │   ├── client.ts         # HTTP client
│   │   ├── trace.ts          # Trace builder
│   │   ├── types.ts          # TypeScript types
│   │   └── index.ts          # Public API
│   └── tests/
│       └── sdk.test.ts
│
├── src/                      # MCP Proxy Server
│   ├── server.ts             # Main Express server
│   ├── adapters.ts           # Protocol adapters
│   ├── bedrock.ts            # AWS Bedrock client
│   ├── db/
│   │   ├── client.ts         # PostgreSQL connection
│   │   ├── save-trace.ts     # Trace persistence
│   │   └── save-trace-async.ts
│   ├── middleware/
│   │   └── context.ts        # Request context
│   ├── types/
│   │   ├── context.ts
│   │   └── trace.ts
│   └── utils/
│       ├── logger.ts
│       └── prompt-builder.ts
│
├── migrations/               # Database migrations
│   ├── 001_create_execution_traces.sql
│   └── 002_add_project_root.sql
│
└── docs/                     # Documentation
    ├── ARCHITECTURE.md
    ├── SDK_IMPLEMENTATION.md
    ├── PHASE_7_COMPLETE.md
    └── PHASE_7_VERIFICATION.md
```

---

## Key Features

### 1. Protocol Translation (Layer 1)
- **Anthropic to Bedrock**: Converts Anthropic Messages API to AWS Bedrock
- **OpenAI Compatible**: Handles chat/completions endpoints
- **Streaming Support**: SSE streaming for real-time responses
- **Zero Changes Required**: Works with existing AI tools

### 2. Execution Tracing (Layer 2)
- **Zero Dependencies**: Lightweight SDK with no external requirements
- **Stage-Based Timing**: Measure routing, prompt building, adapter execution
- **Auto-Trace Middleware**: Automatic request tracking for Express
- **Fire-and-Forget**: Async persistence that never blocks requests

### 3. Context Generation (Layer 3)
- **Static Analysis**: File scanning, dependency detection, git status
- **Runtime Behavior**: PostgreSQL traces showing actual API usage
- **Project Isolation**: Each project's traces stay isolated (Phase 7)
- **AI-Ready Output**: Formatted Markdown for instant AI comprehension

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | Node.js 20+ | Execution environment |
| **Framework** | Express.js | API server framework |
| **Database** | PostgreSQL 16 | Trace persistence |
| **AWS SDK** | @aws-sdk/client-bedrock-runtime | Bedrock integration |
| **Language** | TypeScript | Type safety |
| **CLI** | Commander.js | Command-line interface |

---

## Database Schema

### execution_traces Table

```sql
CREATE TABLE execution_traces (
  id SERIAL PRIMARY KEY,
  trace_id TEXT UNIQUE NOT NULL,
  route TEXT NOT NULL,
  
  -- Timing metrics (milliseconds)
  routing_ms INT,
  prompt_build_ms INT,
  adapter_ms INT,
  total_ms INT,
  
  -- Status
  status TEXT,
  error_message TEXT,
  
  -- Project isolation (Phase 7)
  project_root TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_execution_traces_project_root ON execution_traces(project_root);
CREATE INDEX idx_execution_traces_created_at ON execution_traces(created_at);
CREATE INDEX idx_execution_traces_route ON execution_traces(route);
```

---

## API Endpoints

### MCP Proxy Server (Port 3001)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/messages` | POST | Anthropic Messages API |
| `/v1/chat/completions` | POST | OpenAI Chat Completions |
| `/api/v1/traces` | POST | SDK trace ingestion |
| `/api/v1/context` | GET | Generate AI context |

---

## SDK Usage

### Installation

```bash
npm install @adarsh/ai-runtime
```

### Quick Start

```javascript
const aiRuntime = require('@adarsh/ai-runtime').aiRuntime;

// Configure SDK
aiRuntime.configure({
  endpoint: 'http://localhost:3001/api/v1/traces',
  silentErrors: true
});

// Auto-trace Express middleware
app.use((req, res, next) => {
  const route = `${req.method} ${req.path}`;
  req.trace = aiRuntime.trace(route);
  req.trace.start('request');
  
  res.on('finish', () => {
    req.trace.end('request');
    aiRuntime.sendTrace(req.trace.complete());
  });
  
  next();
});
```

---

## CLI Usage

### Commands

```bash
# Generate context for current project
airuntime prep

# Deep mode (includes file previews)
airuntime prep --deep

# Output as JSON
airuntime prep --json
```

---

## Development Phases

### Phase 7: Project-Scoped Tracing (Current)

**Status:** ✅ COMPLETE

**Changes:**
- Added `project_root` column to database
- SDK auto-captures project directory
- Server filters traces by project
- 100% project isolation achieved

**Testing Results:**
- Todo API: 10 traces correctly shown
- Express.js: 0 traces (perfect isolation)
- Zero cross-contamination verified

---

## Performance Metrics

- **Context generation:** < 1 second
- **SDK overhead:** < 1ms per request
- **DB write (async):** < 10ms (non-blocking)
- **Context query:** < 50ms with project_root index

---

## Getting Started

```bash
# Clone repository
git clone https://github.com/Adarshagnihotri0/aiFlow.git
cd aiFlow

# Install dependencies
npm install

# Build all components
npm run build

# Run database migrations
psql -d postgres -f migrations/001_create_execution_traces.sql
psql -d postgres -f migrations/002_add_project_root.sql

# Start server
npm start

# In any project, run
node ai-runtime-cli/dist/index.js prep --deep
```

---

## Troubleshooting

**No traces showing?**
- Verify SDK is configured
- Check `aiRuntime.sendTrace()` is called
- Ensure database migrations ran

**Wrong traces?**
- Verify `WHERE project_root = $1` in server.ts
- Check project_root column exists

---

**Last Updated:** 2026-06-21  
**Version:** 1.0.0  
**Status:** Production Ready ✅
