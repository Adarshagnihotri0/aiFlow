---
applyTo: "sdk/**/*.ts"
---

## SDK Development Standards

### Backward Compatibility
- **No breaking changes** without major version bump
- **Deprecation path required** for removals (minimum 1 version cycle)
- **Version in JSDoc** - `@since 0.2.0`

### Public API Documentation
- **JSDoc mandatory** for all exports
- **Usage examples required** in doc comments
- **Parameter descriptions** for complex types

### Example:
```typescript
/**
 * Creates a new trace for tracking AI operation execution
 * @param operation - Operation name (e.g., 'generate-context')
 * @param metadata - Optional metadata to attach
 * @returns Trace object with unique ID
 * @since 0.1.0
 * @example
 * ```typescript
 * const trace = createTrace('process-request', { userId: '123' });
 * console.log(trace.id); // trace_1234567890_abc
 * ```
 */
export function createTrace(
  operation: string, 
  metadata?: Record<string, unknown>
): Trace {
  return { id: generateTraceId(), operation, ...metadata };
}
```

### Testing Requirements
- **All public APIs tested** - No untested exports
- **Examples must be runnable** - Copy-paste should work
- **Integration tests for HTTP calls** - Mock external services

### Error Handling
- **Structured error types** - No throwing plain strings
- **Error codes** for programmatic handling
- **Helpful messages** for debugging

### Export Patterns
- **Named exports only** - No default exports from SDK
- **Explicit type exports** - Every runtime export needs type export

```typescript
// ✅ Good
export function createTrace(options: TraceOptions): Trace { /* ... */ }
export type { Trace, TraceOptions };

// ❌ Bad
export default createTrace;  // No default exports
```

### Semver Compliance
- **PATCH:** Bug fixes, internal changes
- **MINOR:** New features, backward compatible
- **MAJOR:** Breaking changes

**Minor/Major changes require:** Change log entry + migration guide
