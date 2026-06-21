# Architectural Examples Library

**Purpose:** Teach architecture through concrete examples > abstract rules

**AI Learning Priority:** Examples are how AI models learn patterns effectively

---

## Quick Navigation

### Refactoring Examples (Repository-Specific Lessons)

| Example | Type | Key Lesson |
|---------|------|------------|
| [🔄 Trace Service Extraction](./refactoring/trace-service-extraction.md) | ✅ Success | Evidence-driven refactoring |
| [❌ Wrong MessageService Attempt](./refactoring/wrong-message-service-attempt.md) | ⚠️ Avoided | Assumption-driven refactoring failure |
| [🔍 BC-006 Investigation](./refactoring/bc006-investigation.md) | Process | Route audit before extraction |
| [📊 Governance Accumulation](./refactoring/governance-accumulation-retrospective.md) | Retrospective | 8 governance : 0 architecture (anti-pattern) |

**Note:** These are repository-specific learnings. For timeless rules, see `.github/copilot-instructions.md`

---

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

AI models should:
1. Read examples BEFORE creating new code
2. Match patterns found in examples
3. Document deviations with justification
4. Link to specific examples in PR descriptions

**Example usage:**
```
User: Create a new service for handling webhooks

AI: I'll use the GOOD_ADAPTER pattern for this webhook handler.
Following GOOD_FACTORY_FUNCTION for the service initialization.

Ref: docs/examples/refactoring/trace-service-extraction.md for process
```

---

## Examples Classification

### Timeless vs Repository-Specific

**Timeless rules** → `.github/copilot-instructions.md`
- Applies across ALL repositories
- Universal engineering principles
- Constitutional rules

**Repository-specific** → `docs/examples/refactoring/`
- Applies to THIS repository
- Specific architectural decisions
- Learning retrospective

---

## Related Governance

- **Constitution:** `.github/copilot-instructions.md` (timeless rules)
- **Architecture:** `docs/ARCHITECTURE.md` (current state)
- **Boundary Rules:** `docs/architecture/ADR-003-boundary-catalog.md` (BC-001 to BC-006)

---

**Updated:** 2026-06-22  
**Examples Added:** 4 refactoring retrospectives  
**Total Examples:** 11 files
