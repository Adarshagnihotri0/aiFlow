# Decision Cost Filter

Before applying Architecture Reasoning (OIR), classify the decision:

## Decision Types

### C0 — Trivial
Reversible, local, low risk

**Examples**:
- tsconfig flags
- lint rules
- formatting
- dependency tweaks (non-breaking)

**Process**: Observe → Act → Verify

**NO OIR required**

---

### C1 — Tactical
Affects single module behavior

**Examples**:
- API adjustments
- Runtime config changes

**Process**: Light OIR (skip deep assumption modeling)

---

### C2 — Architectural
Affects structure or boundaries

**Examples**:
- Service extraction
- Layer changes

**Process**: Full OIR required

---

### C3 — Systemic
Cross-module or repo-wide impact

**Examples**:
- Refactors
- Dependency inversion
- Shared model changes

**Process**: Strict OIR + explicit assumptions

---

### C4 — Irreversible
Migration or external contract impact

**Examples**:
- DB schema changes
- Public API changes
- Infra changes

**Process**: Full OIR + validation plan + rollback strategy

---

## Activation Rule

Only apply full Architecture Reasoning (OIR) when:
- Structure is being introduced or changed
- Inference is required across files/modules
- Failure cost is high or irreversible
- Multiple valid designs exist

## Anti-Pattern

Do NOT apply full OIR to:
- Config alignment
- Formatting or naming changes
- Dependency version updates (unless breaking)
- Warning fixes
- Local refactors with clear outcome

These follow: **Observe → Change → Verify → Done**

---

## Core Principle

Reasoning depth must match decision cost.

**No reasoning** for trivial decisions.
**Full OIR** for architectural decisions.
