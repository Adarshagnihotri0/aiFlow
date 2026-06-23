# Example: TypeScript Config Fix

## Problem

TypeScript shows deprecation warning for `resolveJsonModule`

---

## Problem Classification

```
Question: "TypeScript shows deprecation warning"
Type: Configuration
Methodology: Observe → Change → Verify
```

**Why Config?**
- Tool configuration
- Low risk
- Clear success criteria (warning disappears)

---

## Decision Cost Filter

```
Classification: C0 — Trivial
Reason: Config alignment, reversible, local impact
Process: Observe → Change → Verify (NO OIR)
```

---

## Observe

```bash
$ tsc --noEmit
src/index.ts:1:1 - warning TS6053: 
'resolveJsonModule' is deprecated. Use 'resolveModule' instead.
```

**Observation**: TypeScript compiler shows deprecation warning

---

## Change

```typescript
// tsconfig.json
{
  "compilerOptions": {
-   "resolveJsonModule": true,
+   "resolveModule": true,
  }
}
```

---

## Verify

```bash
$ tsc --noEmit
[No output - warning resolved]
```

✅ Fixed

---

## Time Taken

```
Observe: 10 seconds
Change: 20 seconds
Verify: 5 seconds
Total: 35 seconds
```

---

## What Would Have Gone Wrong With OIR

If we had applied Architecture Reasoning (OIR):

```
## Observation
TypeScript shows deprecation warning

## Interpretation
API contract changing, need migration strategy

## Recommendation
1. Research new API
2. Test compatibility
3. Add 5-line migration plan
4. Update documentation
...
Time: 5-10 minutes
```

**Result**: 10x overkill for config change.

---

## Calibration Entry

```markdown
Claim: resolveModule flag fixes warning
Evidence Level: P0 (direct observation)
Confidence: 100%
Outcome: Correct
Issue: None
```

---

## Key Insight

**Not all problems need deep reasoning.**

Config problems are the most common over-analysis trap:

- ❌ "Let me research the history of this flag..."
- ❌ "What are the trade-offs of this change..."
- ❌ "Should we create a migration plan..."

✅ **Just fix it.**

```
Warning → Change flag → Warning gone → Done
```

---

## Decision Cost Filter Value

This example shows why Decision Cost Filter matters:

- **C0 (Trivial)**: Observe → Change → Verify
- **C2 (Architectural)**: Full OIR

If every problem is treated as C2, you'll waste hours on config changes.

If every problem is treated as C0, you'll break architecture with trivial fixes.

**The filter calibrates reasoning depth to match decision cost.**
