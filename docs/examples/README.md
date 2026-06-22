# Architectural Examples Library

**Purpose:** Teach architecture through concrete examples > abstract rules

**AI Learning Priority:** Examples are how AI models learn patterns effectively

---

## Quick Navigation

### Pattern Examples (Timeless Templates)

Positive patterns (GOOD_*) and anti-patterns (BAD_*) validated across repositories.

| Example | Type | Key Lesson |
|---------|------|------------|
| [✅ GOOD_LAYER_BOUNDARY](./patterns/GOOD_LAYER_BOUNDARY.md) | ✅ Positive | Repository pattern done right |
| [❌ BAD_LAYER_BOUNDARY](./patterns/BAD_LAYER_BOUNDARY.md) | ⚠️ Anti-pattern | server.ts responsibility drift |
| [✅ GOOD_FACTORY_FUNCTION](./patterns/GOOD_FACTORY_FUNCTION.md) | ✅ Positive | Factory > Class when stateless |
| [✅ GOOD_ADAPTER](./patterns/GOOD_ADAPTER.md) | ✅ Positive | Pure format conversion |
| [✅ GOOD_DEPENDENCIES](./patterns/GOOD_DEPENDENCIES.md) | ✅ Positive | Downward-only dependency flow |
| [❌ BAD_DEPENDENCIES](./patterns/BAD_DEPENDENCIES.md) | ⚠️ Anti-pattern | Dependency violations to avoid |

**Status:**
- ✅ **PASS** - Pattern validated in codebase
- ⚠️ **EXISTS** - Anti-pattern detected (now documented)

---

### Retrospective Examples (Repository-Specific Lessons)

Learnings from actual refactoring sessions in this repository.

| Example | Type | Key Lesson |
|---------|------|------------|
| [✅ Trace Service Extraction](./retrospectives/trace-service-extraction.md) | Success | Evidence-driven refactoring ✅ |
| [❌ Wrong MessageService Attempt](./retrospectives/wrong-message-service-attempt.md) | Avoided | Assumption-driven failure ⚠️ |
| [🔍 BC-006 Investigation](./retrospectives/bc006-investigation.md) | Process | Route audit before extraction |
| [📊 Governance Accumulation](./retrospectives/governance-accumulation-retrospective.md) | Meta | 8 governance : 0 architecture (anti-pattern) |
| [📚 Documentation Pruning](./retrospectives/documentation-pruning.md) | Hypothesis | Track usage before archival |
| [📏 Constitution Growth](./retrospectives/constitution-growth-retrospective.md) | Discipline | Constitution size is a budget |

**Note:** These are repository-specific learnings. For timeless rules, see `.github/copilot-instructions.md`

---

## Examples Classification

### Timeless vs Repository-Specific

**Timeless rules** → `.github/copilot-instructions.md`
- Applies across ALL repositories
- Universal engineering principles
- Constitutional rules

**Repository-specific** → `docs/examples/retrospectives/`
- Applies to THIS repository
- Specific architectural decisions
- Learning retrospective

**Pattern templates** → `docs/examples/patterns/`
- Reusable positive examples
- Anti-patterns to avoid
- Validated in codebase

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

Ref: docs/examples/retrospectives/trace-service-extraction.md for process
```

---

## Related Governance

- **Constitution:** `.github/copilot-instructions.md` (timeless rules)
- **Architecture:** `docs/ARCHITECTURE.md` (current state)
- **Scorecard:** `docs/architecture/ARCHITECTURE_SCORECARD.md` (metrics only)
- **Boundary Rules:** `docs/architecture/ADR-003-boundary-catalog.md` (BC-001 to BC-006)

---

**Updated:** 2026-06-22  
**Patterns:** 6 files (3 positive, 3 anti-patterns)  
**Retrospectives:** 6 files (repository-specific learnings)  
**Total Examples:** 13 files
