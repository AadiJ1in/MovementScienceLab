# Stage 3 — Clinician-reviewed movement flags

Stage 3 consumes the filtered, timestamped measurements produced by Stage 2 and compares them with explicit protocol rules supplied by a clinician or study team.

## What Stage 3 does

- accepts exercise-specific rules for supported Stage 2 measurements;
- supports frame-level angle/projection rules;
- supports rep-level excursion, duration, and cadence rules for exercises with registered rep segmentation;
- records the configured severity tier, timestamp, measured value, amount beyond the configured threshold, exercise, metric, protocol ID, source, source measurement method, reviewer, and review date;
- reduces nearby repeated frame crossings so video-rate inference does not create an unbounded review queue;
- keeps rep flags to one event per rule and completed rep;
- leaves all treatment and exercise-program decisions to the clinician.

## What Stage 3 deliberately does not do

Stage 3 does not ship with default clinical thresholds. It does not label a movement as safe or unsafe, diagnose an injury, estimate future injury probability, or automatically change the patient's exercise prescription.

A threshold crossing means only that a measurement exceeded a value in the loaded protocol. Transferability from a paper, laboratory method, or other measurement system to monocular webcam pose must be reviewed explicitly.

## Required rule provenance

Each JSON rule must provide:

- `id`
- `protocolId`
- `movement`
- `scope` (`frame` or `rep`)
- `metric`
- `label`
- `comparator`
- a numeric `threshold`, or `min` + `max` for `outsideRange`
- `severity` (`info`, `caution`, or `high`)
- `sourceLabel`
- `sourceUrl`
- `sourceMeasurementMethod`
- `reviewedBy`
- `reviewedAt`

No reviewed rules are loaded by default.

## Supported frame metrics

A frame rule may use only angle/projection metrics available in the selected exercise registry entry, including knee flexion, frontal knee-line deviation, trunk lean, pelvic-line tilt, shoulder elevation, and elbow flexion where the selected capture profile supports them.

Stage 3 evaluates the **filtered Stage 2 value**, not the raw landmark-derived value, so the review stream is aligned with the values displayed and used for rep segmentation.

## Supported rep metrics

For profiles with registered angle-cycle segmentation:

- `repExcursionDeg`
- `repDurationSec`
- `repCadenceRpm`

Rep rules are rejected for profiles without rep segmentation rather than fabricating a repetition boundary.

## Event reduction

Continuous threshold crossings can occur for many adjacent video frames. Stage 3 merges same-rule frame events inside a short engineering window and keeps the larger exceedance. This is an event-volume safeguard, not a clinical persistence criterion.

The default in-memory cap is 250 review flags per session. Stage 4 should define the persistent database representation and retention policy before review flags are stored remotely.

## Interpretation boundary

Every emitted flag carries:

`interpretationBoundary = "review-indicator-not-injury-risk"`

That boundary must be preserved through Stage 4 persistence and Stage 5 reports unless a separate clinical validation and governance process establishes a different intended use.
