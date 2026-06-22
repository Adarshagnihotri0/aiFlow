# Architecture Review Checklist

**Purpose:** System-level architecture assessment for code reviews and major changes.

**When to Use:**
- Before merging architectural changes
- During refactoring reviews
- When adding new modules/services
- AI-generated refactors

---

## ADR Coverage Check

- [ ] ADR-001: Functional programming patterns documented
- [ ] ADR-002: Module structure defined
- [ ] ADR-003: Error handling strategy documented
- [ ] ADR-004: Testing strategy defined
- [ ] ADR-005: API versioning strategy (if applicable)
- [ ] ADR-006: Data persistence approach (if applicable)

**Action:** Flag missing ADRs before next architectural work.

---

## Module Structure Review

### File Organization
- [ ] Controllers in `src/controllers/` (or equivalent)
- [ ] Services in `src/services/`
- [ ] Repositories/data access in `src/repositories/`
- [ ] Types in `src/types/`
- [ ] Utilities in `src/utils/`
- [ ] Constants in `src/constants/`

### One Concept Per File
- [ ] No `*-utils.ts` mega-files (10+ exports)
- [ ] Each file has single responsibility
- [ ] File names match exported concept

**Example:**
```
✅ trace/create-trace.ts
✅ trace/save-trace.ts
❌ trace-utils.ts (contains createTrace, saveTrace, validateTrace, etc.)
```

---

## Dependency Direction Check

### Allowed Directions
```
Controllers → Services → Repositories → Database
     ↓           ↓           ↓
   Types       Types       Types
     ↓           ↓           ↓
   Utils       Utils       Utils
```

### Forbidden Patterns
- [ ] No circular dependencies
- [ ] No utils importing services
- [ ] No types importing implementation
- [ ] No downward dependency on higher layers

**Verify:**
```bash
# Check for circular dependencies
npx madge --circular src/

# Verify dependency direction
npx dependency-cruiser src/
```

---

## Pattern Consistency Check

### Before Introducing New Pattern
- [ ] Searched repository for existing patterns
- [ ] Identified at least 2 similar implementations
- [ ] Chosen pattern matches existing style
- [ ] Deviation justified with documentation
- [ ] Alternatives documented and rejected

### Pattern Analysis
```markdown
Pattern: [Name]
Found: [File path]
Matching Implementations:
1. [File 1]
2. [File 2]

Alternatives Rejected:
1. [Alternative 1] - Reason: [Why not suitable]
2. [Alternative 2] - Reason: [Why not suitable]
```

---

## Boundary Violations Check

### API Boundaries
- [ ] Request validation at entry points
- [ ] No business logic in controllers
- [ ] Controllers delegate to services
- [ ] Services don't know about HTTP

### Data Boundaries
- [ ] No SQL in services (use repositories)
- [ ] No business logic in repositories
- [ ] Type conversion at boundaries

### Integration Points
- [ ] External APIs wrapped in adapters
- [ ] Database access through repositories only
- [ ] Third-party libraries isolated

---

## Alternative Analysis

**For non-trivial architectural changes:**

### Document Each Approach
```markdown
**Approach 1: [Name]**
- Description: [What it does]
- Pros: [Benefits]
- Cons: [Drawbacks]
- Complexity: Low/Medium/High

**Approach 2: [Name]**
- Description: [What it does]
- Pros: [Benefits]
- Cons: [Drawbacks]
- Complexity: Low/Medium/High
```

### Decision Record
- [ ] At least 2 alternatives considered
- [ ] Each alternative documented
- [ ] Rejection reasons explicit
- [ ] Chosen approach justified

---

## Technical Debt Introduced

- [ ] No new `any` types without justification
- [ ] No ESLint suppressions without documentation
- [ ] No TODOs without tracking issues
- [ ] No deprecated patterns introduced

### Debt Tracking
```markdown
Type: [Lint suppressions / any types / TODOs]
Location: [File:line]
Justification: [Why necessary]
Tracking: [Issue # or tech debt file reference]
```

---

## Missing Documentation

### Code Level
- [ ] Public APIs have JSDoc
- [ ] Complex logic has inline comments
- [ ] Magic numbers replaced with named constants

### Architecture Level  
- [ ] New modules documented in README
- [ ] Integration points documented
- [ ] ADR created for architectural decisions

---

## Integration Risks

### Backward Compatibility
- [ ] No breaking changes without version bump
- [ ] Deprecated APIs marked with @deprecated
- [ ] Migration path documented

### External Dependencies
- [ ] No unchecked external calls
- [ ] Timeouts configured
- [ ] Error handling in place
- [ ] Fallback behavior defined

---

## Performance Considerations

- [ ] No N+1 queries
- [ ] Appropriate indexes exist
- [ ] No unnecessary serialization
- [ ] Lazy loading where appropriate

---

## Security Review

- [ ] Input validation at boundaries
- [ ] No hardcoded secrets
- [ ] Parameterized queries (no SQL concatenation)
- [ ] Proper error handling (no stack traces exposed)
- [ ] Authentication/authorization checked

---

## Testing Requirements

- [ ] Unit tests for new logic
- [ ] Integration tests for API endpoints
- [ ] Edge cases covered
- [ ] Error paths tested

---

## Review Sign-off

**Reviewer:** [Name/Agent]  
**Date:** [YYYY-MM-DD]  
**Decision:** APPROVED / NEEDS WORK / BLOCKED  

**Required Changes:**
1. [Change 1]
2. [Change 2]

**Recommendations:**
1. [Recommendation 1]
2. [Recommendation 2]
