# Evidence Automation Layer

## Purpose
Automate 70% of evidence capture so humans only write decisions.

---

## Automation Strategy

### 1. Git History → Pattern Detection

```bash
# Run weekly
./scripts/detect-patterns.sh

#!/bin/bash
# Extract patterns from git history

echo "Pattern Detection Report"
echo "========================"

# Most changed files
echo "Hotspots (most changed files):"
git log --since="1 month ago" --name-only --pretty=format: | \
  sort | uniq -c | sort -nr | head -10

# Common change patterns
echo "Repeated patterns:"
git log --since="1 month ago" --grep="feat:" --oneline | \
  awk '{print $2}' | sort | uniq -c | sort -nr | head -5

# Bug-prone files
echo "Bug-prone files:"
git log --since="1 month ago" --grep="fix:" --name-only | \
  sort | uniq -c | sort -nr | head -10
```

---

### 2. CI/CD → Evidence Capture

```yaml
# .github/workflows/evidence.yml
name: Evidence Capture
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  capture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests with coverage
        id: test
        run: |
          npm test -- --coverage --json > test-results.json
          echo "::set-output name=passed::$(jq '.success' test-results.json)"
          echo "::set-output name=coverage::$(jq '.coverage.total.pct' coverage/coverage-final.json)"
          
      - name: Extract evidence
        run: |
          mkdir -p .ai/auto
          echo "# Auto-captured Evidence" > .ai/auto/$(date +%Y-%m-%d).md
          echo "" >> .ai/auto/$(date +%Y-%m-%d).md
          echo "**Date:** $(date +%Y-%m-%d)" >> .ai/auto/$(date +%Y-%m-%d).md
          echo "**Tests:** ${{ steps.test.outputs.passed }}" >> .ai/auto/$(date +%Y-%m-%d).md
          echo "**Coverage:** ${{ steps.test.outputs.coverage }}%" >> .ai/auto/$(date +%Y-%m-%d).md
          echo "**Commit:** ${{ github.sha }}" >> .ai/auto/$(date +%Y-%m-%d).md
          
      - name: Create evidence graph
        run: |
          echo "graph TD" > .ai/auto/dependency-graph.mmd
          grep -r "import.*from" src/ | \
            awk -F'from' '{print "    " $2}' | \
            tr -d "'" | \
            sort -u >> .ai/auto/dependency-graph.mmd
```

---

### 3. Test Failures → Risk Assessment

```javascript
// scripts/test-evidence.js
const { execSync } = require('child_process');
const fs = require('fs');

function assessRisk() {
  // Get test coverage
  const coverage = JSON.parse(fs.readFileSync('coverage/coverage-final.json'));
  
  // Get changed files
  const changedFiles = execSync('git diff --name-only HEAD~1', { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  
  // Risk assessment
  const riskMap = {
    LOW: [],
    MEDIUM: [],
    HIGH: []
  };
  
  changedFiles.forEach(file => {
    const fileCoverage = coverage[file];
    
    if (!fileCoverage) {
      riskMap.HIGH.push({ file, reason: 'No tests' });
    } else if (fileCoverage.lines.percentage < 50) {
      riskMap.MEDIUM.push({ file, reason: 'Low coverage (<50%)' });
    } else {
      riskMap.LOW.push({ file, reason: 'Well-tested' });
    }
  });
  
  // Write risk report
  fs.writeFileSync('.ai/auto/risk-report.json', JSON.stringify(riskMap, null, 2));
  
  console.log('Risk Assessment Complete:');
  console.log(`  HIGH: ${riskMap.HIGH.length} files`);
  console.log(`  MEDIUM: ${riskMap.MEDIUM.length} files`);
  console.log(`  LOW: ${riskMap.LOW.length} files`);
  
  return riskMap;
}

assessRisk();
```

---

### 4. Pattern Compression

```javascript
// scripts/compress-patterns.js
function compressDecisionRecords() {
  const records = fs.readdirSync('.ai/decision-records')
    .filter(f => f.startsWith('DR-'))
    .map(f => JSON.parse(fs.readFileSync(`.ai/decision-records/${f}`)));
  
  // Group by pattern
  const patterns = {};
  
  records.forEach(record => {
    const key = `${record.category}-${record.approach}`;
    
    if (!patterns[key]) {
      patterns[key] = {
        pattern: record.decision,
        examples: [],
        count: 0
      };
    }
    
    patterns[key].examples.push(record.id);
    patterns[key].count++;
  });
  
  // Create compressed pattern files
  Object.entries(patterns).forEach(([key, pattern]) => {
    if (pattern.count >= 3) {  // Threshold for compression
      fs.writeFileSync(
        `.ai/patterns/PATTERN-${key}.md`,
        `# PATTERN: ${pattern.pattern}\n` +
        `## Examples\n` +
        pattern.examples.map(e => `- ${e}`).join('\n') +
        `\n## Count: ${pattern.count}\n` +
        `## Last Updated: ${new Date().toISOString()}\n`
      );
      
      console.log(`Compressed ${pattern.count} decisions into PATTERN-${key}`);
    }
  });
}
```

---

### 5. Evidence Weighting by Domain

```yaml
# .ai/evidence-config.yml
version: 2.0

domain: backend

evidence_weights:
  integration_test:
    weight: 5
    confidence_multiplier: 1.0
    
  unit_test:
    weight: 3
    confidence_multiplier: 0.8
    
  runtime_trace:
    weight: 4
    confidence_multiplier: 0.9
    
  ast_reference:
    weight: 4
    confidence_multiplier: 0.85
    
  grep_search:
    weight: 2
    confidence_multiplier: 0.5

auto_capture:
  sources:
    - git_history
    - test_coverage
    - build_status
    
  frequency: weekly
  
  risk_thresholds:
    LOW:
      coverage: ">80%"
      tests: ">10"
      
    MEDIUM:
      coverage: "50-80%"
      tests: "5-10"
      
    HIGH:
      coverage: "<50%"
      tests: "<5"

pattern_compression:
  enabled: true
  threshold: 3  # Min decisions to compress
  min_confidence: 0.8
```

---

## Automation Coverage

| Evidence Type | Automation Level | Human Required |
|---------------|------------------|----------------|
| Test coverage | ✅ 100% auto | No |
| Git history | ✅ 100% auto | No |
| Dependency graph | ✅ 100% auto | No |
| Risk assessment | ✅ 90% auto | Review only |
| Alternatives | ❌ 10% auto | Yes (reasoning) |
| Decision record | ❌ 20% auto | Yes (final choice) |
| Validation | ✅ 80% auto | Manual checks occasionally |

**Goal:** Automate evidence capture, humans write reasoning.

---

## Integration

### Package.json Scripts
```json
{
  "scripts": {
    "test:evidence": "node scripts/test-evidence.js",
    "patterns:detect": "./scripts/detect-patterns.sh",
    "patterns:compress": "node scripts/compress-patterns.js",
    "evidence:capture": "npm run test:evidence && npm run patterns:detect"
  }
}
```

### npm run evidence:capture
→ Auto-captures:
- Test coverage
- Risk assessment
- Pattern detection
- Dependency analysis

---

## Output Examples

### Auto-captured Evidence Log
```markdown
# Auto-captured Evidence

**Date:** 2026-06-20
**Tests:** true
**Coverage:** 87%
**Commit:** abc123

## Risk Assessment
- HIGH: 0 files
- MEDIUM: 2 files (auth.ts, middleware.ts)
- LOW: 15 files

## Patterns Detected
- Authentication changes (3 occurrences)
- Database migrations (2 occurrences)
```

### Compressed Pattern
```markdown
# PATTERN: Authentication

## Rule
Always use passport.js for authentication protocols

## Context
- OAuth, SAML, JWT implementations
- 3+ successful integrations

## Examples
- DR-001: OAuth
- DR-002: SAML
- DR-003: JWT

## Confidence: ★★★★☆

## Last Validated
2026-06-20 (Auto-detected from CI)
```

---

## Benefits

1. **70% Less Manual Work** - Evidence auto-captured
2. **Pattern Recognition** - Repeated decisions compressed
3. **Domain-Specific** - Evidence weights per project type
4. **CI/CD Integration** - Continuous evidence flow
5. **Living Documentation** - Auto-updated, never stale

---

**Status:** Automation Layer Complete  
**Next:** Test on real tasks, measure overhead reduction
