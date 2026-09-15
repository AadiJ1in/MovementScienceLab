# Stage 2 — Movement measurement and repetition analysis

Stage 2 consumes the browser-local Stage 1 `PoseStreamFrame` and produces real-time movement measurements. It remains a measurement/research layer: it does **not** contain injury-risk thresholds, diagnoses, treatment recommendations, or automatic program changes.

## Current supported profiles

- **Squat — side view:** 2D knee-flexion projection, trunk lean, excursion, rep segmentation, phase timing, cadence, and rep-to-rep consistency.
- **Squat — front view:** 2D frontal knee-line deviation proxy, pelvic-line tilt, trunk lean, and shoulder-elevation projections. Rep segmentation is intentionally disabled in this view rather than inferring sagittal squat depth from an unsuitable camera plane.
- **Push-up — side view:** 2D elbow-flexion projection, trunk lean, shoulder elevation, rep segmentation, excursion, phase timing, cadence, and consistency.
- **Shoulder flexion — side view:** 2D shoulder-elevation projection relative to the ipsilateral trunk, trunk lean, excursion, rep segmentation, phase timing, cadence, and consistency.
- **General front/side modes:** descriptive supported measurements only, with no exercise-specific rep claims.

## Angle computation

Angles are calculated from trusted MediaPipe image landmarks using 2D vector geometry. Examples include hip-knee-ankle knee flexion, shoulder-elbow-wrist elbow flexion, shoulder-elbow-hip shoulder elevation, trunk angle from vertical, and pelvic-line angle from horizontal.

These are **monocular 2D projection estimates**. They are not equivalent to calibrated laboratory motion capture or validated clinical goniometry. Stage 2 deliberately does not convert MediaPipe world landmarks into centimeters or millimeters.

## Filtering

Each available angle signal is filtered independently with a time-aware **One Euro filter**.

Default engineering parameters:

- minimum cutoff: `1.2 Hz`
- speed coefficient β: `0.035`
- derivative cutoff: `1.0 Hz`
- reset after tracking gap: `750 ms`

Why this filter: a fixed moving average suppresses jitter but adds similar lag regardless of motion speed. The One Euro filter smooths more strongly when the signal is slow/stationary and raises its cutoff when movement speed increases, reducing lag during meaningful movement.

These values are signal-processing parameters, not normal ranges or clinical thresholds.

## Side selection

For side-view exercises with bilateral candidate signals, Stage 2 observes the first 12 usable measurement frames and locks the rep signal to the side with the higher average landmark confidence. This prevents frame-to-frame switching between limbs from creating discontinuities in the rep signal.

The selected side remains fixed for the capture session. Changing analysis profile starts a new Stage 2 analyzer session.

## Rep segmentation

Supported exercise profiles use the existing hysteresis-based `RepSegmenter`. Stage 2 feeds it the already-filtered signal, so its internal fixed EMA is disabled (`signalSmoothing: 1`) to avoid double smoothing.

The cycle detector uses engineering controls for:

- movement departure from a rolling resting baseline;
- reversal detection;
- return-to-baseline tolerance;
- minimum excursion;
- minimum and maximum cycle duration;
- landmark-confidence gating; and
- tracking-gap reset.

These settings exist to reject obvious jitter and incomplete cycles. They are **not** clinical movement-quality thresholds.

## Per-rep outputs

A completed rep includes:

- rep index;
- start/end timestamps;
- peak signal and excursion;
- peak timestamp;
- outbound duration;
- return duration;
- total duration;
- cadence in cycles/minute;
- mean tracking confidence; and
- min/max/mean aggregates for all available angle measurements within that rep.

The terms `outbound` and `return` are intentionally generic. They correspond to the signal moving away from and back toward its baseline, rather than asserting a clinically specific eccentric/concentric phase for every exercise.

## Consistency

Stage 2 reports transparent statistics instead of a proprietary movement score:

- mean rep duration;
- mean cadence;
- coefficient of variation (CV) of rep duration; and
- coefficient of variation of signal excursion.

CV is only reported after at least two completed reps. Lower CV means the captured repetitions were more similar in that measured dimension; it does not imply lower injury risk or better clinical quality.

## Product boundary before Stage 3

Stage 2 must not display or persist any of the following as a conclusion:

- “safe” / “unsafe” movement;
- injury probability;
- diagnostic labels;
- normal/abnormal clinical ROM;
- treatment changes; or
- exercise progression/regression recommendations.

Those behaviors require separate threshold governance, validation, access control, and clinical review. Stage 3 should consume the same Stage 2 measurements rather than recomputing them.
