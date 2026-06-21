# ESLint Overrides Tracking

**Purpose:** Document all ESLint suppressions with justification and exit strategy.

**Last Updated:** 2025-06-22

---

## Summary

**Total Suppressions:** 59 issues  
**Percentage:** 41% of 145 total issues  
**Risk Level:** MEDIUM - Requires review each sprint

---

## Override Inventory

### 1. Server Route Handlers (server.ts)

**Rule:** `@typescript-eslint/no-misused-promises`  
**Location:** `.eslintrc.json` → `overrides[0]`  
**Files:** `src/server.ts`  
**Scope:** All Express route handlers  
**Issues Suppressed:** ~7  
**Reason:** Express route handlers must be async for async/await usage, but ESLint flags promise return in void context  
**Risk:** Medium - Could hide unhandled promises  
**Exit Strategy:** 
- Option 1: Create async handler wrapper
- Option 2: Use express-async-errors package
- Timeline: Review Q3 2026

```typescript
// Current pattern (suppressed)
app.post('/v1/messages', async (req, res) => { ... });

// Alternative solution (future)
app.post('/v1/messages', wrapAsync(async (req, res) => { ... }));
```

---

### 2. Unsafe Operations in Server (server.ts)

**Rules:**
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-return`

**Location:** `.eslintrc.json` → `overrides[0]`  
**Files:** `src/server.ts`  
**Scope:** Entire server.ts file  
**Issues Suppressed:** ~110 (combined with #1)  
**Reason:** Request bodies are `any` by Express design; extensive type guards at boundaries compensate  
**Risk:** Medium - Type safety relies on manual validation  
**Exit Strategy:**
- Create typed request interfaces in `src/types/api.ts` (DONE)
- Add request validation middleware
- Incrementally enable rules per route
- Timeline: Q2-Q3 2026

**Progress:**
- ✅ Created type guards (`isAnthropicMessagesRequest`, etc.)
- ⏳ Apply to routes
- ⏳ Enable rules incrementally

---

### 3. Database Pool Fallback (db/client.ts)

**Rule:** 
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/require-await`

**Location:** `.eslintrc.json` → `overrides[1]`  
**Files:** `src/db/client.ts`  
**Scope:** Dummy pool implementation  
**Issues Suppressed:** 4  
**Reason:** Graceful degradation when `DATABASE_URL` not set requires mock pool  
**Risk:** Low - Only active when database disabled  
**Exit Strategy:**
```typescript
// Current (suppressed)
return {
  query: async () => { ... },
  end: async () => {},
  on: () => {}
} as any;

// Alternative (future)
class DummyPool implements Pool {
  async query() { console.warn(...); return { rows: [] }; }
  async end() {}
  on() {}
}
```
- Timeline: Q3 2026

---

### 4. Namespace Augmentation (types/context.ts, middleware/context.ts)

**Rule:** `@typescript-eslint/no-namespace`  
**Location:** `.eslintrc.json` → `overrides[2]`  
**Files:** `src/types/context.ts`, `src/middleware/context.ts`  
**Scope:** Type augmentation blocks  
**Issues Suppressed:** 2  
**Reason:** TypeScript/Express require namespace for Request augmentation  
**Risk:** None - This is the correct pattern  
**Exit Strategy:** No alternative; keep suppression indefinitely  
**Reference:** https://www.typescriptlang.org/docs/handbook/declaration-merging.html

---

### 5. SDK Separate Configuration (sdk/)

**Rule:** ESLint parser error (tsconfig mismatch)  
**Location:** `.eslintrc.json` → `ignorePatterns`  
**Files:** `sdk/**`, `ai-runtime-cli/**`, `cli/**`  
**Scope:** Entire directories  
**Issues Suppressed:** 4 (parsing errors, not real issues)  
**Reason:** SDK has separate tsconfig, shouldn't be linted by root config  
**Risk:** None - SDK has its own linting  
**Exit Strategy:** 
- Add SDK-specific `.eslintrc.json`
- Add SDK lint command to package.json
- Timeline: Q2 2026

---

## Suppression Metrics

| Category | Count | Risk | Review Frequency |
|----------|-------|------|-------------------|
| Server async handlers | 7 | Medium | Quarterly |
| Server unsafe ops | 110 | Medium | Monthly |
| Database fallback | 4 | Low | Quarterly |
| Namespace augmentation | 2 | None | Annually |
| SDK separate config | 4 | None | N/A |
| **TOTAL** | **127** | - | - |

**Note:** 127 suppressions map to 59 unique issues due to overlap.

---

## Review Schedule

### Monthly Review (High Risk)
- [ ] Server unsafe operations
- [ ] Warning trend not increasing

### Quarterly Review (Medium Risk)
- [ ] Server async handlers - evaluate wrapper pattern
- [ ] Database fallback - evaluate typed implementation
- [ ] Overall suppression count not growing

### Annually (Low Risk)
- [ ] Namespace augmentations still necessary
- [ ] SDK config approach still appropriate

---

## Exit Criteria

**Goal:** Reduce suppressions from 59 → 30 by Q4 2026

**Milestones:**
1. ✅ Create type guards (DONE)
2. ⏳ Apply validation middleware
3. ⏳ Enable server rules incrementally (target: 30 suppressions)
4. ⏳ Add async wrapper for Express
5. ⏳ Type database fallback

---

## Risk Assessment

### What Could Go Wrong

1. **Suppressions Become Permanent** (HIGH)
   - Without exit strategy, suppressions accumulate
   - Mitigation: Quarterly review + metrics tracking

2. **Future Issues Hidden** (MEDIUM)
   - Suppressed rules won't catch new violations
   - Mitigation: Manual code review + TypeScript checks + tests

3. **Technical Debt Invisible** (MEDIUM)
   - Suppress count may grow unnoticed
   - Mitigation: Add to PR template, track in LINT_COMPLIANCE.md

---

## Related Documents

- `.eslintrc.json` - Override configuration
- `docs/tech-debt/LINT_COMPLIANCE.md` - Overall compliance tracking
- `docs/architecture/ADR-001-functional-programming.md` - Architecture patterns
- `src/types/api.ts` - Request type guards (exit strategy progress)
