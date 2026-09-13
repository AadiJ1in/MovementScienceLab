# Webcam measurement validation protocol

## Why this is separate from injury prediction

A prediction model cannot be more trustworthy than the measurements that feed it. The single-leg knee-control workflow therefore needs a dedicated measurement study before camera-derived features can be treated as stable research predictors.

The current webcam metric is a **2D projection measurement**. It must not be described as equivalent to 3D knee kinematics, joint moments, tissue load, or force-plate measurements.

## Evidence context

Published 2D single-leg-squat literature supports measuring repeatability and agreement directly rather than assuming interchangeability with 3D motion capture:

- A systematic review of clinically accessible single-leg squat/step-down tools found knee frontal-plane projection angle reliability acceptable, but criterion validity unacceptable as a substitute for 3D analysis. PMID 34996031. https://pubmed.ncbi.nlm.nih.gov/34996031/
- A systematic review/meta-analysis of 2D frontal-plane kinematics found reliability ranging from moderate to excellent but poor agreement with 3D methods for several tasks; single-leg-squat 2D knee FPPA did not correlate with the corresponding 3D frontal-plane angle in the pooled evidence reviewed. PMID 29895235. https://pubmed.ncbi.nlm.nih.gov/29895235/
- Individual single-leg-squat studies have reported useful 2D repeatability and associations with 3D measures, illustrating that validity is task/protocol/population dependent rather than universal. PMID 25540705 and PMID 28437781. https://pubmed.ncbi.nlm.nih.gov/25540705/ ; https://pubmed.ncbi.nlm.nih.gov/28437781/
- In elite footballers, between-session 2D FPPA reliability was variable and measurement error could be several degrees; agreement between alternative measurement systems was poor. PMID 30469107. https://pubmed.ncbi.nlm.nih.gov/30469107/

These papers do not validate Movement Science Lab's MediaPipe implementation. They justify the need to measure its own repeatability and error.

## Validation table contract

Each row may represent a trial/frame-level summary, but repeated rows are aggregated before agreement statistics so participants with more samples do not dominate the analysis.

Required columns:

| Column | Meaning |
| --- | --- |
| `participant_id` | Stable participant identifier. |
| `session_id` | Planned repeat session identifier. |
| `metric_name` | Versioned measurement target, e.g. `single_leg_knee_projection`. |
| `side` | `left`, `right`, or another pre-specified side label. |
| `webcam_deg` | Movement Science Lab camera-derived angle in degrees. |
| `camera_measurement_version` | Exact algorithm/protocol version. One report may not pool versions. |

Optional but strongly recommended:

| Column | Meaning |
| --- | --- |
| `reference_deg` | Concurrent criterion/reference measurement in degrees. |
| `device_model` | Camera/device stratum. |
| `capture_condition` | Pre-specified lighting/clothing/setup condition. |
| `resolution` | Capture resolution stratum. |
| `distance_bin` | Pre-specified camera-distance stratum. |

## Repeatability analysis

`ml/camera_measurement_validation.py` aggregates `webcam_deg` to the median per participant/session, then reports for the specified test-retest session pair:

- mean test-retest bias,
- standard deviation of paired differences,
- 95% Bland-Altman limits of agreement,
- mean absolute test-retest difference,
- RMSE,
- Pearson correlation as a descriptive association only,
- two-way random-effects absolute-agreement ICC(A,1),
- agreement SEM from the two-way ANOVA residual mean square,
- MDC95 = `1.96 * sqrt(2) * SEM`.

Correlation is never treated as a substitute for agreement.

If more than two sessions are present, the tool requires the intended test-retest pair to be specified rather than choosing one after seeing results.

## Reference/criterion agreement

When `reference_deg` is available, concurrent paired webcam/reference measurements are aggregated to the median per participant/session before analysis. The report includes:

- bias,
- 95% limits of agreement,
- MAE,
- RMSE,
- descriptive Pearson correlation,
- participant-cluster bootstrap 95% intervals for bias, MAE, and RMSE.

The report also stratifies reference agreement by available device/capture-condition fields when at least ten participants are available in a stratum. Small strata remain visible as `insufficient-participants`.

## Versioning rule

A validation report cannot combine multiple `camera_measurement_version` values. Any change to landmark selection, angle definition, smoothing, calibration, camera guidance, rep/phase selection, or robust-summary rule that could change the measurement should create a new version and require renewed agreement/repeatability assessment.

## No post-hoc clinical threshold

The tool intentionally does not decide that a particular ICC, MAE, or limits-of-agreement value is clinically acceptable. Acceptability limits must be pre-specified for the exact intended measurement and decision before the validation results are inspected.

A statistically reliable 2D measure can still be unsuitable for an individual clinical decision if its measurement error is large relative to the change being interpreted.

## Product gate

Completing this analysis does not enable injury diagnosis or future-injury probability. Its purpose is narrower: determine whether the camera feature itself is repeatable and how far it differs from a pre-specified reference under supported conditions.
