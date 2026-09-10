# Movement Science Lab

Webcam-based movement-quality analysis research platform built with Next.js, React, TypeScript, MediaPipe Pose, Supabase, and Recharts.

## Clinical framing

This project does **not** predict injuries and is not a diagnostic system. It reports movement-quality measurements, form-deviation comparisons, and explainable biomechanical flags. Single-camera outputs must not be marketed as true 3D joint loading, diagnosis, or validated injury probability.

## Stage 1 — Pose capture

- MediaPipe Pose Landmarker runs client-side through WASM/JS.
- Camera/model initialization is **explicitly user-triggered**, not automatic on page load.
- The UI discloses MediaPipe Tasks telemetry before camera enablement and requires acknowledgement first.
- Webcam capture produces 33 landmarks per valid pose frame.
- Every landmark preserves `x`, `y`, `z`, `visibility`, and a `trusted` flag.
- `KEYPOINT_VISIBILITY_THRESHOLD` is `0.7` as an engineering quality gate, not a clinical threshold.
- Camera readiness is movement-specific: only landmarks required for the selected capture mode gate recording.
- Front/side camera-guidance modes reject poor required-landmark visibility and edge-of-frame clipping.
- Recording cannot start until the camera-guidance gate is currently usable.
- MediaPipe initialization tries GPU acceleration first and falls back to CPU when GPU setup is unavailable.
- Camera guidance cannot prove exact body-to-camera alignment or recover true 3D biomechanics.

### MediaPipe privacy

MediaPipe Tasks states that image/video input is processed on-device rather than sent to Google servers, while API performance/utilization metrics are sent to Google. The app surfaces that distinction before it initializes MediaPipe or requests webcam access. Deployers remain responsible for their own privacy notice/consent obligations.

The default WASM/model assets are pinned to the repository's MediaPipe version, but production deployments can self-host them with:

```bash
NEXT_PUBLIC_MEDIAPIPE_WASM_URL=...
NEXT_PUBLIC_MEDIAPIPE_MODEL_URL=...
```

## Stage 2 — Joint-angle utilities

`lib/biomechanics/angles.ts` contains pure TypeScript calculations and unit tests for:

- left/right knee flexion
- left/right frontal knee deviation proxy
- trunk lean relative to image vertical
- pelvic-line obliquity proxy
- left/right shoulder elevation

Each output has `{ frameTimestamp, angleName, value, confidence }`. Confidence is the minimum visibility among landmarks used in the measurement. If a required landmark is untrusted, that angle is not emitted.

`lib/biomechanics/measurement-profile.ts` prevents measurements from being interpreted in an invalid camera projection:

- **Front view:** frontal knee-deviation proxy, trunk lean, pelvic-line obliquity, shoulder elevation.
- **Side view:** sagittal knee flexion, trunk lean, shoulder elevation.

For side-view trunk lean, the app uses the most visible shoulder–hip chain instead of requiring both sides of the body. This handles expected far-side occlusion in a correctly positioned side-on capture.

A front-view hip-knee-ankle projection is not presented as sagittal knee flexion, and a side-view projection is not presented as frontal knee deviation.

BlazePose does not expose ASIS/PSIS landmarks, so true anterior/posterior pelvic tilt is not claimed. The pelvic metric is explicitly a 2D pelvic-line/obliquity proxy. Frontal knee deviation is also a 2D projection proxy, not a diagnosis of valgus/varus pathology.

## Rep segmentation

`lib/biomechanics/rep-segmentation.ts` detects a sagittal knee flexion/return cycle with hysteresis and minimum excursion. Its degree deltas are **signal-processing parameters**, not safe ROM thresholds.

The current validated wiring uses this detector only for **side-view squats**. Front-view squats and general/push-up modes remain per-frame until a separately validated segmentation signal is implemented for those projections/movements.

Completed side-view squat rep windows are used to:

- attach applicable rule flags to rep numbers
- build per-rep angle aggregates
- select a completed rep for reference-form comparison

## Stage 3 — Explainable movement-quality rules

`lib/biomechanics/risk-rules.ts` supports:

- `greaterThan`
- `absoluteGreaterThan`
- `lessThan`
- `outsideRange`

The app reports measured value, threshold deviation, severity, timestamp, rep number when available, and source provenance. High-frequency crossings are reduced to the **worst/peak event per rule per rep**; unsegmented captures keep one peak event per rule for the session. This keeps long captures bounded while preserving the most severe explainable event and its original timestamp/value.

`DEFAULT_MOVEMENT_RULES` is intentionally empty. **No biomechanical safe-range values are invented in this repository.**

A sourced threshold is also **not automatically assumed transferable** to this webcam metric. New rule files must state how the source measured the quantity so a 3D motion-capture threshold, force-plate result, or differently defined angle is not silently treated as equivalent to a MediaPipe 2D proxy.

### Importing sourced rules

The UI accepts a JSON array. Each rule requires:

```ts
{
  id: string;
  angleName: AngleName;
  captureView: "front" | "side";
  label: string;
  comparator: "greaterThan" | "absoluteGreaterThan" | "lessThan" | "outsideRange";
  threshold?: number; // supplied from the actual source
  min?: number;       // supplied from the actual source
  max?: number;       // supplied from the actual source
  severity: "info" | "caution" | "high";
  sourceLabel: string;
  sourceUrl: string;
  sourceMeasurementMethod: string;
  notes?: string;
}
```

The parser rejects duplicate IDs, invalid URLs, unsupported metrics, projection-incompatible rules, and missing threshold/range values. `docs/movement-rule.schema.json` provides the machine-readable contract.

The repository deliberately contains no example biomechanical cutoff values. Supply only values from reviewed literature or a clinician-approved protocol whose measurement definition is appropriate for the metric being evaluated.

## Stage 4 — Supabase data model

Migrations in `supabase/migrations` create and harden:

- `profiles`
- `clinician_patient_access`
- `exercises`
- `movement_sessions`
- `rep_summaries`
- `angle_samples`
- `movement_flags`

RLS is enabled on every user-data table. Patients own writes to their movement data; clinicians receive read access only through an explicit patient grant.

Authorization-sensitive `profiles.role` cannot be changed by the browser client. Client profile updates are limited to `display_name`; clinician promotion must use a trusted administrative/server path.

Each saved session snapshots its capture mode, measurement version, confidence/storage settings, and active sourced rule configuration. Browser clients cannot rewrite that protocol after capture. Stored flags preserve source URL, source measurement method, capture view, and measurement version for later auditability.

Migration `202609090008_persistence_idempotency.sql` adds deterministic uniqueness keys for angle samples and flags. Client persistence uses chunked upserts, so retrying a partially failed save does not duplicate the same samples/reps/peak flags. The UI retains captured data in memory, exposes **Retry save**, blocks a new persisted session until recovery succeeds, and warns before navigation during active capture or unresolved persistence.

### Storage strategy

The application keeps two representations:

1. **Rep summaries** as the compact unit for rep-level analytics when a validated rep segmenter is available.
2. **Angle traces downsampled to 10 Hz** for chart replay, research, and debugging.

The app does not persist raw webcam images or raw video. The live chart has a bounded display buffer, while the 10 Hz persistence buffer continues for the full recording so longer sessions are not truncated.

## Stage 5 — Reference-form comparison

`lib/biomechanics/dtw.ts` provides Dynamic Time Warping against a labeled reference angle trajectory.

DTW is the explainable baseline because it:

- tolerates different movement speeds
- produces a transparent distance from a reference trajectory
- requires no black-box model
- can be inspected angle-by-angle

The reference file requires:

```ts
{
  angleName: AngleName;
  captureView: "front" | "side";
  values: number[];
  sourceLabel: string;
  sourceUrl: string;
  sourceMeasurementMethod: string;
  deviationBoundary?: number;
  deviationBoundarySourceLabel?: string;
  deviationBoundarySourceUrl?: string;
}
```

`lib/biomechanics/reference-trajectory.ts` validates the file, and `docs/reference-trajectory.schema.json` documents the machine-readable format.

The repository contains no fabricated good-form trajectory or default classification boundary. Without a boundary, the UI displays only normalized DTW distance. If a boundary is supplied, it must have its own explicit source label and URL before the UI will classify the rep as closer-to-reference or more-deviant-from-reference.

DTW scoring currently operates only on a **completed segmented rep window**, preventing an entire unsegmented session from being compared as though it were one rep. With the current segmentation implementation, that means side-view squats.

A future lightweight classifier can be evaluated once a representative labeled dataset exists. It would still be a **form-deviation classifier**, not injury prediction.

## Stage 6 — Visualization and history

The analysis workspace provides:

- live webcam pose/skeleton display
- live selected-angle readout over the capture area
- movement-aware metric selector
- recording controls gated by capture readiness
- side-view squat rep count
- angle-over-time chart
- highlighted sourced peak-flag timestamps
- flag provenance including source measurement method
- DTW reference-form comparison for completed rep windows
- authenticated session persistence with retry recovery
- historical angle trend across recent completed sessions

Historical trends are filtered to the **same capture mode and measurement implementation version**, so front- and side-view measurements are not mixed. Trend values remain descriptive movement measurements and must not be interpreted as injury probability.

## Supabase setup

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

A legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback, but new deployments should prefer a publishable key. Never expose a Supabase secret/service-role key to the browser.

Apply **all** SQL migrations in order to the Supabase project used by this application. This repository does **not** automatically modify any existing production database.

For passwordless email sign-in, add the local and deployed application URLs to the allowed Supabase Auth redirect URLs. In Vercel, set `NEXT_PUBLIC_SITE_URL` to the canonical production URL so emailed sign-in links return to the production app rather than an arbitrary preview origin.

## Production security defaults

`next.config.mjs` disables the framework-powered header and sets browser headers for:

- `X-Content-Type-Options: nosniff`
- frame embedding denial
- strict-origin referrer handling
- camera permission restricted to same-origin
- microphone and geolocation disabled
- same-origin opener isolation

A strict Content Security Policy is intentionally not included yet because MediaPipe WASM/model loading must first be smoke-tested against the exact self-hosted/CDN asset strategy. Do not add an untested CSP that silently breaks pose initialization.

## Run locally

```bash
npm install
npm run test
npm run dev
```

Then open `http://localhost:3000`, review the camera/MediaPipe notice, enable camera analysis, and grant webcam permission. Browser camera APIs require localhost or HTTPS.

## Vercel deployment

1. Import `AadiJ1in/MovementScienceLab` into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and canonical `NEXT_PUBLIC_SITE_URL`.
3. Optionally set `NEXT_PUBLIC_MEDIAPIPE_WASM_URL` and `NEXT_PUBLIC_MEDIAPIPE_MODEL_URL` to self-hosted pinned assets.
4. Apply every repository migration to the Supabase project chosen for this app.
5. Add the production URL to Supabase Auth redirect URLs.
6. Deploy with the standard Next.js preset over HTTPS.
7. Smoke-test explicit camera enablement, GPU/CPU fallback, landmark-confidence gating, projection-specific measurements, recording, save retry behavior, auth redirects, and RLS with separate patient/clinician accounts before any pilot use.

## Verification

CI is intended to run dependency installation followed by:

```bash
npm run test
npm run lint
npm run build
```

The test suite covers angle math, low-confidence rejection, movement-specific camera guidance, camera-projection metric applicability, side-view far-side occlusion, DTW, sourced reference validation, rep segmentation, session aggregation, sourced rule evaluation/validation, signed metrics, and peak flag collapsing.

A committed `package-lock.json` plus `npm ci` is the target deterministic production workflow. Until the lockfile is committed and the exact final commit passes tests/lint/build, treat deployment verification as incomplete rather than assuming success from earlier CI runs.

## Single-camera limitations

Results remain sensitive to camera alignment, occlusion, lens distortion, body rotation, clothing, and motion outside the image plane. 2D webcam measurements can support movement-quality feedback and research prototypes but must not be represented as diagnostic measurements, true 3D kinetics/kinematics, or validated injury-risk probabilities without appropriate validation and longitudinal outcome data.
