# Code Review Checklist

Use this checklist for all pull requests and AI-generated code.

---

## Architecture & Design

- [ ] **Functions preferred over classes** (unless justified in ADR-001)
- [ ] **Functions do one thing** (extract when readability improves)
- [ ] **Files are focused** (one concept per file)
- [ ] **No god functions/objects** - `processEverything()` forbidden
- [ ] **Composition over inheritance** - No deep hierarchies

---

## Naming & Readability

- [ ] **Descriptive names** - No `data`, `obj`, `arr`, `temp`, `val`
- [ ] **Self-documenting code** - Names explain intent
- [ ] **No clever one-liners** - Explicit > Implicit
- [ ] **Constants named** - No magic numbers (`120` → `TRACE_TIMEOUT_MS`)
- [ ] **Context in names** - `userData` okay, `data` vague

---

## Code Reuse

- [ ] **Searched existing implementations** before creating new code
- [ ] **Reused established patterns** - Mirror existing structures
- [ ] **No duplication** - Or documented justification for duplication
- [ ] **Extended existing utilities** instead of creating new ones

---

## TypeScript Standards

- [ ] **No `any` types** (use `unknown` if truly unknown)
- [ ] **Prefer interfaces** over type aliases for contracts
- [ ] **Explicit return types** for public functions
- [ ] **JSDoc comments** for public APIs
- [ ] **Strict mode enabled** in tsconfig
- [ ] **Type guards over assertions** - Prefer `isUser(data)` over `data as User`

---

## Error Handling

- [ ] **No swallowed errors** - All catches log or rethrow
- [ ] **Meaningful error messages** - Context included
- [ ] **Structured error responses** - No generic "Error"
- [ ] **Early validation** - Fail fast at boundaries
- [ ] **Logged with context** - Include trace ID, user ID

---

## Testing

- [ ] **Tests written** for new functionality
- [ ] **Real test output pasted** - Not "tests should pass"
- [ ] **Edge cases covered** - Happy path + error cases
- [ ] **No skipped tests** - Or documented justification
- [ ] **Examples runnable** - Doc examples must work

---

## Documentation

- [ ] **JSDoc added** for public exports
- [ ] **README updated** for new features
- [ ] **Examples provided** in doc comments
- [ ] **No stale documentation** - Docs match code
- [ ] **API changes documented** in changelog

---

## Validation

Run these commands before marking complete:

```bash
npm run typecheck  # TypeScript strict mode
npm run lint       # ESLint rules (when configured)
npm test           # All tests pass
npm run build      # Production build succeeds
```

- [ ] **TypeCheck passes**
- [ ] **Lint passes** (or documented violations)
- [ ] **Tests pass** (actual output pasted)
- [ ] **Build succeeds**

---

## Security & Performance

- [ ] **No hardcoded secrets** - Use environment variables
- [ ] **Input validated** - Validate at boundaries
- [ ] **Parameterized queries** - No SQL string concatenation
- [ ] **No eval()** - Dynamic code execution forbidden
- [ ] **No blocking I/O** in hot paths
- [ ] **Error messages safe** - No stack traces to users

---

## Architecture-Specific Checks

### For SDK Code (`sdk/**/*.ts`)
- [ ] **Backward compatible** - No breaking changes without major version
- [ ] **All exports documented** - JSDoc + examples
- [ ] **Named exports only** - No default exports
- [ ] **Types exported** - Every runtime export has type export

### For API Code (`src/**/*.ts`)
- [ ] **No business logic in controllers** - Services own logic
- [ ] **Controllers only orchestrate** - Validate, format, delegate
- [ ] **Services have no HTTP types** - Domain types only
- [ ] **Structured error format** - Consistent API responses

### For New Files
- [ ] **Mirrors existing structure** - Matches folder organization
- [ ] **One concept per file** - Focused modules
- [ ] **Follows naming conventions** - Consistent with codebase

---

## Pattern Checklist

**Use these patterns:**
- [ ] Factory Functions (e.g., `createTrace()`)
- [ ] Adapter Pattern (for external APIs)
- [ ] Strategy Pattern (for algorithms)
- [ ] Dependency Injection via parameters

**Avoid these patterns:**
- [ ] ~~Singleton Pattern~~
- [ ] ~~Deep inheritance trees~~
- [ ] ~~God objects~~
- [ ] ~~Service Locator~~

---

## Reviewer Notes

**Use this section during review:**

### Strengths
- [List what was done well]

### Concerns
- [List issues requiring changes]

### Questions
- [List clarifications needed]

### Justification Required
- [Classes used? If yes, justify: ___]
- [Duplication? If yes, justify: ___]
- [Any skipped? If yes, justify: ___]

---

## Final Sign-Off

**Reviewer:** ___________________  
**Date:** ___________________  
**Status:** 
- [ ] ✅ Approved  
- [ ] ⚠️ Needs Changes  
- [ ] ❌ Blocked

**Comments:**
_____________________________________

---

**Remember:** This checklist catches things prompts and linters can't. When in doubt, ask: "Would a new developer understand this code in 6 months?"