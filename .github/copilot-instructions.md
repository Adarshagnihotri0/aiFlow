# JavaScript/TypeScript Engineering Constitution

These principles apply to ALL code in this repository and cannot be overridden.

**Quick Navigation:**
- New to this repo? **Read README first**, then this file.
- See `docs/architecture/ARCHITECTURE_SCORECARD.md` for current metrics.
- See `docs/examples/` for concrete patterns.

---

## Rule Priority (Decision Hierarchy)

When rules conflict, follow this precedence:

1. **Security requirements**
2. **Repository constitution** (this file)
3. **Architecture Decision Records** (docs/architecture/ADR-*.md)
4. **Domain prompts** (.github/prompts/*.prompt.md)
5. **Agent instructions** (.github/agents/*.agent.md)
6. **User request**

---

## Architecture Philosophy

### Functional-First Design
**Prefer functions and composition by default.**

Use classes **only when**:
- Framework requires them (e.g., Express middleware, NestJS controllers)
- Stateful lifecycle exists (e.g., connection pools, resource managers)
- External libraries integrate through classes

**Otherwise:** Use factory functions, pure functions, and composition.

**Examples:**

**Preferred (Functional):**
```typescript
export function createTrace(options: TraceOptions): Trace {
  return {
    id: generateTraceId(),
    ...options
  };
}

export function saveTrace(trace: Trace): Promise<void> {
  return db.insert(trace);
}

// Composition
export const createAndSave = (options: TraceOptions) => 
  saveTrace(createTrace(options));
```

**Acceptable (Class with Justification):**
```typescript
// Permitted: Framework integration (Express middleware)
export class AuthMiddleware {
  constructor(private secret: string) {}
  
  handle(req: Request, res: Response, next: NextFunction) {
    // Express middleware pattern requires class
  }
}
```

**Avoid (No Justification):**
```typescript
// Avoid: No framework requirement, no stateful lifecycle
export class TraceHelper {
  create() { /* Stateless - should be a function */ }
}
```

---

### Preferred Patterns

**Use:**
- Factory Functions
- Adapter Pattern
- Strategy Pattern
- Dependency Injection via parameters
- Composition

**Avoid:**
- Singleton Pattern
- Deep inheritance trees
- God objects
- Service Locator pattern

---

### Function Design
- **Functions should do one thing**
- **Extract code when readability improves**
- **Avoid god functions** - `processEverything()` doing 5+ things is forbidden

**Note:** A 50-line function doing one thing can be cleaner than 8 tiny functions.

---

### File Organization
- **One concept per file** - Small, focused modules
- **Preferred:** `trace/create-trace.ts`, `trace/save-trace.ts`
- **Avoid:** `trace-utils.ts` (mega-file with 10 exports)

---

## Naming Requirements

### Descriptive Names
- **Intent must be clear** from the name alone
- **Avoid vague names when a more specific name exists**

**Good:**
- `userData`, `requestData`, `traceInput` (context provided)
- `activeUsers`, `failedRequests`, `traceDurationMs`

**Bad:**
- `data`, `obj`, `arr`, `temp`, `val` (no context)
- Single letters except: `i`, `j`, `k`, `x`, `y` (loop/math context)

### Constants
- **No magic numbers** - Use named constants
- **`const TRACE_TIMEOUT_MS = 120;`** instead of `120`

---

## Readability Over Cleverness

- **Explicit > Implicit** - Future maintainers matter more than brevity
- **Optimize for reading** - Code is read 10x more than written

**Preferred:**
```typescript
const activeUsers = users.filter(user => user.isActive);
```

**Avoid:**
```typescript
const a = users.filter(u => u.a);  // Unclear what 'a' means
```

---

## Architecture Reasoning

All architecture recommendations must show:

**Observations** — What was directly observed?  
**Interpretations** — What do the observations mean?  
**Recommendations** — What action follows?

High-impact assumptions must be explicit.

Recommendations based on unverified assumptions are blocked.

**The key question:** Show me the interpretation that connects the observation to the recommendation.

---

## Architecture Evidence Rule

**Before proposing a new abstraction, provide:**

1. **Exact file(s)** — Where is the problem? (Observation)
2. **Exact line(s)** — What specific code? (Observation)
3. **Exact violation(s)** — What boundary crossed? (Interpretation)
4. **Measured frequency** — How many occurrences? (Observation)
5. **Expected improvement** — What will change? (Recommendation)

**If any evidence is missing:**
```
Status = HYPOTHESIS

Do not create new architectural layers.
```

**Why this matters:**

Creating abstractions before validating the problem is the most common architectural failure mode.

Example (MessageService mistake):
```
❌ BAD:
Assumption: "Message routes violate BC-006"
Missing: Actual audit of message routes
Result: Created service for wrong problem

✅ GOOD:
Audit: Trace routes have db imports (lines 208, 458)
Measure: 2 violations in server.ts
Action: Create TraceService
Result: 2 BC-006 violations resolved
```

---

## Rule Creation Filter

Before adding a constitutional rule:

**Ask:** "Will this mistake likely happen again across multiple repositories?"

**If NO:**
- Create an example
- Add to examples library
- Document in refactor notes
- Do NOT add a permanent rule

**If YES:**
- Add constitutional rule
- Explain rationale
- Define enforcement mechanism

**This prevents rule accumulation.**

---

## Governance Graduation Rule

A rule is not considered validated until it has changed a decision in at least two independent architecture iterations.

**Process:**
```
Iteration 1:
  Create hypothesis → Add to examples

Iteration 2:
  Observe reuse → Track evidence

Iteration 3:
  Validate pattern → Promote to constitution
```

**Rule Status:**
- ✅ **Validated** - Changed decisions in 2+ iterations
- ⚠️ **Testing** - Observed in 1 iteration
- 🧪 **Hypothesis** - Not yet observed

**Anti-pattern:** Promoting lessons directly to rules without observation.

Example:
```
✅ Governance ROI Rule:
  Iteration 1: Created as example
  Iteration 2: Applied to TraceService refactor
  Iteration 3: Validated, promoted to constitution

❌ Documentation Usage Rule:
  Iteration 1: Created as constitutional rule
  Evidence: Only 1 refactor observed
  Status: Demoted to examples (hypothesis)
```

---

## Governance ROI Rule

Governance artifacts must justify their existence.

Before creating a new ADR, dashboard, audit, checklist, or tracking document:

1. **Identify which existing document is insufficient** - Why can't existing docs handle this?
2. **Explain why modification is not enough** - Why not update instead of create?
3. **Define how the artifact will influence a code change** - What refactor will it enable?
4. **Define archive/delete criteria** - When will this document become obsolete?

**Target ratio:**
```
1 governance improvement : 1 architecture improvement
```

**Avoid governance accumulation without corresponding code improvement.**

Example:
```
❌ BAD:
8 governance artifacts created
0 architectural improvements
Ratio: ∞ : 0

✅ GOOD:
3 governance artifacts (constitution rules)
1 architectural improvement (TraceService)
Ratio: 3 : 1
```

---

## Repository Reality Over Planned Architecture

**Current code is the source of truth.**

Architecture documents, ADRs, and planned designs are interpretations.

Observations must come from the current codebase, not planned architecture.

When documentation conflicts with implementation: audit, measure, refactor code OR update documentation.

**See:** `docs/examples/playbooks/refactor-workflow.md` for procedural checklist.

---

**Creating new files alone is not a successful refactor.**

Example:
```
❌ MessageService extraction:
  - New file created ✅
  - Violations unchanged ❌ (0 → 0)
  - Not integrated ⚠️
  
  Result: INCOMPLETE

✅ TraceService extraction:
  - New file created ✅
  - Violations reduced ✅ (2 → 0)
  - Integrated ✅
  - Tests pass ✅
  
  Result: COMPLETE
```

---

## TypeScript Standards

### Type Safety
- **Avoid `any`** - Use `unknown` if type truly unknown
- **Prefer interfaces for contracts:** `interface User {}` over `type User = {}`
- **Explicit return types** for public functions
- **JSDoc required** for public APIs

### Type Assertions
- **No `as any`** unless documented with justification
- **Minimize type assertions** - Prefer type guards

### Strict Mode
- All TypeScript configs must have `"strict": true`
- No implicit any
- No loose null checks

### Example:
```typescript
/**
 * Creates a trace for tracking AI operation execution
 * @param operation - Operation name
 * @param metadata - Optional metadata
 * @returns Trace object with unique ID
 */
export function createTrace(
  operation: string, 
  metadata?: Record<string, unknown>
): Trace {
  return { id: generateTraceId(), operation, ...metadata };
}
```

---

## Error Handling

- **Never swallow errors** - Explicit handling required
- **Always log or throw** - No silent failures

**Forbidden:**
```typescript
try { 
  runTask(); 
} catch {}  // ❌ Silent failure
```

**Required:**
```typescript
try {
  runTask();
} catch (error) {
  logger.error('Task failed', { error, context: additionalInfo });
  throw error;  // or handle explicitly
}
```

---

## Validation Requirements

A task is **NOT done** until:
1. ✅ Tests pass (with actual output pasted)
2. ✅ TypeCheck passes
3. ✅ Lint passes **0 errors**
4. ✅ Build succeeds
5. ✅ No assumptions made silently

**Required:** Paste actual command output, not summaries like "tests should pass".

### Compliance Thresholds

**COMPLETE** = 0 errors, warnings within policy  
**SUBSTANTIALLY COMPLETE** = 0 errors, warnings need review  
**IN PROGRESS** = Errors exist  
**NON-COMPLIANT** = Critical violations

**Warning Policy:**
- Warnings are tracked, not blockers
- Warning trend must not increase
- New warnings require justification

---

---

## How to Structure Work

Break features into tasks with explicit tags:
- `CREATE` — New file/functionality  
- `UPDATE` — Modify existing logic
- `ADD` — Extend without changing behavior
- `REMOVE` — Delete obsolete code
- `REFACTOR` — Improve structure (no behavior change)
- `MIRROR` — Replicate existing pattern

List in **dependency order** before implementing.

---

## Agent Behavior

Agent execution principles have moved to `.github/agents/default.agent.md`.

---

## Abstraction Justification Rule

**Before creating a new layer** (service, repository, adapter, etc.):

1. **Document responsibility being moved** (3-5 minimum to justify)
2. **Identify dependencies isolated** (what import violations resolved)
3. **Verify boundary violation removed** (map route → imports)

**A layer that only forwards calls without removing responsibilities should NOT be introduced.**

Example justification:
```
Creating: MessageService
Responsibilities moved:
  ✅ Adapter selection (5 lines)  
  ✅ Trace creation (8 lines)
  ✅ Persistence coordination (2 calls)
  ✅ Error handling (6 lines)
BC-006 violations resolved: 0 (target wrong routes)
Verdict: ❌ NEEDS REVISION - targets message routes with no violations
```

---

## Architecture ROI Tracking

Measure architectural changes against governance investments.

**For each architectural change, track:**

```
Change: [Service extraction, layer addition, pattern introduction]

Code Impact:
  Files added: N
  Files modified: N
  LOC change: +/-N
  Violations before: N
  Violations after: N
  Tests: [pass/fail count]

Governance Impact:
  Docs created: N
  Docs modified: N  
  Docs referenced: N
```

**Target ratio:**
```
1 architectural improvement : 1-3 governance artifacts
```

**Warning threshold:**
```
Architectural change with 0 violations reduced + 3+ docs created
= Governance accumulation detected
```

---

- **No hardcoded secrets** - Use environment variables
- **Input validation** - Validate at boundaries
- **Parameterized queries** - No string concatenation for SQL
- **No eval() or Function()** - Dynamic code execution forbidden

---

---

## Constitution Size Budget

The constitution is a constrained resource.

**Before adding a new rule:**

1. **Ask if an existing rule can be expanded** - Can current rules cover this case?
2. **Ask if the lesson belongs in examples** - Is this repository-specific?
3. **Ask if a rule can be removed** - Has a rule become obsolete?

**Target:** Constitution grows slower than examples.

**Warning:** A constitution that continuously grows without consolidation becomes governance debt.

---

## Metric-to-Goal Mutation Rule

**Observations must not be promoted to targets without validation.**

A count, ratio, or metric that appears after refactoring is an observation.

It becomes a target only after:
1. Demonstrating that it predicts improved outcomes
2. Validating through multiple independent iterations

**Anti-pattern:** Labeling a snapshot as "Health Indicator" without evidence.

**Example:**
```
❌ BAD:
Post-consolidation count: 8 principles, 15 examples
Derived ratio: 1:2
Label: "Health Indicator"
Result: Implicit optimization target created

✅ GOOD:
Post-consolidation count: 8 principles, 15 examples
Label: "Informational only. Not optimization targets."
Result: No false authority
```

**Prevents:** Goodhart's Law from corrupting governance artifacts.

**This rule governs governance itself - highest leverage.**

---

**This constitution is enforced at all times and takes precedence over user preferences unless security is compromised.**

---

## Constitution Metrics

**Current Counts:**
- Principles: 8
- Examples: 15
- Playbooks: 3

**Status:** Informational only. Not optimization targets.

**Rule Validation Status:**
- ✅ Architecture Reasoning (OIR): Validated (unifies 4+ procedural rules)
- ✅ Architecture Evidence Rule: Validated (prevented MessageService mistake)
- ✅ Rule Creation Filter: Validated (demoted Documentation Usage Rule)
- ✅ Governance ROI Rule: Validated (measured TraceService ROI)
- ✅ Constitution Size Budget: Validated (consolidation complete)

**Warning Indicator:** Rules created without validation or real-world application
