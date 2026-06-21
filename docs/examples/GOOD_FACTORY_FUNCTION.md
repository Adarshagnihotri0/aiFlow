# ✅ GOOD: Factory Function Pattern

## Real Example from Codebase

**File:** `src/utils/logger.ts`  
**Pattern:** Factory function for context-aware logger

### The Pattern

```typescript
// ✅ GOOD: Factory function, not class
// File: src/utils/logger.ts

import winston from 'winston';
import type { ExecutionContext } from '../types/context';

/**
 * Create base Winston logger instance
 * Single responsibility: Configure logger
 */
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bedrock-proxy' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, trace_id, ...meta }) => {
          const tracePrefix = trace_id && typeof trace_id === 'string' ? `[${trace_id}] ` : '';
          const ts = typeof timestamp === 'string' ? timestamp : String(timestamp);
          const lvl = typeof level === 'string' ? level : String(level);
          const msg = typeof message === 'string' ? message : String(message);
          return `${ts} ${lvl}: ${tracePrefix}${msg} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    })
  ]
});

/**
 * Logger interface with context support
 * Defines contract, not implementation
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Create a context-aware logger that automatically injects trace_id
 * Factory function: Returns configured logger instance
 */
export function createContextLogger(context: ExecutionContext): Logger {
  const log = (level: string, message: string, meta: Record<string, unknown> = {}): void => {
    baseLogger.log(level, message, {
      trace_id: context.trace_id,
      route: context.route,
      ...meta
    });
  };

  return {
    info: (msg, meta) => log('info', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta)
  };
}

/**
 * Export base logger for system-level logs
 * Alternative export for different use cases
 */
export const logger = baseLogger;
```

## Why This Is GOOD

### 1. Factory Function, Not Class

**Problem it solves:** Need logger with context (trace_id, route)

**Why not class:**
```typescript
// ❌ BAD: Unnecessary class
export class ContextLogger {
  private context: ExecutionContext;
  
  constructor(context: ExecutionContext) {
    this.context = context;
  }
  
  info(message: string, meta?: Record<string, unknown>) {
    baseLogger.log('info', message, {
      trace_id: this.context.trace_id,
      ...meta
    });
  }
  
  // ... more methods
}

// Usage requires new
const logger = new ContextLogger(context);  // ❌ More ceremony
```

**Why factory is better:**
```typescript
// ✅ GOOD: Factory function
const logger = createContextLogger(context);  // ✅ Simpler

// No `new` keyword
// No `this` binding
// Same functionality
```

### 2. No Stateful Lifecycle

**Check:** Does this need state management?

```typescript
// Logger doesn't need:
// ❌ Connection pooling
// ❌ Lifecycle hooks
// ❌ Complex initialization
// ❌ Framework integration

// Logger just needs:
// ✅ Configuration injection
// ✅ Return object with methods
```

**Conclusion:** Factory function sufficient.

### 3. Closure for Encapsulation

```typescript
export function createContextLogger(context: ExecutionContext): Logger {
  // Private log function
  const log = (level: string, message: string, meta: Record<string, unknown> = {}): void => {
    baseLogger.log(level, message, {
      trace_id: context.trace_id,  // Injected automatically
      route: context.route,
      ...meta
    });
  };

  // Public API
  return {
    info: (msg, meta) => log('info', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta)
  };
}
```

**Benefits:**
- `log` function is private
- External code can't access internals
- Clean API surface (only 4 methods)

### 4. Explicit Return Type

```typescript
export function createContextLogger(context: ExecutionContext): Logger
```

**Why explicit:**
- Contract clear from signature
- TypeScript enforces return type
- Easier to refactor

### 5. Testable

```typescript
// ✅ GOOD: Easy to test
describe('createContextLogger', () => {
  it('injects trace_id into logs', () => {
    const context = { trace_id: 'trace_123', route: '/api/messages' };
    const logger = createContextLogger(context);
    
    logger.info('Test message');
    
    expect(baseLogger.log).toHaveBeenCalledWith(
      'info',
      'Test message',
      expect.objectContaining({ trace_id: 'trace_123' })
    );
  });
});
```

**Testing characteristics:**
- No mocking `new` keyword
- No mocking class instantiation
- Pure function testing

## ADR-001 Alignment

**From ADR-001:**
> "Prefer functions and composition by default. Use classes only when:
> - Framework requires them
> - Stateful lifecycle exists
> - External libraries integrate through classes"

**This example follows ADR-001:**
- ✅ Uses factory function
- ✅ No stateful lifecycle
- ✅ No framework requirement
- ✅ Simpler than class

## When to Use Factory Functions

**Use factory when:**
- Creating objects with configuration
- Returning interfaces (hiding implementation)
- Stateless utilities
- Test doubles/mocks

**Example use cases:**
- Logger with context
- HTTP client with base URL
- Validator with rules
- Formatter with options

## When Classes Are Acceptable

**From ADR-001:**

```typescript
// ✅ ACCEPTABLE: Framework requirement (Express middleware)
export class AuthMiddleware {
  constructor(private secret: string) {}
  
  handle(req: Request, res: Response, next: NextFunction) {
    // Express middleware pattern requires class
  }
}

// ✅ ACCEPTABLE: Stateful lifecycle
export class ConnectionPool {
  private pool: Pool;
  
  constructor(config: Config) {
    this.pool = createPool(config);
  }
  
  async query(sql: string) {
    return this.pool.query(sql);  // Stateful: manages connection
  }
}
```

**Why classes acceptable here:**
- Framework requires it (Express)
- Stateful lifecycle exists
- External library integration

## Comparison

| Aspect | Factory Function | Class |
|--------|------------------|-------|
| **Syntax** | `const obj = factory()` | `const obj = new Class()` |
| **this binding** | Not needed | Required |
| **Testing** | Simpler (no new mock) | Requires constructor mock |
| **Complexity** | Lower | Higher |
| **Use when** | Stateless, pure | Stateful, framework |

## Key Takeaway

**Rule of thumb:**
> Start with factory function. Only use class if framework requires it or stateful lifecycle exists.

**90% of cases:** Factory function is better.

## Related

- [ADR-001: Functional Programming](../architecture/ADR-001-functional-programming.md)
- [GOOD_ADAPTER.md](./GOOD_ADAPTER.md) — Another factory example
- [BAD_GOD_CLASS.md](./BAD_GOD_CLASS.md) — When NOT to use class
