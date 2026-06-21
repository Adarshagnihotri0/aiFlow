# Architectural Examples Library

**Purpose:** Teach architecture through concrete examples > abstract rules

**AI Learning Priority:** Examples are how AI models learn patterns effectively

---

## Quick Navigation

### Layer Boundary Examples

| Example | Status | Key Lesson |
|---------|--------|------------|
| [✅ GOOD_LAYER_BOUNDARY](./GOOD_LAYER_BOUNDARY.md) | ✅ PASS | Repository pattern done right |
| [❌ BAD_LAYER_BOUNDARY](./BAD_LAYER_BOUNDARY.md) | ⚠️ EXISTS | server.ts responsibility drift |

### Dependency Direction Examples

| Example | Status | Key Lesson |
|---------|--------|------------|
| [✅ GOOD_DEPENDENCIES](./GOOD_DEPENDENCIES.md) | ✅ 95% CLEAN | Downward-only dependency flow |
| [❌ BAD_DEPENDENCIES](./BAD_DEPENDENCIES.md) | ✅ MOSTLY CLEAN | Anti-patterns to avoid |

### Design Pattern Examples

| Example | Status | Key Lesson |
|---------|--------|------------|
| [✅ GOOD_FACTORY_FUNCTION](./GOOD_FACTORY_FUNCTION.md) | ✅ PASS | Factory > Class when stateless |
| [✅ GOOD_ADAPTER](./GOOD_ADAPTER.md) | ✅ PASS | Pure format conversion |

---

## How to Use This Library

### For AI Assistants

AIAI models should:
1. Read examples BEFORE creating new code
2. Match patterns found in examples
3. Document deviations with justification
4. Link to specific examples in PR descriptions

**Example usage:**
```
User: Create a new service for handling webhooks

AI: I'll use the GOOD_ADAPTER pattern for this webhook handler.
Following GOOD_FACTORY_FUNCTION for the service initialization.
```

### For Code Reviews

Reference these examples:
```markdown
# PR Comment
This follows the GOOD_LAYER_BOUNDARY pattern — repository layer
contains only data access, no business logic.

Reference: docs/examples/GOOD_LAYER_BOUNDARY.md
```

### For Onboarding

New engineers should:
1. Read GOOD_FACTORY_FUNCTION.md
2. Understand why factory > class
3. See real codebase examples
4. Apply patterns to new code

---

## Real Audit Findings

These examples are based on **Architecture Audit 2026-06-22**:

### What Passed

✅ No circular dependencies  
✅ SDK completely isolated  
✅ Utils pure (no business logic imports)  
✅ Repository layer boundaries clean  
✅ Dependency direction correct  

### What Needs Improvement

⚠️ server.ts has 4+ responsibilities  
⚠️ Service layer missing  
⚠️ Controller layer missing  
⚠️ Skip-layer imports (server → db)  

**Reference:** [Architecture Audit Report](../architecture/ARCHITECTURE_AUDIT_2026-06-22.md)

---

## Teaching Pattern

Each example follows this structure:

### 1. Real Code Example
```typescript
// ✅ GOOD or ❌ BAD
// Actual code from codebase (audited)
```

### 2. Why It's GOOD/BAD
- Specific reasons
- ADR alignment
- Testing impact

### 3. The Fix (if BAD)
```typescript
// How to fix it
// Concrete refactor steps
```

### 4. Real Impact
- Testing difficulty
- Refactoring blocked
- Architecture assessment

### 5. Related Documents
- Links to ADRs
- Links to audit findings
- Links to related examples

---

## Governance Score

| Area | Grade | Examples Library Grade |
|------|-------|------------------------|
| Constitution | A | A (examples link to constitution) |
| Reporting | A | A (includes audit validation) |
| Tech Debt | A | A (references technical debt) |
| ADR Quality | B+ | A (examples demonstrate ADRs) |
| Architecture Reviews | A- | A (based on real audit findings) |
| CI Validation | B | B (not part of CI yet) |
| Architecture Enforcement | C+ | A- (prepares for ADR-003) |
| **Example Library** | **D → A** | **Major improvement** |

---

## Adding New Examples

### Template

```markdown
# ✅ GOOD or ❌ BAD: Pattern Name

## Real Example from Codebase
[Code showing the pattern]

## Why This Is GOOD/BAD
[Specific reasons]

## ADR Alignment
[Which ADR this relates to]

## Testing Impact
[How it affects testability]

## Related
[Links to ADRs, other examples]
```

### Criteria

Include examples when:
1. Pattern appears 2+ times in codebase
2. Violation was found during audit
3. ADR references require clarification
4. Common mistake made by developers/AI

---

## Next Steps

1. ✅ Created examples for audit findings
2. ⏳ Create GOOD_SERVICE example (after extracting service layer)
3. ⏳ Create GOOD_CONTROLLER example (after extracting controllers)
4. ⏳ Add to CI pipeline (reflect new code in examples)

---

## Related Documents

- [Architecture Audit Report](../architecture/ARCHITECTURE_AUDIT_2026-06-22.md)
- [Governance Dashboard](../architecture/GOVERNANCE_DASHBOARD.md)
- [ADR-002: Module Structure](../architecture/ADR-002-module-structure.md)
- [Architecture Review Checklist](../architecture/architecture-review-checklist.md)
- [Constitution](../../.github/copilot-instructions.md)

---

**Library Status:** ✅ READY for AI assistant consumption  
**Coverage:** Focuses on real audit findings  
**Quality:** Based on validated patterns
