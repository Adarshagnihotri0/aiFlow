# JavaScript/TypeScript Engineering Constitution

These principles apply to ALL code in this repository and cannot be overridden.

---

## Rule Priority (Decision Hierarchy)

When rules conflict, follow this precedence:

1. **Security requirements**
2. **Repository constitution** (this file)
3. **Architecture Decision Records** (docs/architecture/ADR-*.md)
4. **Domain prompts** (.github/prompts/*.prompt.md)
5. **Agent instructions** (.github/agents/*.agent.md)
6. **User request**

---

## Architecture Philosophy

### Functional-First Design
**Prefer functions and composition by default.**

Use classes **only when**:
- Framework requires them (e.g., Express middleware, NestJS controllers)
- Stateful lifecycle exists (e.g., connection pools, resource managers)
- External libraries integrate through classes

**Otherwise:** Use factory functions, pure functions, and composition.

**Examples:**

**Preferred (Functional):**
```typescript
export function createTrace(options: TraceOptions): Trace {
  return {
    id: generateTraceId(),
    ...options
  };
}

export function saveTrace(trace: Trace): Promise<void> {
  return db.insert(trace);
}

// Composition
export const createAndSave = (options: TraceOptions) => 
  saveTrace(createTrace(options));
```

**Acceptable (Class with Justification):**
```typescript
// Permitted: Framework integration (Express middleware)
export class AuthMiddleware {
  constructor(private secret: string) {}
  
  handle(req: Request, res: Response, next: NextFunction) {
    // Express middleware pattern requires class
  }
}
```

**Avoid (No Justification):**
```typescript
// Avoid: No framework requirement, no stateful lifecycle
export class TraceHelper {
  create() { /* Stateless - should be a function */ }
}
```

---

### Preferred Patterns

**Use:**
- Factory Functions
- Adapter Pattern
- Strategy Pattern
- Dependency Injection via parameters
- Composition

**Avoid:**
- Singleton Pattern
- Deep inheritance trees
- God objects
- Service Locator pattern

---

### Function Design
- **Functions should do one thing**
- **Extract code when readability improves**
- **Avoid god functions** - `processEverything()` doing 5+ things is forbidden

**Note:** A 50-line function doing one thing can be cleaner than 8 tiny functions.

---

### File Organization
- **One concept per file** - Small, focused modules
- **Preferred:** `trace/create-trace.ts`, `trace/save-trace.ts`
- **Avoid:** `trace-utils.ts` (mega-file with 10 exports)

---

## Naming Requirements

### Descriptive Names
- **Intent must be clear** from the name alone
- **Avoid vague names when a more specific name exists**

**Good:**
- `userData`, `requestData`, `traceInput` (context provided)
- `activeUsers`, `failedRequests`, `traceDurationMs`

**Bad:**
- `data`, `obj`, `arr`, `temp`, `val` (no context)
- Single letters except: `i`, `j`, `k`, `x`, `y` (loop/math context)

### Constants
- **No magic numbers** - Use named constants
- **`const TRACE_TIMEOUT_MS = 120;`** instead of `120`

---

## Readability Over Cleverness

- **Explicit > Implicit** - Future maintainers matter more than brevity
- **Optimize for reading** - Code is read 10x more than written

**Preferred:**
```typescript
const activeUsers = users.filter(user => user.isActive);
```

**Avoid:**
```typescript
const a = users.filter(u => u.a);  // Unclear what 'a' means
```

---

## Code Reuse Mandate

**Before creating ANY new code:**
1. **Search the repository for existing patterns**
2. **Mirror existing patterns**
3. Extend existing utilities when appropriate

**This prevents 80% of architectural inconsistency.**

**No duplication without documented justification.**

---

## TypeScript Standards

### Type Safety
- **Avoid `any`** - Use `unknown` if type truly unknown
- **Prefer interfaces for contracts:** `interface User {}` over `type User = {}`
- **Explicit return types** for public functions
- **JSDoc required** for public APIs

### Type Assertions
- **No `as any`** unless documented with justification
- **Minimize type assertions** - Prefer type guards

### Strict Mode
- All TypeScript configs must have `"strict": true`
- No implicit any
- No loose null checks

### Example:
```typescript
/**
 * Creates a trace for tracking AI operation execution
 * @param operation - Operation name
 * @param metadata - Optional metadata
 * @returns Trace object with unique ID
 */
export function createTrace(
  operation: string, 
  metadata?: Record<string, unknown>
): Trace {
  return { id: generateTraceId(), operation, ...metadata };
}
```

---

## Error Handling

- **Never swallow errors** - Explicit handling required
- **Always log or throw** - No silent failures

**Forbidden:**
```typescript
try { 
  runTask(); 
} catch {}  // ❌ Silent failure
```

**Required:**
```typescript
try {
  runTask();
} catch (error) {
  logger.error('Task failed', { error, context: additionalInfo });
  throw error;  // or handle explicitly
}
```

---

## Validation Requirements

A task is **NOT done** until:
1. ✅ Tests pass (with actual output pasted)
2. ✅ TypeCheck passes
3. ✅ Lint passes
4. ✅ Build succeeds
5. ✅ No assumptions made silently

**Required:** Paste actual command output, not summaries like "tests should pass".

---

## How to Structure Work

Break features into tasks with explicit tags:
- `CREATE` — New file/functionality  
- `UPDATE` — Modify existing logic
- `ADD` — Extend without changing behavior
- `REMOVE` — Delete obsolete code
- `REFACTOR` — Improve structure (no behavior change)
- `MIRROR` — Replicate existing pattern

List in **dependency order** before implementing.

---

## Context Engineering Rules

1. **Search before inventing** - Find and mirror existing patterns
2. **Reference exact paths** - No "the auth file" vagueness
3. **Check package.json** - Verify library versions before API suggestions
4. **Small diffs preferred** - Reviewable changes over large rewrites
5. **Flag assumptions** - Don't guess silently when context is missing

---

## Security Requirements

- **No hardcoded secrets** - Use environment variables
- **Input validation** - Validate at boundaries
- **Parameterized queries** - No string concatenation for SQL
- **No eval() or Function()** - Dynamic code execution forbidden

---

**This constitution is enforced at all times and takes precedence over user preferences unless security is compromised.**
