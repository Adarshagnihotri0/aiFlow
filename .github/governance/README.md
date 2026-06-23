# Engineering Governance System

A reasoning governance layer for AI-assisted development.

## What This Is

Not just rules. A methodology for appropriate reasoning.

**Core Idea**: Different problem types require different reasoning modes.

| Problem Type | Methodology | Example |
|-------------|-------------|---------|
| **Architecture** | OIR (Observe-Interpret-Recommend) | "Should we extract a service?" |
| **Debugging** | Evidence Ladder (P0→P1→P2) | "Why 500 error?" |
| **Configuration** | Observe → Change → Verify | "TypeScript deprecation warning" |
| **Research** | Evidence Collection → Synthesis | "How does this system work?" |

## Structure

```
constitution/    # Stable reasoning principles
templates/       # Standard formats for analysis
examples/        # Real-world applications
metrics/         # Calibration tracking
```

## Usage

1. **Classify problem type** (Architecture/Debugging/Config/Research)
2. **Select methodology** (OIR/Evidence Ladder/Observe-Change-Verify)
3. **Apply methodology** with templates
4. **Track calibration** (claims vs outcomes)

## Key Principles

1. **Facts ≠ Interpretations**
2. **Evidence before explanation**
3. **Confidence reflects evidence quality**
4. **Root cause requires direct observation**

## Calibration Goal

```
Claims: N
Correct: M
Calibration Accuracy: M/N
```

Target: >90% accuracy on root cause declarations.

## Track Separation

**Building Track (Architecture)**:
- Design decisions
- Trade-off analysis
- OIR methodology

**Debugging Track (Runtime)**:
- Failure investigation
- Fact-finding
- Evidence Ladder

**Never mix tracks.**
