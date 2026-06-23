# Problem Classification

## Decision Tree

```
START
  ↓
Is something broken?
  ├─ YES → Debugging (Evidence Ladder)
  └─ NO ↓
       ↓
Is this about structure/organization?
  ├─ YES → Architecture (OIR)
  └─ NO ↓
       ↓
Is this about configuration/flags?
  ├─ YES → Configuration (Observe → Change → Verify)
  └─ NO ↓
       ↓
Is this exploration/investigation?
  ├─ YES → Research (Evidence Collection → Synthesis)
  └─ NO ↓
       ↓
UNKNOWN — Treat as Research
```

---

## Problem Types

### Architecture
**Characteristics**:
- Multiple valid approaches exist
- Trade-off analysis needed
- High cost of reversal
- Affects multiple files/modules

**Methodology**: OIR (Observe-Interpret-Recommend)

**Examples**:
- "Should we extract a service?"
- "How should we handle error boundaries?"
- "What's the right module structure?"

---

### Debugging
**Characteristics**:
- Something is broken
- Single root cause exists
- Fact-finding, not trade-off analysis

**Methodology**: Evidence Ladder (P0 → P1 → P2)

**Examples**:
- "Why is gateway returning 500?"
- "Why are sessions not validating?"
- "Why is this null?"

**Key**: There's a RIGHT answer. Your job is to find it, not choose among alternatives.

---

### Configuration
**Characteristics**:
- Tool/flag/environment setting
- Low risk, easily reversible
- Clear success criteria

**Methodology**: Observe → Change → Verify

**Examples**:
- "TypeScript deprecation warning"
- "ESLint rule configuration"
- "Package.json dependency update"

**Key**: No architecture reasoning needed. Just fix it.

---

### Research
**Characteristics**:
- Understanding how something works
- No immediate decision needed
- Building mental model

**Methodology**: Evidence Collection → Synthesis

**Examples**:
- "How does gateway routing work?"
- "What's the session token format?"
- "How do publishers register?"

**Key**: Goal is understanding, not fixing.

---

## Example Classifications

### Example 1: Gateway 500 Error

```
Question: "Why is gateway returning 500?"
Classification: Debugging
Reason: Something broken, single root cause
Methodology: Evidence Ladder
```

### Example 2: Service Extraction

```
Question: "Should we extract GatewayService?"
Classification: Architecture
Reason: Multiple valid approaches, trade-off analysis needed
Methodology: OIR
```

### Example 3: TypeScript Warning

```
Question: "TypeScript shows deprecation warning"
Classification: Configuration
Reason: Tool configuration, reversible, clear fix
Methodology: Observe → Change → Verify
```

### Example 4: Understanding Sessions

```
Question: "How do session tokens work?"
Classification: Research
Reason: Building understanding, no immediate decision
Methodology: Evidence Collection → Synthesis
```
