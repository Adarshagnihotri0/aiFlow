# Evidence Ladder

## Evidence Value Hierarchy

```
P0: Stack trace       (★★★★★) - Shows exact failing line
P1: Failing line      (★★★★☆) - Narrows scope to single location
P2: Variable state    (★★★☆☆) - Shows what data looked like
P3: Call path         (★★☆☆☆) - Shows how you got there
P4: Root cause theory (★☆☆☆☆) - Explanation (LAST)
```

## Debugging Protocol

### Phase 1: Document Evidence Gaps

```markdown
Observation: [What happened]
Missing Evidence: [P0, P1, P2...]
Status: Root cause UNKNOWN
Next Action: [Get highest-priority evidence]
```

### Phase 2: After Stack Trace (P0)

```markdown
Failing Line: [file:line]
Root Cause: [Direct observation]
Fix: [Minimal change]
```

## Rules

1. **Status = UNKNOWN until P0 obtained**
2. **Maximum 2 hypotheses before P0-P2**
3. **Hypotheses are not evidence**
4. **Stop analysis when evidence gap identified**
5. **Root cause not confirmed until failing execution path AND failing condition directly observed**

## Evidence Collection Methods

### P0: Stack Trace
- Run with error logging
- Check server logs
- Use debugger

### P1: Failing Line
- Read stack trace
- Open file at line number
- Check surrounding code

### P2: Variable State
- Add logging
- Use debugger
- Check request/response payloads

### P3: Call Path
- Stack trace shows this
- Logging entry/exit points

### P4: Root Cause Theory
- **This is the output, not the input**
- Generate AFTER exhausting P0-P2
- State confidence level based on evidence

## Example

### Before Evidence Ladder
```
Observation: 500 error
Hypothesis 1: Database connection
Hypothesis 2: Missing API key
Hypothesis 3: Network timeout
Recommendation: Check database config
```

**Problem**: Guessing without evidence.

### After Evidence Ladder
```
Observation: 500 error
P0: Get stack trace
  → TypeError at jwt.strategy.ts:45
P1: Find failing line
  → ExtractJwt.fromAuthHeaderAsBearerToken()
P2: Check state
  → authHeader = "Bearer session_token"
     (not a JWT)
Root Cause: JWT parser called on session token
Fix: Skip JWT validation for @Public() routes
```

**Better**: Evidence-driven narrowing.
