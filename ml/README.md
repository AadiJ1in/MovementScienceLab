# Movement-quality AI training pipeline

This directory is for offline model training. The browser application should consume exported model artifacts, not train on end-user sessions in production.

## Intended model outputs

1. `movement_quality_probability`: probability that a rep resembles the training set's non-optimal/deviation class.
2. `deviation_components`: interpretable feature contributions such as trunk lean, knee flexion excursion, frontal knee deviation, asymmetry, tempo, and range of motion.
3. `model_confidence`: calibration-aware confidence plus out-of-distribution checks.

The model must **not** output a diagnosis or a guaranteed injury probability unless a separate prospective outcome-labeled model has been externally validated for the exact movement, population, camera protocol, and measurement implementation.

## Dataset tiers

- **UI-PRMD**: correct/non-optimal rehabilitation motions; useful for form-quality classification.
- **KIMORE**: clinician-scored rehabilitation quality including patients; useful for quality regression and domain validation.
- **ExeCheck**: paired correct/incorrect rehabilitation repetitions; useful for deviation classification.
- Prospective injury cohorts from the literature belong in a separate evidence/validation layer unless raw participant-level outcome-labeled data are legally available.
- YouTube/public instructional videos may be used only after licensing/consent review and expert annotation. Video titles/descriptions are not acceptable clinical labels.

## Required validation rules

- Split by **subject**, never by frame, to avoid leakage.
- Preserve an untouched external test set when possible.
- Report sensitivity, specificity, AUROC, AUPRC, Brier score/calibration, confusion matrix, and confidence intervals.
- Evaluate by sex, age group, body-size range, camera view, lighting, clothing/occlusion conditions, and source dataset when metadata permit.
- Reject low pose-confidence or out-of-distribution input instead of forcing a prediction.
- Maintain dataset licenses and source provenance in `docs/evidence-registry.json` and a dataset manifest.

## Browser feature contract

The first production model should operate on rep-level features that can be measured consistently by the current MediaPipe pipeline:

- left/right knee flexion min, max, range
- peak absolute frontal knee deviation (front-view only)
- peak trunk lean
- peak pelvic-line obliquity (front-view only; not true pelvic tilt)
- left/right shoulder elevation summaries
- left-right asymmetry features
- rep duration and normalized phase timing
- pose-confidence summaries

Do not train a model using a Vicon/Kinect-only feature that the browser cannot reproduce. Sensor-specific training features create silent domain mismatch.

## Training sequence

1. Acquire datasets from their official sources and record license/version/hash.
2. Convert each dataset to a common rep-level schema.
3. Map source joints to only measurements reproducible with MediaPipe.
4. Train an interpretable baseline first (regularized logistic regression for classification; regularized regression for quality scores).
5. Compare against a temporal model only if subject-grouped validation shows a real gain.
6. Calibrate probabilities on held-out subjects.
7. Export coefficients/scaler/calibration metadata to JSON for browser inference.
8. Run external validation on a second dataset before enabling the AI result in the user-facing UI.

The evidence registry intentionally prevents protocol thresholds from silently becoming "injury-prone" labels.
