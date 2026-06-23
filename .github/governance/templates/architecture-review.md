# Architecture Review Checklist

## Pre-Review

- [ ] Problem classified as Architecture (not Debugging/Config/Research)
- [ ] Decision Cost Filter applied (C0-C4)
- [ ] OIR template used

## Observation Check

- [ ] Observations are direct quotes or measurements
- [ ] No interpretation mixed into observations
- [ ] Evidence strength rated (★★★★☆ to ★★☆☆☆)
- [ ] Source locations provided (file:line)

## Interpretation Check

- [ ] Interpretation clearly separated from observation
- [ ] Logic connecting O → I is explicit
- [ ] Assumptions listed (if any)
- [ ] Alternative interpretations considered

## Recommendation Check

- [ ] Recommendation follows from interpretation
- [ ] Specific action identified
- [ ] Files affected listed
- [ ] Impact assessed

## Confidence Check

- [ ] Confidence matches evidence strength
- [ ] High confidence only with P0-P1 evidence
- [ ] Low confidence with P3-P4 evidence

## Validation Check

- [ ] Implementation plan clear
- [ ] Tests added/modified
- [ ] No new violations introduced
- [ ] Documentation updated

## Governance Check

- [ ] OIR documented before implementation
- [ ] Calibration entry created
- [ ] ROI tracked (governance artifacts vs code changes)

---

## Signs of Good Architecture Review

✅ Observations are indisputable facts
✅ Interpretation acknowledges uncertainty
✅ Recommendation is testable
✅ Confidence calibrated to evidence
✅ Alternatives considered

## Signs of Bad Architecture Review

❌ Observations include opinions ("bad code")
❌ Interpretation presented as fact
❌ Recommendation without reasoning
❌ High confidence with weak evidence
❌ No alternatives considered
