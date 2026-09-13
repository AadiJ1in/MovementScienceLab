# Chronological temporal transport stress test

## Why this is needed

Participant-grouped cross-validation protects against placing the same participant in both train and validation folds, and leave-one-site-out testing probes site transport. Neither directly answers a deployment question: **does a model developed from earlier, fully observed data retain performance on genuinely later prediction opportunities?**

`ml/temporal_transport_stress_test.py` creates that internal chronological stress test.

## Historical cutoff rule

The analyst must pre-specify a `development_cutoff` timestamp.

Development rows are eligible only when:

```text
outcome_window_end <= development_cutoff
```

This prevents the simulated historical model from using labels that would not yet have been known at the cutoff.

Temporal test rows are eligible only when:

```text
index_time > development_cutoff
```

Rows with an index before/on the cutoff but an outcome window ending after the cutoff are deliberately excluded as **straddling rows**. Their labels were unresolved at the simulated development date, so allowing them into model development would introduce temporal leakage.

## Frozen later-period evaluation

Within the earlier development period only, the existing nested grouped machinery selects:

- model family,
- calibration model,
- operating threshold.

The chosen model is fitted on the earlier period, then all three choices are frozen before evaluating the later period. Later outcomes do not select the model, recalibrate it, or tune the threshold.

The report includes:

- AUROC and AUPRC,
- prevalence and AUPRC lift,
- Brier score and skill,
- sensitivity and specificity at the frozen threshold,
- calibration intercept/slope and expected calibration error,
- participant-cluster bootstrap confidence intervals,
- later-period subgroup audit where metadata/sample size allow it.

## Participant overlap across time

The same participant may legitimately appear in an earlier development period and a later prediction period in a deployment-like longitudinal cohort. The tool therefore **reports** this overlap rather than automatically rejecting it.

This is one reason the report must not be called independent external validation. A stricter participant-independent temporal validation can be run by constructing a later cohort containing only new participants.

## Minimum reportability

The later period must contain:

- at least 10 participants,
- at least 2 participants with the outcome,
- at least 2 participants without the outcome,
- both row-level outcome classes.

These are minimal reporting safeguards for this stress-test utility, not claims that such a sample is adequate for clinical validation. The separate pre-specified data-adequacy gate remains required for actual model-development planning.

## Interpretation

This report is labeled:

```text
internal-temporal-transport-stress-only
```

It can reveal degradation associated with time, season, workflow changes, population drift, equipment changes, or evolving training patterns. Passing it does not establish external validity or clinical utility.

The product gate remains fail-closed:

```text
eligibleForUserFacingInjuryProbability = false
```
