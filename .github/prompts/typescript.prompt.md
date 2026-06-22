---
applyTo: "**/*.ts"
---

## TypeScript Standards

### Type Safety
- **Avoid `any`** - Use `unknown` if type truly unknown
- **Prefer interfaces** for contracts: `interface User {}` over `type User = {}`
- **Explicit return types** for public functions
- **JSDoc required** for public APIs

### Type Assertions
- **No type assertions** unless justified in comment
- **No `as any`** unless documented with clear reason

**Bad:**
```typescript
const user = data as User;
```

**Good:**
```typescript
const user = data as User; // API contract guarantees User shape
```

### Strict Mode
- All TypeScript configs must have `"strict": true`
- No implicit any
- No loose null checks

### Export Patterns
- **Named exports preferred** over default exports
- **Explicit type exports** - Don't rely on inference alone

### Examples
```typescript
// ✅ Good: Interface for contract, JSDoc, explicit return type
/**
 * Validates trace input data
 * @param data - Unknown input to validate
 * @returns True if valid trace
 */
export function isValidTrace(data: unknown): data is Trace {
  return typeof data === 'object' && data !== null && 'id' in data;
}

// ❌ Bad: any type, no documentation
export function validate(input: any) {
  return input.id;  // Unsafe
}
```

### Type Guards Over Assertions
Prefer type guards over type assertions:

```typescript
// ✅ Prefer
function isUser(data: unknown): data is User {
  return typeof data === 'object' && data !== null && 'id' in data;
}

// ❌ Avoid
const user = data as User;
```
