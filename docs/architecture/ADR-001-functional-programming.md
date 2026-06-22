# ADR-001: Prefer Functional Programming Over Classes

**Date:** 2025-06-22
**Status:** Accepted
**Deciders:** Development Team

## Context

We need a consistent architectural approach for code structure across:
- SDK (sdk/)
- Server (src/)
- CLI (ai-runtime-cli/)

Historically, JavaScript/TypeScript codebases have mixed functional and object-oriented styles, leading to inconsistency in design patterns.

## Decision

**Prefer functions and composition by default.**

Use classes **only when one of these conditions is met**:
1. Framework requires classes (e.g., Express middleware, NestJS decorators)
2. Stateful lifecycle management (e.g., connection pools, resource managers)
3. External library integration demands classes (e.g., AWS SDK clients)

**The burden of proof is on the developer to justify class usage.**

---

### Rationale

#### Why Functional-First?

1. **Testability**
   - Pure functions are easier to test (no instance state)
   - No mocking class constructors or `this` context
   - Dependencies passed as parameters are explicit

2. **Composability**
   - Functions compose naturally: `pipe(f, g, h)`
   - No inheritance hierarchies to navigate
   - Easy to mix and match functionality

3. **Less Hidden State**
   - Factory functions return plain objects
   - No `this` binding confusion
   - State transitions are explicit

4. **Predictability**
   - No prototype chain surprises
   - No `new` keyword inconsistency (forgetting `new`)
   - Immutable data patterns easier to enforce

5. **Tree-Shaking**
   - Named function exports bundle smaller
   - Dead code elimination works better
   - No unused class methods bundled

---

## Examples

### Preferred Approach (Functional)

```typescript
// trace/create-trace.ts
export function createTrace(options: TraceOptions): Trace {
  return {
    id: generateTraceId(),
    ...options
  };
}

// trace/save-trace.ts
export async function saveTrace(trace: Trace): Promise<void> {
  return db.insert(trace);
}

// trace/index.ts - Composition
export const createAndSave = async (options: TraceOptions) => {
  const trace = createTrace(options);
  await saveTrace(trace);
  return trace;
};
```

**Benefits:**
- Clear separation of concerns (one file, one function)
- Easy to test in isolation
- No `this` context to manage
- Composable: `pipe(createTrace, validate, save)`

---

### Acceptable Class Usage (With Justification)

```typescript
// middleware/auth.ts
export class AuthMiddleware {
  constructor(private secret: string) {}
  
  async handle(req: Request, res: Response, next: NextFunction) {
    // Express middleware pattern requires class for DI
    const token = this.extractToken(req);
    req.user = await this.validateToken(token);
    next();
  }
  
  private extractToken(req: Request): string {
    // ...
  }
  
  private async validateToken(token: string): Promise<User> {
    // ...
  }
}
```

**Justification:** Framework integration (Express middleware) + stateful lifecycle (`secret` injected once, used many times)

---

### Avoid This (No Justification)

```typescript
// ❌ Bad: No framework requirement, no stateful lifecycle
export class TraceHelper {
  private options: TraceOptions;
  
  constructor(options: TraceOptions) {
    this.options = options;
  }
  
  create() {
    return { id: generateId(), ...this.options };
  }
  
  async save(trace: Trace) {
    return db.insert(trace);
  }
}

// Usage (verbose)
const helper = new TraceHelper(options);
const trace = helper.create();
await helper.save(trace);
```

**Problems:**
- Unnecessary `new` keyword
- Hidden state in `this.options`
- Harder to test (need to mock constructor)
- Not composable

**Should be:**
```typescript
// ✅ Better: Functional approach
export function createTrace(options: TraceOptions): Trace {
  return { id: generateId(), ...options };
}

export async function saveTrace(trace: Trace): Promise<void> {
  return db.insert(trace);
}

// Usage (simple)
const trace = createTrace(options);
await saveTrace(trace);
```

---

## Allowed Exceptions

Classes are **permitted without justification when**:

1. **Framework Integration**
   - Express middleware classes
   - NestJS controllers/services
   - TypeORM entities
   - React components (class-based)

2. **Stateful Lifecycle**
   - Connection pools (open/close lifecycle)
   - Resource managers (acquire/release)
   - Event emitters
   - Stream processors

3. **External Library Patterns**
   - AWS SDK clients
   - Database clients with connection state
   - API clients with configuration

---

## Consequences

### Positive
- **Smaller, focused modules** - One function per file becomes natural
- **Easier testing** - No mocking class instances or `this`
- **Better tree-shaking** - Functions bundle smaller than classes
- **Less boilerplate** - No constructors, `this`, or `new`
- **More explicit dependencies** - Passed as parameters, not injected
- **Easier refactoring** - Move functions freely, no inheritance chains

### Negative
- **Learning curve** - Developers used to OOP may need adjustment
- **Some library patterns expect classes** - Requires adapter functions
- **State management needs explicit design** - No implicit `this` context

### Neutral
- **Pattern libraries** - Need functional equivalents of Gang of Four patterns
- **Team conventions** - Must document when classes are acceptable

---

## Enforcement

### Automated
- **ESLint rule** (future): `prefer-functions-over-classes` warning for stateless classes
- **TypeScript strict mode:** Already enforces explicit types
- **Code reviews:** Checklist includes "Justify class usage" item

### Documentation
- **Layer 1:** `.github/copilot-instructions.md` - Constitutional rule
- **Layer 2:** `.github/prompts/typescript.prompt.md` - TypeScript-specific patterns
- **Layer 5:** This ADR - Decision record with examples

### Process
- PR template includes: "Classes used? [ ] Yes - Justification: ___"
- AI agents must check existing functional patterns before generating classes

---

## Alternatives Considered

### Alternative 1: Class-First with Functional Utilities
**Rejected.** Leads to God objects and service classes with no clear responsibility.

### Alternative 2: Pure Functional (No Classes Ever)
**Rejected.** Too restrictive for framework integration and stateful resources.

### Alternative 3: No Opinion (Let Developers Choose)
**Rejected.** Leads to inconsistent patterns across codebase, harder to maintain.

---

## Migration Strategy

### New Code
- All new modules **must follow functional-first** approach
- Class usage requires explicit justification in PR

### Existing Code
- **No forced refactoring** - Allow existing classes to remain
- **Refactor on touch** - When modifying a class, consider if function is better
- **Critical path first:** Priority refactor for frequently tested hot paths

### SDK Consideration
- SDK v0.1.0 has `TraceBuilder` class (acceptable: factory pattern)
- Future versions: Consider functional alternative: `createTrace()`, `withStage()`, `complete()`

---

## References

- **Implementation:** See `.github/copilot-instructions.md` for enforcement rules
- **Examples:** See `sdk/src/trace.ts` for functional trace creation
- **Contrast:** See `src/types/trace.ts` for server-side ExecutionTraceBuilder (justified: DB row mapping)

---

**See Also:**
- [TRACEBUILDER_DESIGN.md](./TRACEBUILDER_DESIGN.md) - Dual TraceBuilder rationale
- [SDK_IMPLEMENTATION.md](./SDK_IMPLEMENTATION.md) - SDK architectural choices
- [ADR-002](./ADR-002-error-handling.md) - Error handling patterns (future)

---

**Review Schedule:** Revisit this decision in 6 months (2025-12-22) to assess impact and adjust rules if needed.