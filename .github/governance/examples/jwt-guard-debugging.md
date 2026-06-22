# Example: JWT Guard Debugging

## Problem

Gateway returns 500 Internal Server Error when using session token.

---

## Initial Evidence Collection

### Observation
```
Request: POST /v1/messages
Response: {"statusCode":500,"message":"Internal server error"}
Log: ERROR [ExceptionsHandler] TypeError
```

Status: Root cause UNKNOWN  
Missing Evidence: P0 (stack trace), P1 (failing line), P2 (state)

---

## Evidence Ladder Application

### P0: Stack Trace (Missed Initially)

**What was tried**:
- Added logging to controller catch block
- Added process-level error handlers
- Results: NestJS exception filter caught error before handlers

**What should have been done**:
- Add logging to global JWT guard execution
- Capture actual exception before NestJS transforms it

---

### P1: Failing Line (Indirect)

**Observation**:
```
Controller entry log never appears
Request reaches server (logs show)
Response returned as 500 before controller executes
```

**Interpretation**: Error occurs in NestJS framework layer before controller method

**Evidence Level**: P1 (execution path traced)

---

### P2: State at Critical Point

**Code examination**:
```typescript
// jwt-auth.guard.ts:26
if (authHeader) {
  // Token present, try to validate it
  return super.canActivate(context);  // ← Calls JWT parser
}
```

**Observation**: Guard attempts JWT validation on @Public routes if auth header present

**State**:
- `authHeader = "Bearer c1W2Nk2tIlb63ruS8eFMNe6i-fONi647mfFsEyNZtqg"`
- This is a session token, not a JWT

---

## Hypotheses Generated

### Hypothesis 1: JWT parser throws TypeError on session token
**Evidence for**:
- Session tokens are base64url, not JWT format
- JWT parser expects specific format

**Evidence against**:
- None yet

### Hypothesis 2: Guard ignoring @Public decorator
**Evidence for**:
- Guard exists and runs before controller
- Controller marked @Public()

**Evidence against**:
- @Public() decorator confirmed present

---

## Root Cause

**Status**: CONFIRMED (after fix verified)

**What was initially declared**:
```
Root cause: JWT Guard failing to parse session token as JWT
Evidence: P3 (inferred from code reading)
```

**Issue**: Declared "ROOT CAUSE" before direct observation of guard throwing error.

**What should have been done**:
```
Add guard-level logging:
console.log('Guard execution:', {
  isPublic,
  authHeader,
  attempting: 'super.canActivate'
});
```

Then retry request and observe:
```
Guard execution: {
  isPublic: true,
  authHeader: "Bearer session_token",
  attempting: 'super.canActivate'
}
ERROR: TypeError at passport-jwt/extract_jwt.js:45
```

**Only then**: ROOT CAUSE CONFIRMED

---

## Fix Applied

```typescript
// Before
if (isPublic) {
  const authHeader = request.headers.authorization;
  if (authHeader) {
    return super.canActivate(context);  // ❌ Tries JWT validation
  }
  return true;
}

// After
if (isPublic) {
  return true;  // ✅ Skip all validation for public routes
}
```

---

## Outcome

✅ Fix applied  
✅ Request succeeds  
✅ Integration working  

---

## Calibration Entry

```markdown
Claim: JWT Guard caused failure
Evidence Level: P3 (inferred)
Confidence: 90%
Outcome: Correct
Issue: Declared before direct observation
Lesson: Should have added guard-level logging first
```

---

## Lessons Learned

### What Went Well
- Traced execution path to framework layer
- Identified guard as fault domain
- Evidence-driven narrowing (500 → pre-controller → guard)

### What Drifted
- Declared "ROOT CAUSE" before P0 (stack trace from guard)
- Continued theory building after finding @Public() present
- Should have reset: "@Public() present but error happens = hypothesis weakened"

### Better Process
1. Find controller never executes → framework layer issue
2. Identify guard exists → Possible fault domain
3. **Add guard logging first** → Get actual stack trace
4. Observe guard calling super.canActivate()
5. Observe JWT parser failing on session token
6. **Then** declare root cause

---

## Governance Score

| Category | Score | Notes |
|----------|-------|-------|
| Evidence collection | 8/10 | Found fault domain, missed guard instrumentation |
| Fault-domain narrowing | 9/10 | Correct path traced |
| Hypothesis discipline | 6/10 | Declared before P0 |
| Root-cause proof | 7/10 | Theory correct, evidence missing |
| Final outcome | 10/10 | Bug fixed |
| **Overall** | **B+** | Good result, process gap identified |
