# SoccerMon non-camera prospective reference benchmark

## Why this exists

A camera-based injury-risk model should not be judged only against chance. It should eventually be tested against a credible reference model built from information already used in athlete monitoring, such as prior injury, training exposure, and wellness/readiness.

SoccerMon provides an open real-world dataset for building and stress-testing that **non-camera reference architecture**. It does not contain Movement Science Lab webcam measurements and therefore cannot validate camera incremental value by itself.

Dataset source:

- Midoglu et al. *A large-scale multivariate soccer athlete health, performance, and position monitoring dataset*. Scientific Data (2024). DOI: 10.1038/s41597-024-03386-x.
- Zenodo record: https://zenodo.org/records/10033832
- License: CC BY 4.0.

The published dataset contains two Norwegian elite women's soccer teams monitored across the 2020 and 2021 seasons. The subjective portion contains training-load, wellness, injury, illness, and game-performance reports. The paper reports 16,261 training-load reports, 17,002 wellness reports, and 306 injuries from 50 players. Published injury counts are highly imbalanced by team (291 for Team A and 15 for Team B), so site/team performance must be shown rather than hidden in an overall metric.

## Data used by this adapter

`ml/soccermon_reference.py` intentionally uses only the small subjective portion:

- `training-load/daily_load.csv`
- `wellness/readiness.csv`
- `wellness/sleep_quality.csv`
- `wellness/soreness.csv`
- `injury/injury.csv` (the adapter also recognizes `injuries.csv` for compatibility with earlier loader conventions)

It does **not** require the ~99 GB objective GPS archive.

## Prospective index construction

The adapter is intentionally conservative about date-only monitoring records.

For a future-risk period beginning on calendar day `D`:

- daily predictors may use data only through `D-1`;
- the prediction index is set to the final second before `D` begins;
- prior-injury history counts only injury timestamps at or before that index;
- a positive outcome requires a recorded injury strictly after the index and on or before the declared horizon end.

The default stride equals the prediction horizon. This creates non-overlapping future windows. A shorter stride is rejected unless an overlapping repeated-risk design is explicitly enabled.

## Reference predictors

The benchmark uses three non-camera domains:

### Previous injury history

- `previous_injury_count`
- `days_since_last_injury`

### Wellness/readiness

- `soreness_score`
- `sleep_quality_score`
- `readiness_score`

The latest available report in a short, pre-specified lookback period is used. Missing reports remain missing and are handled inside each training fold by the benchmark's imputation pipeline.

### Training exposure

- `session_rpe_load_7d`
- `session_rpe_load_28d`

These are rolling sums of SoccerMon's daily subjective training-load metric. They are candidate predictive inputs, not assumed causal dose-response relationships.

## Outcome definition

By default, the cohort labels **any recorded injury event** within the future horizon. `--injury-type-contains` can restrict the outcome using the source injury-type field, for example a pre-specified knee-only analysis.

Changing the injury filter changes the scientific target and must be accompanied by a matching research protocol/case definition. It must not be chosen after looking at which target gives the best model performance.

## Validation

The reference trainer reuses the repository's conservative prediction-model machinery:

- nested participant-grouped model selection;
- model-family selection inside outer training participants only;
- calibration and operating-threshold selection inside outer training data only;
- untouched outer predictions for the internal performance estimate;
- participant-cluster bootstrap uncertainty;
- subgroup audit;
- explicit team/site information;
- pre-specified data-adequacy requirements;
- prospective timestamp/leakage audit.

The final all-data model is saved only as a research artifact after nested evaluation.

## What this benchmark can establish

It can establish whether the Movement Science Lab research pipeline can build a reproducible, leakage-audited **non-camera** prospective reference model on a real open longitudinal dataset.

It can also provide a realistic baseline architecture for prior injury + load + wellness modelling.

## What it cannot establish

It does not establish:

- that SoccerMon predictors cause injury;
- a clinically validated injury probability;
- that a model trained in elite women's soccer transports to other sports, sexes, ages, competitive levels, or healthcare populations;
- that the Movement Science Lab webcam adds predictive value;
- that SoccerMon absolute performance can be subtracted from a different camera cohort's performance to estimate camera benefit.

Camera incremental value must be tested **within the same cohort and outcome**, using paired reference vs camera-expanded predictions as implemented in `ml/camera_incremental_value.py`.

## Recommended first analyses

1. Build an `any recorded injury` reference cohort with a pre-specified horizon and non-overlapping windows.
2. Report team imbalance, event prevalence, missingness, nested performance, calibration, and uncertainty.
3. Repeat only pre-specified outcome-specific analyses that the injury-type field can support with adequate event counts.
4. Use chronological temporal stress testing where the calendar split leaves adequate events in both periods.
5. Never use the resulting model for patient-facing injury probability.
