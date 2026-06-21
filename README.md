# Developer Context Generator

**Get perfect AI context in 30 seconds.** Run `airuntime prep` to give AI assistants everything they need - no more manual explanations.

---

## New to This Repo? Start Here

**Read in this order:**

1. **README** (this file) - Project overview and quick start
2. **Constitution** (`.github/copilot-instructions.md`) - Engineering rules (5-10 min read)
3. **Architecture Scorecard** (`docs/architecture/ARCHITECTURE_SCORECARD.md`) - Current health metrics

**That's it. 15 minutes to productive.**

### If You're Refactoring

4. **Examples/patterns/** - Reusable patterns (e.g., `GOOD_FACTORY_FUNCTION.md`)
5. **Architecture Evidence Rule** - Read before creating new layers

### If You're Investigating

4. **Examples/retrospectives/** - Learn from actual refactoring sessions
5. **PROJECT_STRUCTURE_MAP.md** - Complete file inventory

### If You're Onboarding

**Your first task:** Add a new endpoint
- Estimated time: 20-30 minutes (with these docs)
- Required reading: README + Sections 1-3 above
- Success criteria: Endpoint works, tests pass, no boundary violations

---

## Repository Architecture

This repository contains multiple components:

```
developer-context-generator
│
├── airuntime CLI
│   └── Generates AI-ready project context
│
├── @adarsh/ai-runtime SDK
│   └── Lightweight tracing for external applications
│
├── Trace Collection Server
│   ├── Express API server
│   ├── AWS Bedrock proxy
│   └── Context generation API
│
└── PostgreSQL Database
    └── Stores execution traces
```

**Full architecture documentation:** `docs/architecture/README.md`

## Quick Start

```bash
# Install
npm install
npm run build
cd ai-runtime-cli && npm link

# Start server
npm start

# Use from anywhere
cd ~/Projects/my-app
airuntime prep
```

## Usage

```bash
# Basic context (file names + line counts + dependencies)
airuntime prep

# With file previews (first 20 lines)
airuntime prep --deep

# JSON output
airuntime prep --json

# Fetch specific trace
airuntime trace <trace-id>
```

## Example Output

```markdown
# Project: todo-api

## Git Status
Branch: main
Working tree clean

## Important Files (4)
- package.json (16 lines)
- src/auth.js (18 lines)
- src/db.js (14 lines)
- src/server.js (17 lines)

## Dependencies
**Production:** express, jsonwebtoken, mongoose
**Development:** jest, nodemon

## Recent Traces (10)
- ✓ anthropic: 2059ms
- ✓ anthropic: 2140ms

---
Ready for AI assistance.
```

## The Value Proposition

**Without this tool:**
```markdown
1. My project uses Express
2. It connects to MongoDB
3. There's JWT authentication
4. Main endpoints are /login and /register
5. Can you help me?
```
(10 minutes explaining + 20 minutes solving)

**With this tool:**
```bash
airuntime prep --deep
```
(10 seconds generating + 20 minutes solving)

AI sees evidence, not guesses.

## How It Works

```
Current Repository
      +
Git State
      +
Dependencies
      +
Key Files (with line counts)
      +
Code Samples (--deep flag)
      ↓
AI-Ready Context
```

**Key Features:**
- ✅ Zero configuration
- ✅ Works from any directory
- ✅ Detects file structure
- ✅ Extracts dependencies
- ✅ Shows code samples (--deep)
- ✅ Git status integration

## Tech Stack

- Node.js v20.20.0
- Express.js v4.19.2
- TypeScript 5.4.5
- PostgreSQL
- AWS Bedrock (optional)

## Documentation

- **docs/history/PROJECT_EVOLUTION.md** - Complete history and evolution
- **docs/README.md** - PRP workflow overview
- **docs/QUICK_REFERENCE.md** - Developer cheat sheet

## Built With

Evidence-driven development: Use it 20+ times before adding features.

**Usefulness Score:** 8.5/10

---

**Last Updated:** 2025-06-21 00:49:00
