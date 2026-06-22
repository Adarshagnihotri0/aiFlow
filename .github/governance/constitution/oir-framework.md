# OIR Framework

## Structure

All architecture recommendations must show:

```
Observation — What was directly observed?
Interpretation — What do the observations mean?
Recommendation — What action follows?
```

## High-Impact Assumptions

Assumptions must be explicit.

Recommendations based on unverified assumptions are blocked.

**The key question**: Show me the interpretation that connects the observation to the recommendation.

---

## OIR Template

```markdown
## Observation
[Direct quote or measurement]

## Interpretation
[What this means]

## Recommendation
[Action to take]

## Confidence
[Evidence strength: ★★★★☆ to ★★☆☆☆]

## Assumptions (if any)
[List unverified assumptions]
```

---

## Example: Service Extraction

### Observation
```typescript
// server.ts line 208, 458
await db.insert(traces).values(trace);
await db.select().from(traces).where(...);
```
Direct database imports in server.ts (2 occurrences)

### Interpretation
These violate BC-006 (no direct DB access in route handlers). The violations are in two different routes.

### Recommendation
Create TraceService to encapsulate database operations.

### Confidence
★★★★☆ (Direct observation of code)

### Assumptions
None

---

## Anti-Patterns

### ❌ Mixed O and I
```
Observation: TraceBuilder is duplicated
```
**Problem**: "Duplicated" is interpretation.

✅ **Correct**:
```
Observation: TraceBuilder class exists in src/trace/builder.ts and sdk/trace/builder.ts
Interpretation: This appears to be duplication
```

### ❌ Recommendation Without O
```
Recommendation: Extract TraceService
```
**Problem**: No observation or interpretation shown.

✅ **Correct**:
```
Observation: DB imports in server.ts
Interpretation: BC-006 violation
Recommendation: Extract TraceService
```

### ❌ Hidden Assumption
```
Observation: Message routes import db
Recommendation: Create MessageService
```
**Problem**: Assumes message routes have violations (not checked).

✅ **Correct**:
```
Observation: Trace routes import db (verified)
Assumption: Message routes might also (not checked)
Recommendation: Audit message routes first
```
