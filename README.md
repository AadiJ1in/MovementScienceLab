# Movement Science Lab

Webcam-based movement-quality analysis research platform built with Next.js, React, TypeScript, MediaPipe Pose, Supabase, and Recharts.

## Clinical framing

This project does **not** predict injuries and is not a diagnostic system. It reports movement-quality measurements, form-deviation comparisons, and explainable biomechanical flags. Single-camera outputs must not be marketed as true 3D joint loading or clinical diagnosis.

## Stage 1 — Pose capture

- MediaPipe Pose Landmarker runs client-side through WASM/JS.
- Webcam capture produces 33 landmarks per valid pose frame.
- Every landmark preserves `x`, `y`, `z`, `visibility`, and a `trusted` flag.
- `KEYPOINT_VISIBILITY_THRESHOLD` is currently `0.7` as an engineering quality gate, not a clinical threshold.
- Front/side camera-guidance modes reject obviously poor framing and low landmark visibility.
- Camera guidance cannot prove exact body-to-camera alignment.

## Stage 2 — Joint-angle utilities

`lib/biomechanics/angles.ts` contains pure TypeScript calculations and unit tests for:

- left/right knee flexion
- left/right frontal knee deviation proxy
- trunk lean relative to image vertical
- pelvic-line obliquity proxy
- left/right shoulder elevation

Each output has `{ frameTimestamp, angleName, value, confidence }`. Confidence is the minimum visibility among landmarks used in the measurement. If a required landmark is untrusted, that angle is not emitted.

Important: BlazePose does not expose ASIS/PSIS landmarks, so true anterior/posterior pelvic tilt is not claimed. The current pelvic metric is explicitly a 2D pelvic-line/obliquity proxy. Likewise frontal knee deviation is a 2D projection proxy, not a diagnosis of valgus/varus pathology.

## Stage 3 — Explainable rule engine

`lib/biomechanics/risk-rules.ts` implements sourced threshold rules and produces explainable flags containing measured value, threshold exceedance, severity, timestamp/rep, and source metadata.

`DEFAULT_MOVEMENT_RULES` is intentionally empty. No biomechanical safe-range values are invented in the repository. Add only thresholds supported by literature or a clinician-approved protocol.

## Stage 4 — Supabase data model

Migrations in `supabase/migrations` create:

- `profiles`
- `clinician_patient_access`
- `exercises`
- `movement_sessions`
- `rep_summaries`
- `angle_samples`
- `movement_flags`

RLS is enabled on every user-data table. Patients own writes to their movement data; clinicians receive read access only through an explicit patient grant.

### Storage recommendation

Use **rep/session aggregates as the durable default** for production analytics, and persist per-frame angle samples only when they are needed for chart replay, debugging, or research. Raw webcam frames are not part of the schema.

For longer sessions, downsample or batch angle samples before persistence rather than storing every render-loop frame indefinitely. `lib/supabase/movement-data.ts` provides persistence helpers.

## Stage 5 — Reference-form comparison

`lib/biomechanics/dtw.ts` provides Dynamic Time Warping (DTW) against labeled reference angle trajectories.

DTW was chosen as the initial explainable baseline because it:

- handles reps performed at different speeds
- produces a transparent distance from a reference trajectory
- does not require a trained black-box model

A lightweight classifier can later be compared against DTW when a sufficiently representative labeled dataset exists. Any classifier would still be a **form-deviation classifier**, not injury prediction.

The DTW deviation boundary is caller-supplied and must be validated against labeled data; no default boundary is invented.

## Stage 6 — Visualization

`components/analysis/MovementAnalysisWorkspace.tsx` and `AngleCharts.tsx` provide:

- live angle readout during webcam capture
- start/stop in-browser session recording
- angle-over-time chart
- highlighted rule-flag timestamps when sourced rules are configured
- current-session aggregate trend component designed to accept prior Supabase session aggregates

## Run locally

```bash
npm install
npm run test
npm run dev
```

Then open `http://localhost:3000` and allow camera access. Browser camera APIs require localhost or HTTPS in production.

## Supabase environment

Set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Then apply the SQL migrations in `supabase/migrations` to your Supabase project.

## Verification

CI runs unit tests, ESLint, and the Next.js production build on pushes and pull requests.

## Single-camera limitations

Results remain sensitive to camera alignment, occlusion, lens distortion, body rotation, clothing, and motion outside the image plane. 2D webcam measurements can support movement-quality feedback and research prototypes but must not be presented as diagnostic measurements or validated injury-risk probabilities without appropriate validation and outcome data.
