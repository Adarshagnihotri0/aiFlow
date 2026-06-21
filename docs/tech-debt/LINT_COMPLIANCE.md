# LINT_COMPLIANCE.md

## Status
**Architecture Enforcement System:** COMPLETE ✅  
**Codebase Compliance:** IN PROGRESS ⚠️

**Last Updated:** 2025-06-22

---

## Summary
The repository now enforces coding standards through:
- Engineering Constitution
- Domain Prompts
- Agent Workflows
- ESLint
- TypeScript Strict Mode
- ADRs
- Review Checklist

The enforcement system is **operational**.

**Existing code predates these standards and contains known violations.**

---

## Current Compliance Metrics

| Category | Status |
|----------|--------|
| TypeScript Build | ✅ PASS |
| Tests | ✅ PASS (9/9) |
| Architecture Enforcement | ✅ ACTIVE |
| ESLint | ❌ FAILING (known debt) |

### ESLint Snapshot (2025-06-22)
- **Errors:** 141
- **Warnings:** 27
- **Total Issues:** 168

These violations are **tracked technical debt**.  
They do **not** indicate that the enforcement system is malfunctioning.

---

## Policy

### New Code
All new code must:
- ✅ Pass lint
- ✅ Pass typecheck
- ✅ Pass tests
- ✅ Follow repository constitution
- ✅ Follow applicable domain prompts

**No new violations should be introduced.**

### Existing Code
Existing violations should be fixed when:
- Touching the file for feature work
- Refactoring the module
- Working in the affected area

**Avoid large "lint-only" rewrites unless explicitly scheduled.**

---

## Priority Order

### P0 - Must Fix Immediately
- ❌ Unsafe promise handling (`no-floating-promises`)
- ❌ Potential runtime errors
- ❌ Security-related findings

### P1 - High Value
- ⚠️ Explicit return types (`explicit-function-return-type`)
- ⚠️ Type safety violations (`no-unsafe-*`)
- ⚠️ Unused exports (`no-unused-vars`)

### P2 - Maintainability
- 📝 Naming improvements
- 📝 Documentation gaps
- 📝 Style inconsistencies

### P3 - Cosmetic
- 💄 Formatting
- 💄 Minor warnings

---

## Goal: Target Milestones

### Phase 1: Critical Safety (Est. 2-3 hours)
**Target:** Fix all P0 issues

**Commands:**
```bash
npm run lint 2>&1 | grep "no-floating-promises"
npm run lint 2>&1 | grep "no-unsafe-"
```

**Focus Areas:**
- [ ] Add `await` or `.catch()` to floating promises
- [ ] Fix unsafe `any` assignments that could cause runtime errors
- [ ] Address security-sensitive type violations

**Success Criteria:**
- [ ] No floating promises
- [ ] No unsafe type assertions without justification
- [ ] All promise chains properly handled

**Estimated Issues:** ~20-30

---

### Phase 2: Type Safety Foundation (Est. 3-4 hours)
**Target:** Fix P1 type violations

**Focus Areas:**
- [ ] Add explicit return types to public functions
- [ ] Replace `any` with `unknown` + type guards
- [ ] Fix unsafe member access on untyped objects
- [ ] Create proper type definitions where missing

**Success Criteria:**
- [ ] All public functions have return types
- [ ] `any` usage reduced by 80%
- [ ] No unsafe assignments without type checking

**Estimated Issues:** ~50-70

---

### Phase 3: Code Cleanup (Est. 1-2 hours)
**Target:** Fix P1-P2 maintainability issues

**Focus Areas:**
- [ ] Remove or prefix unused variables (`_` prefix)
- [ ] Remove unused imports
- [ ] Add missing JSDoc comments
- [ ] Improve naming (replace vague names)

**Success Criteria:**
- [ ] No unused variables
- [ ] All exports documented
- [ ] Clear, descriptive names

**Estimated Issues:** ~30-40

---

### Phase 4: Polish (Est. 1 hour)
**Target:** Clear remaining P3 warnings

**Focus Areas:**
- [ ] Fix remaining warnings
- [ ] Code formatting consistency
- [ ] Minor style improvements

**Success Criteria:**
- [ ] `npm run lint` exits with code 0
- [ ] Error count: 0
- [ ] Warning count: 0

**Estimated Issues:** ~20-30

---

## Tracking Progress

### Roadmap

| Milestone | Est. Time | Est. Issues | Status | Completion |
|-----------|-----------|-------------|--------|------------|
| Phase 1: Critical Safety | 2-3h | 20-30 | ⏳ NOT STARTED | 0% |
| Phase 2: Type Safety | 3-4h | 50-70 | ⏳ NOT STARTED | 0% |
| Phase 3: Code Cleanup | 1-2h | 30-40 | ⏳ NOT STARTED | 0% |
| Phase 4: Polish | 1h | 20-30 | ⏳ NOT STARTED | 0% |
| **TOTAL** | **7-10h** | **168** | - | **0%** |

### Update Log

| Date | Phase | Issues Fixed | Files Modified | Notes |
|------|-------|--------------|----------------|-------|
| 2025-06-22 | - | 0 | 0 | Initial assessment |
| - | - | - | - | - |

---

## Files Requiring Attention

### High Priority (>10 issues each)
1. **`src/server.ts`** - ~40 issues
   - Request handler type safety
   - Promise handling
   - `any` types

2. **`src/utils/logger.ts`** - ~15 issues
   - Template literal type errors
   - Object stringification

3. **`src/utils/prompt-builder.ts`** - ~20 issues
   - Unused variables
   - Unsafe member access

### Medium Priority (5-10 issues)
4. `src/adapters.ts`
5. `src/bedrock.ts`
6. `src/db/client.ts`

### Lower Priority (<5 issues)
- Remaining utility files
- Type definition files

---

## How to Contribute

### When Working on a File
1. Run `npm run lint src/path/to/file.ts`
2. Fix violations in that file
3. Ensure tests still pass: `npm test`
4. Update this document's progress

### Quick Wins
```bash
# Find unused variables
npm run lint 2>&1 | grep "no-unused-vars"

# Find missing return types
npm run lint 2>&1 | grep "explicit-function-return-type"

# Find floating promises
npm run lint 2>&1 | grep "no-floating-promises"

# Find any types
npm run lint 2>&1 | grep "no-explicit-any"
```

---

## Known Exceptions

The following patterns are acceptable violations (document in `.eslintrc.json` if needed):

1. **External library types** - Some third-party types are loose
2. **Test fixtures** - Mock data can use relaxed types with comments
3. **Legacy database queries** - Document with `// TODO: type properly`

---

## Success Metrics

### Short-term (Phase 1 complete)
- [ ] No floating promises
- [ ] No runtime-safety violations
- [ ] Error count reduced by 15-20%

### Medium-term (Phase 2 complete)
- [ ] All public functions have return types
- [ ] `any` count reduced by 80%
- [ ] Error count reduced by 50%

### Long-term (Phase 4 complete)
- [ ] `npm run lint` exits with code 0
- [ ] Error count: 0
- [ ] Warning count: 0
- [ ] CI enforces lint as blocking check

---

## Related Documents

- **Architecture ADR-001:** `docs/architecture/ADR-001-functional-programming.md`
- **Constitution:** `.github/copilot-instructions.md`
- **ESLint Config:** `.eslintrc.json`
- **Architecture Enforcement:** `docs/ARCHITECTURE_ENFORCEMENT.md`

---

## Notes

**Why not fix all issues immediately?**
1. **Risk mitigation** - Large refactorings increase bug risk
2. **Context** - Better fixes come from feature understanding
3. **Review burden** - Smaller, focused PRs are easier to review
4. **Business priority** - Features ship before perfect code

**The goal is clean code eventually, not clean code immediately.**

---

## Assignment

**Owner:** Development Team  
**Reviewer:** Tech Lead  
**Approver:** Project Lead  

**Suggested Approach:**
- Add "fix lint in touched files" to PR requirements
- Create dedicated lint-fix PRs during slow periods
- Update progress in this document after each milestone

---

**Last Validation:** 2025-06-22  
**Next Review:** When Phase 1 begins
