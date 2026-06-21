# ADR-003: Architecture Fitness Functions

## Status
PROPOSED

## Date
2025-06-22

## Context

The repository has:
- ✅ Architecture principles (Constitution)
- ✅ Module structure (ADR-002)
- ✅ Code quality enforcement (ESLint)
- ✅ Architecture reviews (Checklist)

**Missing:** Automated enforcement of architectural rules

### Current Problem
Without fitness functions:
- ADR-002 is guidance, not enforcement
- Developers can violate import rules silently
- Architectural drift accumulates over time
- Reviews become manual gatekeeping

### Example Violations Not Currently Caught
```typescript
// Controller directly importing repository (violates layering)
import { traceRepository } from '../repositories/trace.repository';
export class TraceController { ... }

// Service importing controller (wrong direction)
import { AppController } from '../controllers/app.controller';
export class LLMService { ... }

// Circular dependency
// a.ts imports b.ts, b.ts imports a.ts
```

ESLint doesn't catch these without specific configuration.

## Decision

Implement **Architecture Fitness Functions** - automated tests that verify architectural rules.

### Tool Selection

**Primary Tool:** `dependency-cruiser`
- Detects circular dependencies
- Enforces import direction
- Configurable rules per module
- CI/CD integration friendly

**Secondary Tools:**
- `madge` for circular dependency visualization
- Custom ESLint import rules (future)

### Architecture Rules

#### Rule 1: No Circular Dependencies
```javascript
// .dependency-cruiser.js
{
  name: 'no-circular',
  severity: 'error',
  comment: 'Circular dependencies create hard-to-debug issues',
  from: {},
  to: {
    circular: true
  }
}
```

#### Rule 2: Layer Access Control
```javascript
// Controllers can import services, not repositories
{
  name: 'controllers-to-repos-forbidden',
  severity: 'error',
  from: {
    path: '^src/controllers'
  },
  to: {
    path: '^src/repositories',
    pathNot: '^src/types|^src/utils'
  }
}
```

#### Rule 3: Dependency Direction
```javascript
// Utils never import services
{
  name: 'utils-no-services',
  severity: 'error',
  from: {
    path: '^src/utils'
  },
  to: {
    path: '^src/services'
  }
}
```

#### Rule 4: Boundary Enforcement
```javascript
// SDK cannot import server code
{
  name: 'sdk-no-server',
  severity: 'error',
  from: {
    path: '^sdk/'
  },
  to: {
    path: '^src/'
  }
}
```

### Implementation Plan

#### Phase 1: Install and Configure (Week 1)
```bash
npm install --save-dev dependency-cruiser
npx depcruise --init
```

Create `.dependency-cruiser.js` with rules.

#### Phase 2: Add npm Script
```json
// package.json
{
  "scripts": {
    "arch:test": "depcruise src --config .dependency-cruiser.js --output-type err-long"
  }
}
```

#### Phase 3: Fix Existing Violations
```bash
npm run arch:test
# Fix reported violations
# Or add exemptions with documented justification
```

#### Phase 4: Add to CI
```yaml
# .github/workflows/ci.yml
- name: Architecture Fitness
  run: npm run arch:test
```

#### Phase 5: Add Pre-Commit Hook
```bash
# .husky/pre-commit
npm run arch:test
```

### Fitness Function Examples

#### Test 1: Controllers Don't Skip Services
```typescript
// tests/architecture/controller-layers.test.ts
import { madge } from 'madge';

test('controllers should not import repositories directly', async () => {
  const result = await madge('src/controllers');
  const dependencies = result.obj();
  
  Object.keys(dependencies).forEach(controller => {
    dependencies[controller].forEach(importPath => {
      expect(importPath).not.toMatch(/\.\.\/repositories/);
    });
  });
});
```

#### Test 2: Services Don't Import Controllers
```typescript
test('services should not import controllers', async () => {
  const result = await madge('src/services');
  const dependencies = result.obj();
  
  Object.keys(dependencies).forEach(service => {
    dependencies[service].forEach(importPath => {
      expect(importPath).not.toMatch(/\.\.\/controllers/);
    });
  });
});
```

#### Test 3: No Circular Dependencies
```typescript
test('no circular dependencies should exist', async () => {
  const result = await madge('src/');
  const circulars = result.circular();
  
  expect(circulars).toHaveLength(0);
});
```

## Alternatives Considered

### Alternative 1: Manual Code Review Only
**Rejected because:**
- Doesn't scale
- Human error rate high
- Reviews become bottleneck
- Violations slip through silently

### Alternative 2: TypeScript Path Mappings
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@controllers/*": ["src/controllers/*"],
      "@services/*": ["src/services/*"],
      ...
    }
  }
}
```

**Rejected because:**
- Lengthy import statements
- Doesn't prevent wrong imports
- Just aliases, doesn't enforce direction
- Works with fitness functions, not replacement

### Alternative 3: Custom ESLint Plugin
**Rejected because:**
- High maintenance overhead
- Reinventing dependency-cruiser
- Better to use battle-tested tools
- Can add later for project-specific rules

### Alternative 4: Nx/Lerna Monorepo
**Rejected because:**
- Over-engineered for current size
- Migration cost high
- Adds build complexity
- Better for larger teams/repos

## Consequences

### Positive
- Architectural violations caught automatically
- CI fails on boundary breaks
- New developers get immediate feedback
- ADR-002 becomes enforced, not just documented
- Prevents architectural drift

### Negative
- Initial setup effort (~2-4 hours)
- Existing violations need fixing
- False positives possible (configure exemptions)
- One more tool to learn

### Mitigation
- Document exemptions in `.dependency-cruiser.js` comments
- Add to onboarding docs
- Start with warnings, escalate to errors later

## Metrics

Track architecture health:
```javascript
// Add to package.json scripts
"arch:report": "depcruise src --config .dependency-cruiser.js --output-type metrics"
```

**Metrics to track:**
- Circular dependency count (target: 0)
- Layer violation count (target: 0)  
- Average module coupling (target: decreasing)
- Maximum dependency depth (target: < 5)

## Success Criteria

- [ ] dependency-cruiser installed and configured
- [ ] All existing violations fixed or documented
- [ ] CI pipeline includes architecture tests
- [ ] Pre-commit hooks prevent new violations
- [ ] Zero circular dependencies
- [ ] Zero layer boundary violations

## Timeline

**Week 1:** Install, configure, add to CI  
**Week 2:** Fix existing violations  
**Week 3:** Add to pre-commit, documentation  
**Week 4:** Review metrics, adjust rules

## References

- Building Evolutionary Architectures (Ford, Parsons, Kua)
- fitness functions concept
- dependency-cruiser documentation
- madge documentation

## Review History

- 2025-06-22: Initial proposal
