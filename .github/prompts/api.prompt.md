---
applyTo: "src/**/*.ts"
---

## Server/API Code Standards

### Error Handling
- **Structured error responses** - No generic "Error occurred"
- **HTTP status codes** mapped to error types
- **Error logging** with request context (trace ID, user ID)

### Layered Architecture
- **Controllers:** Request validation, response formatting (no business logic)
- **Services:** Business logic (no HTTP awareness)
- **Repositories:** Data access (no business logic)

### Input Validation
- **Validate early** - Fail fast at controller level
- **Type guards** for runtime validation
- **Meaningful error messages** with field names

### Example:
```typescript
// Controller
export async function handleCreateTrace(req: Request, res: Response) {
  const input = validateCreateTraceInput(req.body); // Throws if invalid
  const trace = await traceService.create(input);
  res.status(201).json(trace);
}

// Service
export async function create(input: CreateTraceInput): Promise<Trace> {
  // Pure business logic, no HTTP awareness
  return saveTrace(buildTrace(input));
}
```

### Controller Rules
- **No business logic** - Controllers orchestrate, services compute
- **If controller has `if/else` beyond validation, move to service**
- **Error handling middleware** - Don't duplicate try/catch

### Service Rules
- **No HTTP types** - `Request`, `Response` forbidden
- **Return domain types** - Not HTTP responses
- **Throw domain errors** - Services control error flow

### Error Response Format
```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid trace input",
    "details": [
      { "field": "operation", "issue": "Required field missing" }
    ],
    "traceId": "trace_123"
  }
}
```

### Logging Standards
- **Every request logged** with trace ID
- **Errors logged** with full context
- **No console.log** - Use winston logger

### Database Transactions
- **Services own transactions** - Not controllers
- **Repository functions** should accept transaction when needed
- **Rollback on error** - No partial state
