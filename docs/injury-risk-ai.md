# MediaPipe multimodal injury-risk AI

The Movement Science Lab injury-risk architecture deliberately separates three things:

1. **MediaPipe measurement** — browser-local pose estimation and camera-derived movement measurements.
2. **Research prediction** — a prospectively trained model that combines camera features with history, symptoms/readiness, training exposure, strength/balance, and longitudinal change.
3. **Clinical validation** — independent evidence required before a patient-facing injury probability, diagnosis, or treatment action is allowed.

## Live camera feature bundle

The research workbench derives these model-ready camera variables from Stage 2 analysis:

- `camera_knee_flexion_asymmetry_deg`
- `camera_peak_knee_frontal_deviation_deg`
- `camera_peak_trunk_lean_deg`
- `camera_peak_pelvic_obliquity_deg`
- `camera_rep_excursion_variability_deg`
- `camera_rep_duration_cv_pct`

`mean_pose_confidence` and `camera_measurement_frame_fraction` are retained as measurement-quality metadata. The strict prospective training entry point excludes pose confidence from biological injury prediction.

## Current demonstration mode

`data/injury-risk-demo-model.json` is a deterministic **synthetic development fixture**. It exists so the full capture → feature → model → explanation path can be exercised before a real prospective model is available.

The UI must call its result a synthetic demo/model score, not injury probability. The artifact validator rejects any synthetic artifact that claims eligibility for research risk estimation.

## Prospective-human model mode

A portable human model artifact may be presented as a **research risk estimate** only when:

- the training data are prospectively labeled;
- participants, not rows, define validation splits;
- model selection/calibration/threshold tuning are nested inside training folds;
- predictor timing is audited;
- the internal research engineering gate passes;
- the artifact remains explicitly ineligible for clinical injury-probability display.

Independent external validation and same-camera measurement-domain validation remain required before any clinical claim.

## Presentation framing

For demonstrations, describe the system as:

> A multimodal research injury-risk platform that combines browser-based MediaPipe biomechanics with longitudinal workload, symptoms/readiness, injury history, and other candidate predictors. The full inference pipeline is operational; clinical validation is the next evidence milestone.

Do not describe the synthetic development score as a validated injury probability.
