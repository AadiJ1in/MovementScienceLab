# Prospective injury cohort schema

The injury benchmark must be trained from a cohort table where each row represents one prediction opportunity defined **before** the future outcome window begins.

## Required temporal columns

| Column | Meaning |
| --- | --- |
| `participant_id` | Stable participant identifier used for grouped validation. |
| `index_time` | Exact time at which the model would have made the prediction. |
| `feature_cutoff_time` | Latest timestamp from any source used to build predictors in that row. Must be `<= index_time`. |
| `outcome_window_end` | End of the future outcome window. Must equal `index_time + horizon`. |
| `injury_within_horizon` | Binary target: `1` only when the target injury occurs after `index_time` and on/before `outcome_window_end`. |

All timestamps must be parseable and are normalized to UTC by the audit.

## Strongly recommended outcome-audit columns

| Column | Meaning |
| --- | --- |
| `injury_event_time` | Timestamp of the adjudicated injury event. Required for direct verification of every positive label. |
| `outcome_event_id` | Stable event/episode ID. Lets the audit detect the same injury being reused as the positive outcome for multiple prediction rows. |
| `site_id` | Site/team/clinic identifier for subgroup and future transportability checks. |
| `sex` | Subgroup metadata when lawfully collected and appropriate for the study. |
| `age_group` | Pre-specified age stratum for subgroup audit. |
| `sport` | Sport/activity stratum. |

## Prediction-window rule

Overlapping future windows for the same participant are blocked by default. They can create strongly correlated labels and can let one injury event appear to provide multiple independent positive examples.

A repeated-risk design may explicitly pass `--allow-overlapping-windows`, but the audit artifact will retain the overlap count and a warning. This option does **not** make the rows statistically independent and does not convert the resulting evaluation into external validation.

## Canonical training command

Use `ml/train_prospective_injury_model.py`, not the lower-level benchmark module directly. The canonical entry point:

1. writes a cohort timing/leakage audit,
2. stops if that audit fails,
3. only then runs the nested participant-grouped benchmark,
4. marks feature timing as audited because it was verified from row-level timestamps.

The lower-level `prospective_injury_benchmark.py` remains importable for research tooling and tests but should not be used to bypass the cohort audit for reportable results.

## Outcome-label rule

When `injury_event_time` is available:

- positive rows require `index_time < injury_event_time <= outcome_window_end`,
- negative rows cannot contain an injury event inside that interval,
- an event before or at `index_time` is prior history, not a future outcome.

## Feature construction rule

`feature_cutoff_time` is the latest source timestamp, not the time the feature-engineering script happened to run. For example, a 28-day training-load feature generated today from activity records through yesterday must use yesterday's latest included activity time as the cutoff.

Aggregate variables must never include data from the outcome window. Any feature whose source time cannot be reconstructed should be excluded from a prospective claim until its provenance is auditable.
