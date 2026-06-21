# ADR-002: Module Structure and Organization

## Status
ACCEPTED

## Date
2025-06-22

## Context

The repository lacks a standardized module structure, which leads to:
- Inconsistent file placement
- Unclear dependency directions
- Difficulty finding related code
- Architectural drift over time

Current structure is flat with utilities mixed with business logic, making it hard to understand system boundaries.

## Decision

Adopt a **layered architecture** with clear module organization:

### Directory Structure

```
src/
├── controllers/      # HTTP request handlers (Express routes)
│   └── [resource].ts # One controller per resource
│
├── services/         # Business logic
│   └── [domain].ts   # Domain-focused services
│
├── repositories/     # Data access layer
│   └── [entity].ts   # Database operations
│
├── adapters/         # External service integrations
│   └── [service].ts  # Third-party API wrappers
│
├── types/           # TypeScript type definitions
│   ├── api.ts       # API request/response types
│   ├── domain.ts    # Domain model types
│   └── context.ts    # Execution context types
│
├── utils/           # Pure utility functions
│   ├── logger.ts    # Logging utilities
│   └── validators.ts # Validation helpers
│
├── middleware/      # Express middleware
│   └── context.ts   # Request context injection
│
├── constants/       # Configuration constants
│   └── routes.ts    # Route definitions
│
└── db/              # Database infrastructure
    ├── client.ts    # Connection pool
    └── migrations/  # SQL migrations
```

### Layer Responsibilities

**Controllers (Presentation Layer)**
- Handle HTTP requests/responses
- Validate request structure
- Delegate to services
- Return appropriate HTTP responses
- **Never:** Business logic, direct DB access

**Services (Business Logic Layer)**
- Implement business rules
- Orchestrate workflows
- Call repositories for data
- Transform data between layers
- **Never:** HTTP concerns, direct SQL

**Repositories (Data Access Layer)**
- Execute database queries
- Map rows to domain types
- Handle data persistence
- **Never:** Business logic, HTTP concerns

**Adapters (Integration Layer)**
- Wrap external APIs (AWS, Anthropic, OpenAI)
- Handle authentication/authorization
- Translate external formats
- **Never:** Business logic

### Dependency Direction

```
Controllers
    ↓
Services  
    ↓
Repositories → Adapters
    ↓           ↓
  Types       Types
    ↓           ↓
  Utils       Utils
```

**Rules:**
- Dependencies flow downward
- No circular dependencies
- Utils never import services
- Types never import implementation

### One Concept Per File

**Preferred:**
```
trace/
├── create-trace.ts
├── save-trace.ts
├── validate-trace.ts
└── types.ts
```

**Forbidden:**
```
trace-utils.ts  # Contains createTrace, saveTrace, validateTrace...
```

### File Naming Conventions

```
[domain].[action].ts    # Operations: trace.create-trace.ts
[domain].ts             # Domain service: trace.ts
[resource].controller.ts # Controllers: messages.controller.ts
[entity].repository.ts   # Repositories: trace.repository.ts
[service].adapter.ts    # Adapters: bedrock.adapter.ts
```

## Alternatives Considered

### Alternative 1: Feature-Based Structure
```
src/
├── trace/
│   ├── controller.ts
│   ├── service.ts
│   ├── repository.ts
│   └── types.ts
└── llm/
    ├── controller.ts
    ├── service.ts
    └── repository.ts
```

**Rejected because:**
- Doesn't scale with many features
- Hard to see all controllers/services at once
- Mixing layers makes dependency rules unclear
- Better for microservices, not monoliths

### Alternative 2: Flat Structure
```
src/
├── create-trace.ts
├── save-trace.ts
├── trace-types.ts
├── logger.ts
├── db-client.ts
└── ... (50+ files)
```

**Rejected because:**
- No logical organization
- Hard to find related code
- Doesn't communicate architecture
- Poor scalability

### Alternative 3: Domain-Driven Design
```
src/
├── trace-context/    # Bounded context
│   ├── domain/
│   ├── application/
│   └── infrastructure/
└── llm-context/      # Bounded context
    ├── domain/
    ├── application/
    └── infrastructure/
```

**Rejected because:**
- Over-engineered for current size
- Steeper learning curve
- Better for complex domains with multiple teams
- Premature optimization

## Consequences

### Positive
- Clear separation of concerns
- Predictable file locations
- Easier onboarding for new developers
- Enforces dependency direction
- Scales well to 100+ files
- Matches industry-standard patterns

### Negative
- More directories to navigate
- Requires moving existing files
- May feel "over-engineered" for small additions

### Mitigation
- Start with current files in appropriate directories
- Move incrementally when touching files
- Don't require immediate full reorganization

## Implementation Plan

### Phase 1: Create Structure (Immediate)
```bash
mkdir -p src/{controllers,services,repositories,types,utils,middleware,constants,db/migrations}
```

### Phase 2: Move Existing Files (Next Sprint)
```
src/server.ts → src/controllers/app.controller.ts
src/bedrock.ts → src/adapters/bedrock.adapter.ts
src/db/client.ts → src/db/client.ts (already correct)
src/utils/* → src/utils/* (already correct)
```

### Phase 3: Enforce via Lint (Future)
Add import restriction rules to prevent layer violations.

## Enforcement

### Code Review Checklist
- [ ] New files placed in correct layer
- [ ] No layer boundary violations
- [ ] One concept per file
- [ ] Dependencies flow downward

### Future: Architecture Fitness Functions
```typescript
// Test: Controllers don't import repositories directly
test('controllers should not import repositories', () => {
  const controllerImports = getImports('src/controllers/*.ts');
  expect(controllerImports).not.toContain('src/repositories');
});
```

## References

- Clean Architecture (Uncle Bob) - Layer separation
- Hexagonal Architecture - Adapters pattern
- Domain-Driven Design - Bounded contexts (partial inspiration)

## Review History

- 2025-06-22: Initial proposal
- 2025-06-22: Accepted
