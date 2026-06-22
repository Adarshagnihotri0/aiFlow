# Engineering Operating Model

> **One page. One decision. One action.**

---

## The Only Decision That Matters

```
Is this execution-level or design-level?
```

---

## 🟢 Execution-Level (C0-C1)

**You already know what to do.**

**Examples:** tsconfig change, lint fix, rename, dependency bump, small refactor, config alignment

**Mental Model:** "No thinking system needed"

**Process:**
```
See → Do → Verify
```

**Stop. Do not read further. Execute.**

---

## 🟡 Design-Level (C2-C4)

**You might be wrong about structure or causality.**

**Examples:** service extraction, architecture change, boundary decisions, cross-module refactor, system behavior inference

**Mental Model:** "I need to avoid building the wrong thing"

**Process (OIR):**
```
Observation → Interpretation → Recommendation
+ assumptions explicitly checked
```

---

## Decision Cost Classification

| Class | Criteria | Process |
|-------|----------|---------|
| **C0: Trivial** | Reversible, local, low risk | See → Do → Verify |
| **C1: Tactical** | Affects single module behavior | Light reasoning (skip assumption tracking) |
| **C2: Architectural** | Affects structure or boundaries | Full OIR required |
| **C3: Systemic** | Cross-module or repo-wide impact | Strict OIR + explicit assumptions |
| **C4: Irreversible** | Migration, breaking infra | Full OIR + validation + rollback |

---

## The Depth Dial

- **Low** (C0-C1): Just execute
- **Medium** (C2): Light OIR
- **High** (C3-C4): Full OIR + assumptions

---

## The Invariant

> **If classification takes longer than execution, the system has failed.**

---

## Anti-Patterns to Avoid

DO NOT apply OIR to:
- Config alignment (tsconfig, eslint, build tools)
- Formatting or naming changes
- Dependency version updates (unless breaking)
- Warning fixes
- Local refactors with clear outcome

These are: **See → Do → Verify → Done**

---

## Complete System (One Sentence)

> **First classify the decision. Then decide how much thinking it deserves. Then act.**

---

## Full Constitution

For detailed rules, examples, and ADRs: See `.github/copilot-instructions.md`

This operating model is the practical application. The constitution is the reference.
