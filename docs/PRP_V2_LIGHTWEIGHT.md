# PRP v2.0 - Lightweight Evidence System

## Problem with v1.0
- Too many phases (OBSERVE → EXPLAIN → DECIDE → BUILD → VERIFY → RECORD)
- High documentation overhead
- Human compliance decay under pressure
- Evidence hierarchy context-dependent
- "Documentation inflation" risk

---

## v2.0 Design Principles

### 1. Minimal Friction
- Only **DECIDE** phase is mandatory
- Others are optional deep-dives
- Auto-capture evidence where possible

### 2. Evidence Compression
- Track **patterns**, not individual decisions
- Reusable heuristics over detailed logs
- "We always do X" → System learns

### 3. Automation First
- Extract evidence from:
  - Git history
  - Test failures
  - Build logs
  - Code comments
- Humans write decisions, tools capture evidence

### 4. Domain-Specific Weighting
- Different evidence weights per repo:
  - Backend: Integration tests ★★★★★
  - Frontend: Visual regression ★★★★★
  - Infrastructure: Runtime traces ★★★★★

---

## v2.0 Workflow (3 Phases)

### Phase 1: Quick Scan (30 seconds)
**Goal:** Rapid impact assessment

```bash
/prp-quick
```

**Output:**
```markdown
## Impact
- Files: [auto-detected from git diff]
- Dependencies: [static analysis]
- Risk: [LOW/MEDIUM/HIGH] (inferred from test coverage)

## Evidence (Auto-captured)
- Tests exist: ✓ (coverage: 85%)
- Runtime traces: ✗
- Integration tests: ✓

## Decision Point
[Continue to Phase 2 | Abort | Direct implementation]
```

**Automation:**
- ✅ Git diff → File list
- ✅ Test coverage → Risk level
- ✅ Dependency graph → Impact assessment

---

### Phase 2: Alternatives (2-5 minutes)
**Goal:** Document 2+ approaches with minimal reasoning

```bash
/prp-decide
```

**Output:**
```markdown
## Decision
[What we're changing]

## Alternatives
Option A: [Description] - Cost: [LOW/HIGH]
Option B: [Description] - Cost: [LOW/HIGH] (CHOSEN)

## Reason (1-2 lines)
[Evidence-backed reasoning]

## Validation
- [ ] Tests: [command]
- [ ] Manual: [check]

## Decision Record: [YES/NO]
[Only for architectural decisions]
```

**Automation:**
- ✅ Extract test commands from package.json
- ✅ Suggest alternatives based on codebase patterns
- ❌ Human writes reasoning (can't automate)

---

### Phase 3: Execute (Variable)
**Goal:** Implement with validation gates

```bash
/prp-execute
```

**Output:**
```
TASK 1: [File:line]
Evidence: [from Phase 1]
Diff: [show changes]
Validation: [test output]

TASK 2: [Continue...]

VALIDATION SUMMARY:
- Build: ✓
- Tests: ✓ (12/12)
- Manual: [pending]

VERDICT: [READY/NEEDS FIXES]
```

**Automation:**
- ✅ Run tests automatically
- ✅ Capture build output
- ✅ Track validation status

---

## Decision Compression (Key Innovation)

### Instead of:
```
DR-001: Use passport.js for OAuth
- Problem: ...
- Alternatives: ...
- Evidence: EL-001, EL-002...
- Reasoning: ...

DR-002: Use passport.js for SAML
- Problem: ...
- Alternatives: ...
- Evidence: EL-003, EL-004...
- Reasoning: ...

DR-003: Use passport.js for JWT
- Problem: ...
- Alternatives: ...
- Evidence: EL-005, EL-006...
- Reasoning: ...
```

### Compress to:
```
PATTERN-001: Authentication Strategies
## Rule
Always use passport.js for authentication protocols

## Context
- OAuth, SAML, JWT implementations
- 3+ successful integrations

## Exceptions
- Custom auth flows requiring fine-grained control

## Evidence Strength
★★★★☆ (Based on 3 successful implementations)

## Last Validated
2026-06-20

## Examples
- OAuth: DR-001
- SAML: DR-002
- JWT: DR-003
```

**Benefit:**
- Fewer records
- Higher abstraction
- Reusable heuristics
- Case-based reasoning

---

## Evidence Automation Layer

### Auto-capture from Git History
```bash
# Weekly analysis
git log --since="1 week ago" --grep="feat:" --oneline

# Extract:
- What changed most often?
- Which files have most bugs?
- Test failure patterns
```

### Auto-capture from CI/CD
```yaml
# .github/workflows/evidence.yml
name: Evidence Capture
on: [push, pull_request]

jobs:
  capture:
    runs-on: ubuntu-latest
    steps:
      - name: Test coverage
        run: npm test -- --coverage
        
      - name: Extract evidence
        run: |
          echo "Tests: ${{ steps.test.outputs.passed }}" >> .ai/evidence.log
          echo "Coverage: ${{ steps.test.outputs.coverage }}" >> .ai/evidence.log
          
      - name: Commit evidence
        run: git add .ai/evidence.log && git commit -m "chore: update evidence"
```

### Auto-capture from Patterns
```javascript
// src/utils/pattern-detector.js
function detectPatterns(codebase) {
  // Find repeated patterns
  const patterns = findDuplicates(codebase);
  
  // Suggest compression
  patterns.forEach(p => {
    console.log(`PATTERN detected: ${p.name}`);
    console.log(`  Files: ${p.files.join(', ')}`);
    console.log(`  Consider: Creating shared utility`);
  });
}
```

---

## Simplified Evidence Hierarchy

### Domain-Specific Weighting

```yaml
# .ai/evidence-config.yml
domain: backend

evidence_weights:
  integration_test: ★★★★★  # Backend: Integration tests most reliable
  unit_test: ★★★☆☆
  runtime_trace: ★★★★☆
  ast_reference: ★★★★☆
  grep_search: ★★☆☆☆

domain: frontend
evidence_weights:
  visual_regression: ★★★★★  # Frontend: Visual tests most reliable
  unit_test: ★★★★☆
  integration_test: ★★★☆☆
  runtime_trace: ★★☆☆☆
```

---

## When to Write Decision Records

### Mandatory DR (High-Risk Decisions):
- Authentication changes
- Database schema changes
- API contract changes
- Security-related changes
- Architecture changes

### Optional DR (Low-Risk):
- Bug fixes
- Refactoring
- Performance tweaks
- UI adjustments

### Automatic DR (Tool-Detected):
- Breaking changes (detected from test failures)
- Major refactors (>10 files changed)
- Rollbacks (git revert detected)

---

## Implementation Comparison

| Aspect | v1.0 | v2.0 |
|--------|------|------|
| Phases | 6 phases | 3 phases |
| Mandatory Output | Full OBSERVE → EXPLAIN → DECIDE | DECIDE only |
| Evidence | Manual capture | Auto-capture 70% |
| DR Frequency | Every task | High-risk only |
| Documentation | High overhead | Minimal |
| Compliance Decay | High risk | Low risk |
| Time Overhead | 15-30 min | 2-5 min |

---

## Quick Start (v2.0)

### For Simple Tasks:
```bash
# Skip PR system entirely
Direct chat → Default agent implements
```

### For Medium Tasks:
```bash
/prp-quick        # 30 sec impact scan
/prp-decide       # 2 min alternatives
/prp-execute      # Implementation with validation
```

### For High-Risk Tasks:
```bash
/prp-story-create  # Deep analysis (optional)
/prp-decide        # Mandatory decision record
/prp-execute       # Careful execution
# Automatic DR created
```

---

## Anti-Patterns Fixed

### ❌ v1.0: Documentation Inflation
> More artifacts ≠ more understanding

### ✅ v2.0: Evidence Compression
> Pattern-based heuristics over individual logs

---

### ❌ v1.0: Universal Evidence Hierarchy
> "Runtime trace always ★★★★★"

### ✅ v2.0: Domain-Specific Weighting
> Backend: Integration tests ★★★★★
> Frontend: Visual tests ★★★★★

---

### ❌ v1.0: 6 Sequential Phases
> OBSERVE → EXPLAIN → DECIDE → BUILD → VERIFY → RECORD

### ✅ v2.0: 3 Minimal Phases
> Quick Scan → Decide → Execute

---

### ❌ v1.0: Manual Evidence Capture
> Human writes EL-001, EL-002...

### ✅ v2.0: Automated Capture
> Git history → Evidence log
> CI/CD → Coverage metrics
> Test failures → Risk assessment

---

## Real-World Testing Plan

### Week 1: Baseline
- Use v1.0 system
- Track time overhead
- Measure decision quality
- Note drop-off points

### Week 2: v2.0 Trial
- Use lightweight system
- Track time overhead
- Measure decision quality
- Note friction points

### Week 3: Comparison
- Time overhead: v1.0 vs v2.0
- Decision quality: v1.0 vs v2.0
- Drop-off behavior: Where do people skip?

---

## Expected Results

### v1.0 Hypothesis:
- Time overhead: 15-30 min
- Drop-off: OBSERVE skipped under pressure
- Documentation inflation: High

### v2.0 Hypothesis:
- Time overhead: 2-5 min
- Drop-off: Minimal (only DECIDE mandatory)
- Documentation: Compressed patterns

---

## Next Steps

1. ✅ Design v2.0 (this doc)
2. ⏭️ Implement lightweight prompts
3. ⏭️ Build automation layer
4. ⏭️ Test on real tasks (5 tasks minimum)
5. ⏭️ Compare v1.0 vs v2.0 overhead
6. ⏭️ Iterate based on results

---

**Status:** v2.0 Design Complete  
**Next:** Implementation & Testing  
**Goal:** System that survives real engineering pressure
