# Complete Documentation Map & Project Structure

**Generated:** 2026-06-22  
**Purpose:** Map every doc to its location and purpose  
**Total Files:** 89 files (47 docs, 42 code files)

---

## Project Structure Overview

```
mcp2.0/
├── .ai/                          # AI reasoning system
├── .github/                      # Git governance
├── ai-runtime-cli/               # CLI package
├── cli/                          # CLI (deprecated?)
├── docs/                         # All documentation
├── sdk/                          # SDK package
├── scripts/                      # Build utilities
├── src/                          # Main source code
│   ├── db/                      # Database layer
│   ├── middleware/             # Express middleware
│   ├── services/                # Service layer
│   ├── types/                   # TypeScript types
│   └── utils/                   # Utilities
├── migrations/                   # SQL migrations
└── package files                 # Config files
```

---

## ROOT LEVEL DOCUMENTS

### Core Project Files

| File | Type | Purpose |
|------|------|---------|
| `README.md` | Doc | **Project entry point** - Quick start, overview |
| `.github/copilot-instructions.md` | Governance | **Constitution** - Enforced rules, cannot be overridden |
| `AI_CONTEXT.md` | Doc | AI system context for agents |
| `package.json` | Config | Project dependencies and scripts |
| `tsconfig.json` | Config | TypeScript compiler settings |
| `.eslintrc.json` | Config | Lint rules and overrides |

---

### Session/Temporary Documents

| File | Type | Purpose | Action |
|------|------|---------|--------|
| `SESSION_SUMMARY_2026-06-22.md` | Doc | Session retrospective | Archive after review |
| `CONSTITUTION_REFINEMENT_COMPLETE.md` | Doc | Refinement summary | Archive after review |
| `DOCUMENTATION_ARCHITECTURE_MAP.md` | Doc | Architecture map | Keep as reference |

---

## SOURCE CODE STRUCTURE

### Entry Points

| File | Layer | Purpose |
|------|-------|---------|
| `src/index.ts` | Bootstrap | Server initialization |
| `src/server.ts` | Transport | Express routes (493 LOC) |

---

### Layer: Transport (Routes)

| File | Purpose | Routes |
|------|---------|--------|
| `src/server.ts` | Express routes | `/v1/messages`, `/api/v1/traces` |
| `src/adapters.ts` | Model routing | Available models, adapter selection |
| `src/bedrock.ts` | AWS Bedrock | LLM invocation |

---

### Layer: Services (Orchestration)

| File | Purpose | Status |
|------|---------|--------|
| `src/services/trace-service.ts` | Trace orchestration | ✅ Active (2 BC-006 resolved) |
| `src/services/message-service.ts` | Message orchestration | ⚠️ Created, not integrated |

---

### Layer: Middleware

| File | Purpose |
|------|---------|
| `src/middleware/context.ts` | Request context injection |

---

### Layer: Repository (Data Access)

| File | Purpose | Layer |
|------|---------|-------|
| `src/db/client.ts` | Connection pool | Repository |
| `src/db/save-trace.ts` | Sync trace persistence | Repository |
| `src/db/save-trace-async.ts` | Async trace persistence | Repository |

---

### Layer: Types

| File | Purpose |
|------|---------|
| `src/types/trace.ts` | Trace interfaces |
| `src/types/context.ts` | Context types |
| `src/types/api.ts` | API contracts |

---

### Layer: Utilities

| File | Purpose |
|------|---------|
| `src/utils/logger.ts` | Structured logging |
| `src/utils/prompt-builder.ts` | Prompt construction |

---

## DOCUMENTATION BY LAYER

### Layer 1: Governance (Top of Hierarchy)

**Location:** `.github/`

| File | Purpose | Usage |
|------|---------|-------|
| `.github/copilot-instructions.md` | **Constitution** - Core rules | Enforced at all times |

**Architectural Position:** Overrides all other documentation  
**Lines:** 488  
**Status:** Active, stable

---

### Layer 2: Architecture Decision Records (ADRs)

**Location:** `docs/architecture/`

| File | Purpose | Status |
|------|---------|--------|
| `ADR-001-functional-programming.md` | Functional-first principle | Active |
| `ADR-002-module-structure.md` | Module organization | Active |
| `ADR-003-boundary-catalog.md` | Dependency boundaries (BC-001 to BC-006) | Active |

**Architectural Position:** Second in decision hierarchy  
**Usage:** Referenced for architectural decisions

---

### Layer 3: Operational Guides

**Location:** `docs/architecture/`

| File | Purpose | Status |
|------|---------|--------|
| `IMPORT_GRAPH.md` | Dependency baseline | Active |
| `SDK_IMPLEMENTATION.md` | SDK integration guide | Active |
| `TRACEBUILDER_DESIGN.md` | Trace builder pattern | Active |
| `architecture-review-checklist.md` | Review process | Active |
| `review-checklist.md` | Code review standards | Active |
| `README.md` | Architecture directory index | Active |

---

### Layer 4: Examples Library (Pattern Templates)

**Location:** `docs/examples/`

#### Pattern Examples

| File | Purpose | Pattern Type |
|------|---------|--------------|
| `GOOD_LAYER_BOUNDARY.md` | Repository pattern ✅ | Positive example |
| `BAD_LAYER_BOUNDARY.md` | Responsibility drift ❌ | Anti-pattern |
| `GOOD_FACTORY_FUNCTION.md` | Factory pattern ✅ | Positive example |
| `GOOD_ADAPTER.md` | Format conversion ✅ | Positive example |
| `GOOD_DEPENDENCIES.md` | Validated flow ✅ | Positive example |
| `BAD_DEPENDENCIES.md` | Dependency violations ❌ | Anti-pattern |
| `README.md` | Examples index | Navigation |

#### Refactoring Examples

**Location:** `docs/examples/refactoring/`

| File | Purpose | Type |
|------|---------|------|
| `trace-service-extraction.md` | Successful refactor ✅ | Success story |
| `wrong-message-service-attempt.md` | Wrong abstraction ⚠️ | Avoided mistake |
| `bc006-investigation.md` | Investigation process | Methodology |
| `governance-accumulation-retrospective.md` | Governance ROI lesson | Retrospective |

**Total Examples:** 11 files (6 patterns + 4 retrospectives + 1 index)

---

### Layer 5: Product Documentation

| File | Location | Purpose | Audience |
|------|----------|---------|----------|
| `README.md` | Root | Project entry point | All users |
| `docs/README.md` | docs/ | Documentation navigation | All users |
| `docs/ARCHITECTURE.md` | docs/ | Architecture overview | Developers |
| `sdk/README.md` | sdk/ | SDK documentation | SDK consumers |

---

### Layer 6: Tech Debt Tracking

**Location:** `docs/tech-debt/`

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | Lint compliance tracking | Active |

**Content:** ESLint overrides inventory, compliance trends

---

### Layer 7: Historical Tracking

**Location:** `docs/history/`

| File | Purpose | Status |
|------|---------|--------|
| `GITHUB_CHANGES.md` | Git change log | Active |
| `PROJECT_EVOLUTION.md` | Evolution log | Active |

---

### Layer 8: Archive (Historical Preservation)

**Location:** `docs/archive/`

#### Archived Audits

| File | Purpose | Date |
|------|---------|------|
| `VALIDATION_REPORT.md` | Validation findings | 2026-06-22 |
| `REFACTOR_COMPLETE.md` | Refactor summary | 2026-06-22 |
| `REFACTOR_LOG.md` | Refactor metrics | 2026-06-22 |
| `DOC_CONSOLIDATION_PLAN.md` | Consolidation plan | 2026-06-22 |
| `DOCUMENTATION_INVENTORY.md` | Doc inventory | 2026-06-22 |
| `ARCHITECTURE_AUDIT_2026-06-22.md` | Architecture audit | 2026-06-22 |
| `CONSOLIDATION_FINAL.md` | Final consolidation | 2026-06-22 |

#### Archived Milestones

| File | Purpose | Date |
|------|---------|------|
| `MILESTONE_1.md` | Past milestone | Historical |
| `PHASE_7_COMPLETE.md` | Phase completion | Historical |
| `PHASE_7_VERIFICATION.md` | Phase verification | Historical |
| `CONSOLIDATION_COMPLETE.md` | Past consolidation | Historical |
| `DOCUMENTATION_REFINED.md` | Past refinement | Historical |
| `CLEANUP_SUMMARY.md` | Past cleanup | Historical |
| `ARCHITECTURE_ENFORCEMENT.md` | Past enforcement | Historical |

**Total Archive:** 14 files (7 audits + 7 milestones)

---

### Layer 9: AI Meta-System

**Location:** `.ai/`

| File | Purpose | System |
|------|---------|-------|
| `README.md` | AI system overview | Meta-reasoning |
| `decide.md` | Decision process | Meta-reasoning |
| `explain.md` | Explanation process | Meta-reasoning |
| `observe.md` | Observation process | Meta-reasoning |
| `decision-records/DR-001-model-field-derivation.md` | Model field decision | Decision log |
| `decision-records/DR-002-execution-context-observability.md` | Context observability | Decision log |
| `decision-records/TEMPLATE.md` | Decision template | Template |

**Total AI System:** 7 files

---

## SDK PACKAGE STRUCTURE

**Location:** `sdk/`

### SDK Source

| File | Layer | Purpose |
|------|-------|---------|
| `src/client.ts` | Client | SDK client |
| `src/index.ts` | Bootstrap | SDK entry point |
| `src/trace.ts` | Domain | Trace creation |
| `src/types.ts` | Types | SDK types |

### SDK Examples

| File | Purpose |
|------|---------|
| `examples/background-jobs.ts` | Background job usage |
| `examples/express-middleware.ts` | Express integration |

### SDK Tests

| File | Purpose |
|------|---------|
| `tests/sdk.test.ts` | SDK unit tests |

---

## CLI PACKAGE STRUCTURE

**Location:** `ai-runtime-cli/`

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point |

---

## SCRIPTS

**Location:** `scripts/`

| File | Purpose |
|------|---------|
| `compress-patterns.js` | Pattern compression utility |
| `test-entry-point.js` | Testing entry point |
| `test-evidence.js` | Evidence testing |

---

## MIGRATIONS

**Location:** `migrations/`

| File | Purpose |
|------|---------|
| `001_create_execution_traces.sql` | Initial trace table |
| `002_add_project_root.sql` | Project root column |

---

## ARCHITECTURAL FLOW

```
User Request
     ↓
Transport Layer (src/server.ts)
     ↓
Middleware Layer (src/middleware/)
     ↓
Service Layer (src/services/)
     ↓
Repository Layer (src/db/)
     ↓
Database (PostgreSQL)
```

---

## GOVERNANCE HIERARCHY

```
Decision Priority:

1. Security requirements
2. Constitution (.github/copilot-instructions.md)
3. ADRs (docs/architecture/ADR-*.md)
4. Domain prompts (.github/prompts/)
5. Agent instructions (.github/agents/)
6. User request
```

---

## DOCUMENT COUNT BY CATEGORY

| Category | Count | Purpose |
|----------|-------|---------|
| **Governance** | 1 | Constitution |
| **ADRs** | 3 | Architecture decisions |
| **Operational Guides** | 7 | Implementation references |
| **Examples** | 11 | Pattern templates + retrospectives |
| **Product Docs** | 4 | User-facing |
| **Tech Debt** | 1 | Lint tracking |
| **History** | 2 | Change logs |
| **Archive** | 14 | Historical preservation |
| **AI System** | 7 | Meta-reasoning |
| **Session/Temp** | 3 | Recent retrospectives |
| **Total Docs** | 53 | All documentation |

---

## ACTIVE vs ARCHIVED

| Status | Count | Location |
|--------|-------|----------|
| **Active** | 26 | All active docs (governance + operational + examples) |
| **Archive** | 14 | docs/archive/ |
| **AI System** | 7 | .ai/ (separate system) |
| **Temporary** | 3 | Root (session summaries) |

---

## CODE LAYERS

| Layer | Files | Purpose |
|-------|-------|---------|
| Transport | 3 | Routes, adapters |
| Services | 2 | Orchestration |
| Middleware | 1 | Request context |
| Repository | 3 | Data access |
| Types | 3 | Type definitions |
| Utilities | 2 | Helpers |
| **Total Code** | 14 | Source files |

---

## USAGE MAP

### Most Referenced (High Value)

| Document | Usage Rate | Referenced By |
|----------|-----------|---------------|
| Constitution | 100% | Every architectural decision |
| ADR-003 | 75% | Boundary validation |
| Examples Library | 100% | TraceService refactor |
| IMPORT_GRAPH | 50% | Violation tracking |

### Least Referenced (Low Value)

| Document | Usage Rate | Reason |
|----------|-----------|--------|
| TRACEBUILDER_DESIGN | 0% | Different scope |
| Archived docs | 0% | Historical only |
| Temporary summaries | 0% | Recent, not yet used |

---

## KEY INSIGHTS

### Documentation ROI

**High ROI:** Examples Library (100% usage during refactor)  
**Medium ROI:** ADRs (75% usage)  
**Low ROI:** Operational guides (varies)

### Documentation Density

**Code:** 14 TypeScript files  
**Docs:** 53 markdown files  
**Ratio:** 3.8 docs per code file

**Observation:** Heavy documentation, but now consolidated (21 active docs)

---

## FILE LOCATION QUICK REFERENCE

### Need to find a rule?

```
Constitution → .github/copilot-instructions.md
Boundary rules → docs/architecture/ADR-003-boundary-catalog.md
Examples → docs/examples/
```

### Need to understand architecture?

```
Overview → docs/ARCHITECTURE.md
ADRs → docs/architecture/ADR-*.md
Examples → docs/examples/*.md
```

### Need historical context?

```
Audits → docs/archive/audits/
Milestones → docs/archive/milestones/
History → docs/history/
```

### Need project information?

```
Entry point → README.md
AI context → AI_CONTEXT.md
SDK usage → sdk/README.md
```

---

## DOCUMENTATION-TO-CODE RATIO TRACKING

### Current Metrics

```
Markdown Files: 53
Source Files (TypeScript): 14
Ratio: 3.8 : 1
```

### Breakdown

| Category | Count | Notes |
|----------|-------|-------|
| **Active Docs** | 21 | Governance, ADRs, examples, guides |
| **Archive** | 14 | Historical preservation |
| **AI System** | 7 | Meta-reasoning system |
| **Temporary** | 3 | Session summaries (to archive) |
| **Total Docs** | 53 | All markdown files |
| **Source Files** | 14 | TypeScript implementation |
| **Ratio** | 3.8 : 1 | Docs per code file |

### Target

```
Target Ratio: 2.0 : 1
Strategy: Archive unused docs, grow codebase
```

### Action Plan

1. **Track usage** - Reference counts during architectural changes
2. **Archive unused** - Docs not referenced in 3 consecutive changes
3. **Grow code** - Add features, tests, utilities
4. **Reevaluate** - Monthly ratio review

### Health Indicators

- ✅ **Healthy:** Examples growing faster than constitution
- ✅ **Healthy:** Ratio trending toward 2.0:1
- ⚠️ **Warning:** Ratio above 3.0:1 for extended periods
- ❌ **Alert:** New governance without code changes

---

## NEXT ACTIONS

### Immediate

- [ ] Archive session summaries after review
- [ ] Update AI_CONTEXT.md with new structure
- [ ] Add README.md index for all docs

### Future

- [ ] Consider consolidating review checklists
- [ ] Evaluate TRACEBUILDER_DESIGN necessity
- [ ] Consider SDK_IMPLEMENTATION in SDK README

---

**Generated from:** Complete file tree audit  
**Total structure:** 89 files mapped  
**Ready for:** Navigation and governance usage
