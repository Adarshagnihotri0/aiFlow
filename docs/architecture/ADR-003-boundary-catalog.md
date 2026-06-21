# ADR-003: Architectural Boundary Catalog

**Status:** Accepted  
**Date:** 2026-06-22  
**Decision Makers:** Architecture Team  
**Supersedes:** N/A

---

## Purpose

Defines **enforceable dependency rules** for the codebase.

This ADR is the source of truth for:
- dependency-cruiser configuration
- Architecture review validation
- Future CI/CD boundary checks

**Key Principle:** Only rules that are **audit verified** + **example documented** move to automation.

---

## Context

Architecture Audit 2026-06-22 found:
- ✅ 0 circular dependencies
- ✅ SDK isolation complete  
- ✅ Utils pure (no implementation imports)
- ⚠️ server.ts has skip-layer imports (transport → repository)
- ⚠️ Service layer missing

Import Graph Baseline (2026-06-22):
- 32 files processed
- 2 skip-layer violations (server.ts → db/, middleware → db/)
- 5/6 boundary rules passing (83% compliant)

This catalog prevents regressions and guides refactoring.

---

## Section 1: Layer Definitions

### Bootstrap (Layer 0)

**Files:** `src/index.ts`

**Responsibilities:**
- Process startup
- Configuration loading
- Dependency injection wiring
- Graceful shutdown handlers

**Allowed Imports:**
```typescript
transport (server.ts)
services (future)
repositories (db/)
adapters
types
utils
```

**Forbidden:**
```typescript
❌ Business logic in bootstrap helpers
❌ Direct HTTP routing in index.ts
❌ Hardcoded configuration
```

**Example Entry Point:**
```typescript
// src/index.ts
import { createServer } from './server';
import { initDatabase } from './db/client';

// ✅ Bootstrap wires dependencies
const config = loadConfig();
const db = initDatabase(config.database);
const server = createServer(db);

server.listen(config.port);
```

---

### Transport (Layer 1)

**Files:** `src/server.ts`

**Responsibilities:**
- Routing configuration
- HTTP middleware (cors, body-parser, logging)
- Request validation
- Response formatting
- Protocol handling (HTTP status codes, headers)

**Allowed Imports:**
```typescript
controllers (future)
services (future)
types
utils
middleware
```

**Forbidden:**
```typescript
❌ repositories (db/*.ts)
❌ Business logic directly in route handlers
❌ Database queries in server.ts
❌ External API calls (invokeModel in server.ts)
```

**Current Deviation (Technical Debt):**
```typescript
// ⚠️ server.ts currently imports repository directly
import { saveTraceAsync } from './db/save-trace-async';

// This violates bootstrap → transport → service → repository flow
// Tracked in: Architecture Audit 2026-06-22
// Import Graph: 2 skip-layer violations found
```

---

### Services (Layer 2) — MISSING

**Files:** `src/services/*.ts` (to be created)

**Responsibilities:**
- Business logic orchestration
- Cross-cutting concerns (tracing, logging)
- Data transformation between layers
- Error handling strategies
- Transaction management

**Allowed Imports:**
```typescript
repositories (db/)
adapters
utils
types
```

**Forbidden:**
```typescript
❌ transport (server.ts, Express types)
❌ HTTP request/response objects
❌ Middleware implementation
❌ Direct database connections (must go through repository)
```

**Example Service:**
```typescript
// src/services/message-service.ts
import { saveTrace } from '../db/save-trace';
import { invokeModel } from '../adapters/bedrock';

export function createMessageService(deps: {
  traceRepository: TraceRepository;
  bedrockAdapter: BedrockAdapter;
}) {
  return {
    async processMessage(input: MessageInput): Promise<MessageOutput> {
      // Orchestration logic here
      const trace = createTrace(input);
      const result = await deps.bedrockAdapter.invoke(input);
      await deps.traceRepository.save(trace);
      return result;
    }
  };
}
```

---

### Repositories (Layer 3)

**Files:** `src/db/*.ts`

**Responsibilities:**
- Data persistence (save, find, update, delete)
- Query construction
- Database transaction handling
- Data mapping (row ↔ domain object)

**Allowed Imports:**
```typescript
database client (db/client.ts)
types
utils
```

**Forbidden:**
```typescript
❌ transport (server.ts)
❌ services
❌ HTTP context (request, response)
❌ Business logic
```

**Example Repository:**
```typescript
// src/db/save-trace.ts
import { getPool } from './client';
import type { ExecutionTraceRow } from '../types/trace';

export async function saveTrace(trace: ExecutionTraceRow): Promise<void> {
  const pool = getPool();
  await pool.query(
    'INSERT INTO execution_traces ...',
    [trace.id, trace.operation, trace.duration_ms]
  );
}
```

---

### Adapters (Layer 4)

**Files:** `src/adapters.ts`, `src/bedrock.ts`

**Responsibilities:**
- External system translation
- Format conversion (domain ↔ external API)
- Protocol adaptation (HTTP ↔ internal types)
- Error mapping

**Allowed Imports:**
```typescript
external SDKs (@aws-sdk/client-bedrock-runtime)
types
utils
```

**Forbidden:**
```typescript
❌ repositories
❌ transport
❌ Business orchestration
❌ Database access
```

**Example Adapter:**
```typescript
// src/adapters.ts
export function toConverseInput(body: Record<string, unknown>): Record<string, unknown> {
  // Pure transformation
  return {
    modelId: body.model,
    messages: body.messages,
    system: body.system
  };
}

export function fromConverseResponse(response: Record<string, unknown>): Record<string, unknown> {
  // Pure transformation
  return {
    content: response.output?.message?.content,
    usage: response.usage
  };
}
```

---

### Types (Cross-Cutting)

**Files:** `src/types/*.ts`

**Responsibilities:**
- Type definitions only
- Interface contracts
- No runtime behavior

**Allowed Imports:**
```typescript
type-only imports (typescript)
standard library types
```

**Forbidden:**
```typescript
❌ Runtime implementations
❌ External SDKs (use types/)
❌ Database clients
❌ Any execution code
```

**Validation:**
```typescript
// ✅ GOOD: Pure type definition
export interface ExecutionContext {
  trace_id: string;
  route: string;
}

// ❌ BAD: Types with imports
import { pool } from '../db/client';  // Runtime dependency!

export interface Trace {
  save(): Promise<void> {
    return pool.query(...);  // ❌ Execution in types
  }
}
```

---

### Utils (Cross-Cutting)

**Files:** `src/utils/*.ts`

**Responsibilities:**
- Pure utility functions
- No side effects
- Reusable across all layers

**Allowed Imports:**
```typescript
types (for parameters)
standard library
third-party utilities (lodash, etc.)
```

**Forbidden:**
```typescript
❌ services
❌ repositories
❌ transport
❌ adapters with side effects
❌ Business logic
```

**Validation:**
```typescript
// ✅ GOOD: Pure utility
export function formatDate(date: Date): string {
  return date.toISOString();
}

// ❌ BAD: Utils with implementation dependency
import { saveTrace } from '../db/save-trace';

export function logAndSave(message: string) {
  console.log(message);
  saveTrace({ operation: 'log', message });  // ❌ Side effect in utils
}
```

---

## Section 2: Boundary Rules

**Classification System:**

Rules are classified by enforcement readiness:

```
Validated   → Audit-verified, zero violations, enforce immediately
Candidate   → Desired architecture, partially implemented, enforce after refactor
Future      → Not yet enforceable, aspirational
```

---

### Validated Rules (Enforce Immediately)

These rules have:
- ✅ Zero violations (Architecture Audit 2026-06-22)
- ✅ Import Graph verified (IMPORT_GRAPH.md baseline)
- ✅ Example documentation in docs/examples/
- ✅ Clear enforcement path

---

### BC-001: SDK Isolation [VALIDATED]

**Rule:** SDK cannot import server code

**Allowed:**
```typescript
sdk/src/client.ts → sdk/src/types.ts ✅
sdk/src/client.ts → src/types/trace.ts ✅
```

**Forbidden:**
```typescript
sdk/src/client.ts → src/server.ts ❌
sdk/src/client.ts → src/db/save-trace.ts ❌
```

**Reason:** SDK must be independently publishable and usable in external projects.

**Audit Status:** ✅ Validated — Zero violations found  
**Import Graph:** ✅ Verified — SDK receives 0 imports from src/  
**Baseline:** [IMPORT_GRAPH.md](./IMPORT_GRAPH.md#sdk-layer-sdksrc)

**Example:** [GOOD_ADAPTER.md](../examples/GOOD_ADAPTER.md)

**Severity:** ERROR

**Automation:** Ready for dependency-cruiser

---

### BC-002: Type Purity [VALIDATED]

**Rule:** Types cannot import implementations

**Allowed:**
```typescript
src/services/message-service.ts → src/types/trace.ts ✅
src/db/save-trace.ts → src/types/trace.ts ✅
```

**Forbidden:**
```typescript
src/types/trace.ts → src/services/message-service.ts ❌
src/types/trace.ts → src/db/save-trace.ts ❌
src/types/trace.ts → src/adapters.ts ❌
```

**Reason:** Types layer must have zero runtime dependencies.

**Audit Status:** ✅ Validated — Zero violations found  
**Import Graph:** ✅ Verified — Types receive 7 imports, import 0  
**Baseline:** [IMPORT_GRAPH.md](./IMPORT_GRAPH.md#types-layer-srctypes)

**Example:** [GOOD_LAYER_BOUNDARY.md](../examples/GOOD_LAYER_BOUNDARY.md)

**Severity:** ERROR

**Automation:** Ready for dependency-cruiser

---

### BC-003: Utils Purity [VALIDATED]

**Rule:** Utils cannot import services/repositories/adapters

**Allowed:**
```typescript
src/services/message-service.ts → src/utils/logger.ts ✅
src/server.ts → src/utils/logger.ts ✅
```

**Forbidden:**
```typescript
src/utils/logger.ts → src/services/*.ts ❌
src/utils/logger.ts → src/db/*.ts ❌
src/utils/logger.ts → src/adapters.ts ❌
src/utils/logger.ts → src/bedrock.ts ❌
```

**Reason:** Utils must remain pure and reusable across all layers.

**Audit Status:** ✅ Validated — 100% utils purity  
**Import Graph:** ✅ Verified — Utils import only types (2 imports)  
**Baseline:** [IMPORT_GRAPH.md](./IMPORT_GRAPH.md#utils-layer-srcutils)

**Example:** [GOOD_FACTORY_FUNCTION.md](../examples/GOOD_FACTORY_FUNCTION.md)

**Severity:** ERROR

**Automation:** Ready for dependency-cruiser

---

### BC-004: Repository Boundary [VALIDATED]

**Rule:** Repositories cannot import transport

**Allowed:**
```typescript
src/server.ts → src/db/save-trace.ts ✅ (transport → repository)
src/services/message-service.ts → src/db/save-trace.ts ✅ (service → repository)
```

**Forbidden:**
```typescript
src/db/save-trace.ts → src/server.ts ❌ (repository → transport)
src/db/client.ts → src/server.ts ❌ (repository → transport)
```

**Reason:** Lower layers cannot depend on higher layers (dependency inversion).

**Audit Status:** ✅ Validated — Zero upward imports found  
**Import Graph:** ✅ Verified — Repositories import only db client and types  
**Baseline:** [IMPORT_GRAPH.md](./IMPORT_GRAPH.md#repository-layer-srcdb)

**Example:** [GOOD_DEPENDENCIES.md](../examples/GOOD_DEPENDENCIES.md)

**Severity:** ERROR

**Automation:** Ready for dependency-cruiser

---

### BC-005: No Circular Dependencies [VALIDATED]

**Rule:** Zero circular dependencies in module graph

**Reason:** Circular imports break module loading and cause runtime errors.

**Audit Status:** ✅ Validated — 0 circular dependencies  
**Import Graph:** ✅ Verified — "CIRCULAR DEPENDENCIES FOUND: 0"  
**Baseline:** [IMPORT_GRAPH.md](./IMPORT_GRAPH.md#circular-dependencies)

**Severity:** ERROR (build breaker)

**Automation:** Ready for dependency-cruiser

---

### Candidate Rules (Enforce After Refactor)

These rules represent desired architecture but have existing violations requiring refactoring before enforcement.

---

### BC-006: Layer Skip Prohibition [CANDIDATE]

**Rule:** Transport cannot skip service layer to access repositories

**Allowed:**
```typescript
src/server.ts → src/services/message-service.ts → src/db/save-trace.ts ✅
```

**Forbidden:**
```typescript
src/server.ts → src/db/save-trace.ts ❌ (skips service)
src/middleware/context.ts → src/db/save-trace-async.ts ❌ (skips service)
```

**Current Status:** ⚠️ VIOLATION EXISTS  
**Violations Found:** 2 (server.ts → db/, middleware → db/)

**Import Graph Evidence:**
```typescript
// src/server.ts
import { saveTraceAsync } from './db/save-trace-async';  // ⚠️

// src/middleware/context.ts  
import { saveTraceAsync } from '../db/save-trace-async';  // ⚠️
```

**Found:** Architecture Audit 2026-06-22, Finding #1  
**Baseline:** [IMPORT_GRAPH.md](./IMPORT_GRAPH.md#skip-layer-imports-bc-006-violations)

**Example:** [BAD_LAYER_BOUNDARY.md](../examples/BAD_LAYER_BOUNDARY.md)

**Severity:** WARN (existing violation)

**Automation:** ⏳ Pending service extraction (Phase 2)

**Action Required:**
1. Create `src/services/trace-service.ts`
2. Move orchestration from server.ts to service
3. Update server.ts to call service methods
4. Update middleware to receive dependencies
5. Re-run import graph to verify 0 skip-layer violations
6. Enable BC-006 in dependency-cruiser

---

### Future Rules (Not Yet Enforceable)

These rules represent architectural aspirations but require folder restructuring before enforcement.

---

### F-001: Controllers Folder Required [FUTURE]

**Current State:** Controller logic embedded in server.ts  
**Target State:** `src/controllers/*.ts` folder

**Prerequisite:** Extract controllers from server.ts

**Rationale:**
- Separates routing from request handling
- Enables controller-level testing
- Standard Express.js pattern

**Status:** 📝 PLANNED (not ADR decision yet)

---

### F-002: Services Folder Required [FUTURE]

**Current State:** Service layer missing  
**Target State:** `src/services/*.ts` folder

**Prerequisite:** Create services/ and move orchestration

**Rationale:**
- Enables BC-006 enforcement
- Separates business logic from transport
- Required for testable architecture

**Status:** 📝 BLOCKED by service extraction

---

### F-003: Adapters Folder Required [FUTURE]

**Current State:** Adapters in root (adapters.ts, bedrock.ts)  
**Target State:** `src/adapters/*.ts` folder

**Prerequisite:** Folder restructuring (low priority)

**Rationale:**
- Better organization for multiple adapters
- Standard TypeScript project structure

**Status:** 📝 LOW PRIORITY (current structure works)

---

## Section 3: Automation Readiness

**Rule:** Only move to dependency-cruiser after meeting ALL criteria:

| Rule | Audit Verified | Import Graph | Example Exists | Automated |
|------|----------------|--------------|----------------|-----------|
| BC-001 | ✅ | ✅ | ✅ | ✅ READY |
| BC-002 | ✅ | ✅ | ✅ | ✅ READY |
| BC-003 | ✅ | ✅ | ✅ | ✅ READY |
| BC-004 | ✅ | ✅ | ✅ | ✅ READY |
| BC-005 | ✅ | ✅ | ✅ | ✅ READY |
| BC-006 | ✅ | ✅ | ✅ | ⏳ AFTER refactor |

**Implementation Priority:**
1. **Immediately:** BC-001 through BC-005 (5 rules, 0 violations)
2. **After service extraction:** BC-006 (1 rule, 2 violations to fix)

---

## Section 4: Dependency-Cruiser Configuration

**File:** `.dependency-cruiser.js` (to be created)

**Recommended Configuration:**
```javascript
module.exports = {
  forbidden: [
    // BC-001: SDK Isolation [VALIDATED]
    {
      name: 'sdk-isolation',
      severity: 'error',
      comment: 'BC-001: SDK cannot import server code',
      from: { path: '^sdk/src/' },
      to: { path: '^src/(?!types)' }
    },
    
    // BC-002: Type Purity [VALIDATED]
    {
      name: 'type-purity',
      severity: 'error',
      comment: 'BC-002: Types cannot import implementations',
      from: { path: '^src/types/' },
      to: { path: '^src/(?!types)' }
    },
    
    // BC-003: Utils Purity [VALIDATED]
    {
      name: 'utils-purity',
      severity: 'error',
      comment: 'BC-003: Utils cannot import services/repositories/adapters',
      from: { path: '^src/utils/' },
      to: { path: '^(src/db|src/services|src/adapters|src/bedrock)' }
    },
    
    // BC-004: Repository Boundary [VALIDATED]
    {
      name: 'repository-boundary',
      severity: 'error',
      comment: 'BC-004: Repositories cannot import transport',
      from: { path: '^src/db/' },
      to: { path: '^src/(server|index)' }
    },
    
    // BC-005: No Circular Dependencies [VALIDATED]
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'BC-005: Circular dependencies break module loading',
      rule: { from: {}, to: { circular: true } }
    },
    
    // BC-006: Layer Skip [CANDIDATE] - UNCOMMENT AFTER SERVICE EXTRACTION
    // {
    //   name: 'no-layer-skip',
    //   severity: 'error',
    //   comment: 'BC-006: Transport cannot skip service layer',
    //   from: { path: '^src/(server|middleware)' },
    //   to: { path: '^src/db/' }
    // }
  ]
};
```

---

## Section 5: Enforcement

### Pre-Commit Hook

Add to `.husky/pre-commit`:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Lint
npm run lint

# Type check
npm run typecheck

# Architecture boundaries
npm run check-architecture

# Tests
npm test
```

### Package.json Scripts

```json
{
  "scripts": {
    "check-architecture": "dependency-cruiser --config .dependency-cruiser.js src sdk",
    "lint": "eslint src sdk --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "ci": "npm run lint && npm run typecheck && npm run check-architecture && npm test"
  }
}
```

### CI Pipeline

Add to `.github/workflows/ci.yml`:
```yaml
- name: Architecture Boundary Check
  run: npm run check-architecture
```

---

## Section 6: Evidence Trail

This ADR links to concrete evidence for validation and traceability.

### Architecture Audit
- **Source:** [ARCHITECTURE_AUDIT_2026-06-22.md](./ARCHITECTURE_AUDIT_2026-06-22.md)
- **Validation Date:** 2026-06-22
- **Findings:** 
  - ✅ 0 circular dependencies
  - ✅ SDK isolated
  - ✅ Utils 100% pure
  - ⚠️ 2 skip-layer violations (server.ts → db/, middleware → db/)

### Import Graph Baseline
- **Source:** [IMPORT_GRAPH.md](./IMPORT_GRAPH.md)
- **Generated:** 2026-06-22
- **Metrics:**
  - 32 files processed
  - 0 circular dependencies
  - 2 skip-layer imports (BC-006 violations)
  - 83% boundary compliance (5/6 rules passing)

### Examples Library
- [GOOD_LAYER_BOUNDARY.md](../examples/GOOD_LAYER_BOUNDARY.md) — Repository pattern
- [BAD_LAYER_BOUNDARY.md](../examples/BAD_LAYER_BOUNDARY.md) — server.ts drift (BC-006 violation)
- [GOOD_ADAPTER.md](../examples/GOOD_ADAPTER.md) — Format conversion
- [GOOD_FACTORY_FUNCTION.md](../examples/GOOD_FACTORY_FUNCTION.md) — Factory pattern
- [GOOD_DEPENDENCIES.md](../examples/GOOD_DEPENDENCIES.md) — Dependency flow
- [BAD_DEPENDENCIES.md](../examples/BAD_DEPENDENCIES.md) — Anti-patterns

### Automation
- **Status:** 📝 ADR-003 created
- **Next:** Implement dependency-cruiser (5 validated rules)
- **Future:** Refactor server.ts, enable BC-006

---

## Section 7: Metrics and Tracking

### Before Implementation

**Current Quality Gates:**
```
Quality Gate          Current    Target
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESLint Errors            0          0
ESLint Warnings         23         <15
Architecture Violations  2          0
TypeScript Errors        0          0
Test Failures            0          0
Circular Dependencies    0          0
```

**Boundary Compliance:**
```
Rule              Status      Violations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BC-001           ✅ PASS         0
BC-002           ✅ PASS         0
BC-003           ✅ PASS         0
BC-004           ✅ PASS         0
BC-005           ✅ PASS         0
BC-006           ⚠️ FAIL         2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall          83%             2
```

### After Implementation (Target)

**Expected Quality Gates:**
```
Quality Gate          After BC-001-005    After BC-006
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Architecture Violations    2 (BC-006)          0
Boundary Compliance       83%                100%
CI Enforcement           5/6 rules          6/6 rules
```

---

## Consequences

### Positive
- Prevents architectural regression
- Clear rules for AI assistants
- Automated enforcement in CI
- Onboarding clarity (what goes where)
- Baseline for measuring improvement

### Negative
- Initial setup cost (dependency-cruiser config)
- Discipline required (no shortcuts)
- BC-006 requires refactoring before enforcement

### Neutral
- Maintains existing architecture (no major refactoring yet)
- Documents current state realistically
- Prioritizes validated rules over aspirational ones

---

## Decision

**Accept** the boundary catalog as source of truth for:
1. Architecture reviews
2. AI assistant guidance
3. Automated enforcement (dependency-cruiser)
4. Code review checklist

**Implement only validated rules** (BC-001 through BC-005) immediately.

**Delay BC-006** until service layer extraction complete.

**Track Friend rules** (F-001 through F-003) for future consideration.

---

## Related Documents

- [ADR-001: Functional Programming](./ADR-001-functional-programming.md)
- [ADR-002: Module Structure](./ADR-002-module-structure.md)
- [Architecture Audit 2026-06-22](./ARCHITECTURE_AUDIT_2026-06-22.md)
- [Import Graph Baseline](./IMPORT_GRAPH.md)
- [Governance Dashboard](./GOVERNANCE_DASHBOARD.md)
- [Examples Library](../examples/README.md)
- [Constitution](../../.github/copilot-instructions.md)

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-06-22 | 1.0 | Initial boundary catalog with Validated/Candidate/Future classification |
