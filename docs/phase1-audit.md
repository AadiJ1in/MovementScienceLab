# Phase 1 repository audit

Reviewed before the patient-facing redesign.

## Existing capabilities preserved

- MediaPipe Pose browser capture with 33 landmarks, visibility confidence, GPU-to-CPU fallback, saved camera preference, front/side guidance, and local video processing.
- Projection-aware angle measurement profiles and conservative naming for 2D proxies.
- Sourced movement-rule infrastructure with provenance requirements; no default unsourced clinical thresholds.
- Side-view squat knee-cycle repetition segmentation with engineering hysteresis parameters.
- Reference trajectory / DTW research comparison.
- Supabase authentication and movement-session persistence, save retry behavior, session protocol snapshots, provenance, idempotency, and RLS hardening migrations.
- Historical trend loading in the advanced workspace.
- Camera diagnostics, camera profile testing, and experimental dual-camera capture.
- Research model inference contract that explicitly blocks injury-probability display and deployment before external/webcam validation gates are cleared.
- Validation, methodology, evidence registry, dataset registry, and hospital-readiness documentation.

## Phase 1 product gaps identified

1. The default homepage exposed the full research workspace and advanced controls immediately.
2. Movement selection used a technical capture-mode selector instead of a guided exercise/view choice.
3. Camera readiness existed, but there was no explicit patient calibration step or countdown.
4. Camera device/resolution telemetry was available in labs but not directly in the patient assessment flow.
5. Results, raw traces, rules, persistence, trends, and reference comparison competed on one screen instead of producing a focused post-exercise summary.
6. Advanced research features had no dedicated product-level navigation boundary.

## Phase 1 implementation decision

The existing advanced workspace remains intact under Research & Validation. A separate patient assessment path is built on the same measurement and pose utilities, with a movement-definition registry, camera setup, pose-derived calibration, recording gate, simple exercise mode, and transparent results. No new clinical claims are introduced.

## Scientific boundary

The product must continue to distinguish direct camera-derived measurements, 2D projection-based proxies, engineering confidence/data-quality signals, research classifiers, and clinically validated outputs. Camera-derived movement quality is not diagnosis, future-injury prediction, laboratory-grade 3D kinetics, or joint loading.
