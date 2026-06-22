# Example: Architecture Decision

## Problem

Should we extract GatewayService from gateway controller?

---

## Problem Classification

```
Question: "Should we extract GatewayService?"
Type: Architecture
Methodology: OIR
Decision Cost: C2 (Architectural)
```

**Why Architecture?**
- Multiple valid approaches exist
- Trade-off analysis needed
- Affects structure and boundaries

---

## OIR Application

### Observation

```typescript
// gateway.controller.ts
async proxyMessages() {
  const credentials = await this.gateway.useSession(sessionToken);
  const openaiRequest = anthropicToOpenAI(body);
  const response = await fetch(`${credentials.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify(openaiRequest),
  });
  // ... response handling
}
```

**Direct observations**:
- Controller has 85 lines
- Contains session validation (line 52-58)
- Contains request transformation (line 60-66)
- Contains fetch call (line 68-74)
- Contains response handling (line 76-85)

**Evidence**: ★★★★☆ (Direct, file measurements)

---

### Interpretation

**Current state**:
- Controller mixes business logic (session validation) with HTTP handling
- Translation logic is separate (good)
- Fetch call and response handling are infrastructure concerns

**Potential violations**:
- Single Responsibility Principle (controller doing too much)
- But: No layer boundaries defined yet

**Trade-offs**:

**Option 1: Extract GatewayService**
- Pros: Cleaner controller, reusable logic
- Cons: More abstraction, potentially premature

**Option 2: Keep in controller**
- Pros: Simple, all in one place
- Cons: Harder to test session logic

**Assumptions**:
- Assuming we want to test session validation independently
- Assuming this will grow in complexity

---

### Recommendation

**Extract GatewayService with minimal scope**:

```typescript
// GatewayService
async validateAndRoute(sessionToken: string, body: any) {
  const credentials = await this.useSession(sessionToken);
  const openaiRequest = anthropicToOpenAI(body);
  const response = await fetch(/* ... */);
  return openAIToAnthropic(response, body.model);
}

// GatewayController
@Post('v1/messages')
async proxyMessages() {
  return this.gateway.validateAndRoute(sessionToken, body);
}
```

**Reasoning**:
- Session validation + routing belong together
- Controller becomes thin wrapper
- Minimal abstraction (2 methods)

**Confidence**: Medium (★★★☆☆)
- Direct evidence of complexity
- Assumption about future growth unverified

---

## Validation Plan

- [ ] Create GatewayService
- [ ] Move session validation + routing
- [ ] Add unit tests for session validation
- [ ] Measure if controller simpler
- [ ] Check: premature abstraction?

---

## Alternatives Considered

### Alternative 1: Keep in Controller

**Why not chosen**:
- Session validation not testable independently
- Controller already 85 lines

### Alternative 2: Extract SessionService AND RoutingService

**Why not chosen**:
- Too many abstractions
- Premature optimization

---

## Implementation

```typescript
// gateway.service.ts
@Injectable()
export class GatewayService {
  async validateAndRoute(sessionToken: string, body: any) {
    const credentials = await this.validateSession(sessionToken);
    const openaiRequest = anthropicToOpenAI(body);
    
    const response = await fetch(`${credentials.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.apiKey}`,
      },
      body: JSON.stringify(openaiRequest),
    });
    
    if (!response.ok) {
      throw new Error(`Gateway error: ${response.status}`);
    }
    
    const openaiResponse = await response.json();
    return openAIToAnthropic(openaiResponse, body.model);
  }
}
```

---

## Outcome

✅ Service extracted  
✅ Controller simpler (30 lines → 15 lines)  
✅ Session validation testable  
✅ No new violations  

**Decision**: Correct extraction, but borderline C1/C2.

With hindsight, could have been C1 (Tactical) - single module behavior.

---

## Calibration Entry

```markdown
Claim: GatewayService extraction improves code quality
Evidence Level: P0 (direct measurement before/after)
Confidence: 85%
Outcome: Correct
Issue: Slight over-abstraction, but justified by testability gain
```

---

## Lessons

### What Worked
- Used OIR for architectural question
- Considered alternatives
- Minimal abstraction (not premature optimization)
- Validated with actual refactor

### What Could Improve
- Measure complexity before declaring problem
- Define clear boundaries before extracting
- Track whether testability actually needed

### Decision Cost Filter Check

**Initial classification**: C2 (Architectural)  
**Actual impact**: C1 (Single module behavior)

**Lesson**: When in doubt, start with lighter OIR. Upgrade to full OIR if assumptions proven wrong.
