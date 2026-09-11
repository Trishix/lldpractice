# Evaluation calibration

No live Groq run or independent human rating is available for this delivery. The executable fixture check passes, but that does not verify assessment accuracy. [Recorded result](calibration-results/latest.json): `unverified_missing_credentials`, ten fixtures, zero live rows.

## Fixtures and protocol

[Fixture source](../scripts/calibration/fixtures.ts) contains five structured designs per problem:

| Fixture | Authored expectation |
|---|---|
| Strong conventional | Coherent responsibilities, legal transitions, and justified choices receive supported ratings. |
| Strong alternative | An immutable reducer and different collaborator names are accepted when behavior satisfies the same rules. |
| Incomplete | Omissions are “Not demonstrated”; the report does not invent evidence or assume a contradiction. |
| Contradictory | A specific rejected-move or overshoot violation is identified with an exact quote. |
| Verbose/adversarial | Embedded instructions do not override the trusted rubric or earn ungrounded marks. |

Both strong fixtures repeat three times per problem: 18 initial calls across all fixtures. Actual clarification responses receive an answered final review. Four authored final-round cases also exercise answered/skipped clarification for both problems. That is 22 base calls, up to 40 if every initial review asks clarification. Calls run sequentially; each invocation makes exactly one provider call. Rate/quota limits and rejected credentials stop the batch.

```sh
# Validate all fixtures and record availability; sends no provider requests.
npm run verify:calibration

# Explicit live calibration after configuring a local server-only key.
CALIBRATION_LIVE=1 npm run verify:calibration
```

The runner reads `.env.local` locally. Selection is calibration role, then shared default, then eligible fallback. It records no key or raw reasoning. Configuration is `openai/gpt-oss-120b`, medium reasoning, strict output, 8,192 completion tokens, 60-second provider deadline, and one retry only for provider JSON-schema generation failures.

## Recorded measurements and targets

The [runner](../scripts/calibration/run.test.ts) records fixture/repetition/phase, outcome, latency, token usage, criterion ratings, marks, findings, evidence validity, and authored contradiction detection. Invalid or truncated output records failure and publishes no marks. Strong groups require three completed reports and a maximum five-mark range; incomplete groups cannot pass.

Independent human ratings can be supplied with `CALIBRATION_HUMAN_RATINGS=/absolute/path/ratings.json`. The file maps fixture IDs to all five criterion IDs with integer 0–4 ratings. Complete baseline coverage requires 90 criterion comparisons, with at least 90% within one level. Missing or partial human coverage remains unverified. A human should also inspect whether alternatives were accepted for sound reasons and whether contradiction findings identify the actual authored violation.

| Acceptance target | Current evidence |
|---|---|
| No invalid published evidence addresses | Covered by API/domain rejection tests; live model outputs unverified |
| Authored contradictions detected | Fixtures authored; live detection unverified |
| Supported alternatives accepted | Fixtures authored; semantic acceptance unverified |
| ≥90% human agreement within one criterion level | No independent ratings; unverified |
| ≤5 marks across strong repeats | No live repeats; unverified |
| Live latency and token use | No eligible credential; unverified |

Mocked provider tests prove transport, schema, arithmetic, and state behavior. They do not establish grading quality, fairness, latency, or live structured-output reliability.
