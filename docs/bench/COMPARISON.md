# Retrieval comparison

## Summary

This comparison is based on the audit of the candidate query layer and the enabled/disabled flag behavior in [server/src/services/recommendation/candidate.service.js](../../server/src/services/recommendation/candidate.service.js).

| Phase | Strategy           | Default | Outcome                                              |
| ----- | ------------------ | ------- | ---------------------------------------------------- |
| Q0    | legacy-city-regex  | yes     | vulnerable to alias drift                            |
| Q3    | city-variant-union | no      | better canonical recall, stays behind a feature flag |

## Why this matters

The main issue was not ranking or route logic. It was that the destination city was often checked against a single raw string or a narrow regex, which misses valid records when the dataset contains equivalents such as Mysuru and Mysore or Bangalore and Bengaluru.

## Recommended rollout

1. Keep the legacy path as the default for safety.
2. Enable the v2 flag in a controlled environment.
3. Compare recall for city canonical families in shadow mode.
4. Promote to production only after the benchmark confirms improvement without regressions.
