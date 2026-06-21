# Tech Debt Tracking

**Last Updated:** 2026-06-22

---

## Lint Compliance Status

### Current State

**Total Issues:** 141 (down from 145)  
**Suppression Ratio:** 41% (59 issues)  
**Risk Level:** MEDIUM  
**Policy:** Suppression ratio must not increase

### Resolution Breakdown

- **Code Fix:** 56% (82 issues fixed)
- **Suppression:** 41% (59 issues suppressed)
- **False Positive:** 3% (4 issues N/A)

**Target:** Reduce suppression to 30% by Q4 2026

---

## ESLint Overrides Inventory

### Critical Override: Server Route Handlers

**Rule:** `@typescript-eslint/no-misused-promises`  
**Files:** `src/server.ts`  
**Issues:** ~7 suppressions  
**Reason:** Express route handlers must be async for async/await usage, but ESLint flags promise return in void context  
**Risk:** MEDIUM - Could hide unhandled promises

**Exit Strategy:**
- Option 1: Create async handler wrapper
- Option 2: Use express-async-errors package
- Timeline: Review Q3 2026

**Current Status:**
```typescript
// .eslintrc.json
{
  "overrides": [{
    "files": ["src/server.ts"],
    "rules": {
      "@typescript-eslint/no-misused-promises": "off"
    }
  }]
}
```

---

## Compliance Tracking

### Trend (Last 4 Weeks)

| Date | Total | Fixed | Suppressed | Ratio |
|------|-------|-------|------------|-------|
| 2026-05-25 | 145 | 78 | 62 | 43% |
| 2026-06-01 | 144 | 80 | 61 | 42% |
| 2026-06-15 | 142 | 81 | 60 | 42% |
| 2026-06-22 | 141 | 82 | 59 | 41% |

**Trend:** ✅ Improving (reduced from 43% to 41%)

---

## Next Actions

### Before Next Sprint

- [ ] Review all 59 suppressions for validity
- [ ] Identify quick wins (fixable in < 1 hour)
- [ ] Update exit strategy timeline

### Long-term

- [ ] Implement async handler wrapper for server.ts
- [ ] Achieve 30% suppression target by Q4 2026
- [ ] Add pre-commit hooks to prevent new suppressions

---

## Related Documentation

- **Examples:** `docs/examples/GOOD_LAYER_BOUNDARY.md` (clean architecture)
- **Architecture:** `docs/architecture/ADR-002-module-structure.md` (layer boundaries)
- **Constitution:** `.github/copilot-instructions.md` (compliance thresholds)

---

**Policy:** Tech debt documents are working references. Update after each architectural change.
