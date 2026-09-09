# Movement Science Lab

Webcam-based movement-quality analysis research platform built with Next.js, React, TypeScript, MediaPipe Pose, Supabase, and Recharts.

## Clinical framing

This project does **not** predict injuries and is not a diagnostic system. It reports movement-quality measurements, form-deviation comparisons, and explainable biomechanical flags. Single-camera outputs must not be marketed as true 3D joint loading, diagnosis, or validated injury probability.

## Stage 1 — Pose capture

- MediaPipe Pose Landmarker runs client-side through WASM/JS.
- Webcam capture produces 33 landmarks per valid pose frame.
- Every landmark preserves `x`, `y`, `z`, `visibility`, and a `trusted` flag.
- `KEYPOINT_VISIBILITY_THRESHOLD` is `0.7` as an engineering quality gate, not a clinical threshold.
- Front/side camera-guidance modes reject obviously poor framing and low landmark visibility.
- Camera guidance cannot prove exact body-to-camera alignment or recover true 3D biomechanics.

## Stage 2 — Joint-angle utilities

`lib/biomechanics/angles.ts` contains pure TypeScript calculations and unit tests for:

- left/right knee flexion
- left/right frontal knee deviation proxy
- trunk lean relative to image vertical
- pelvic-line obliquity proxy
- left/right shoulder elevation

Each output has `{ frameTimestamp, angleName, value, confidence }`. Confidence is the minimum visibility among landmarks used in the measurement. If a required landmark is untrusted, that angle is not emitted.

BlazePose does not expose ASIS/PSIS landmarks, so true anterior/posterior pelvic tilt is not claimed. The pelvic metric is explicitly a 2D pelvic-line/obliquity proxy. Frontal knee deviation is also a 2D projection proxy, not a diagnosis of valgus/varus pathology.

## Rep segmentation

`lib/biomechanics/rep-segmentation.ts` detects a flexion/return cycle with hysteresis and minimum excursion. Its degree deltas are **signal-processing parameters**, not safe ROM thresholds. The detector locks onto one knee signal for the session rather than switching sides as pose confidence fluctuates.

Completed rep windows are used to:

- attach rule flags to rep numbers
- build per-rep angle aggregates
- select a completed rep for reference-form comparison

## Stage 3 — Explainable movement-quality rules

`lib/biomechanics/risk-rules.ts` supports:

- `greaterThan`
- `absoluteGreaterThan`
- `lessThan`
- `outsideRange`

The app reports measured value, threshold exceedance, severity, timestamp, rep number when available, and source metadata. For storage, repeated crossings are collapsed to the worst exceedance for each rule/rep pair.

`DEFAULT_MOVEMENT_RULES` is intentionally empty. **No biomechanical safe-range values are invented in this repository.**

### Importing sourced rules

The UI accepts a JSON array. Every rule must include `sourceLabel` and `sourceUrl`; otherwise it is rejected.

Structure:

```json
[
  {
    "id": "your-rule-id",
    "angleName": "trunkLean",
    "label": "Your literature-defined movement indicator",
    "comparator": "absoluteGreaterThan",
    "threshold": 0,
    "severity": "caution",
    "sourceLabel": "Replace with the actual paper/protocol citation",
    "sourceUrl": "https://replace-with-real-source.example"
  }
]
```

The `0` above is only a schema placeholder and is **not** a recommended biomechanical threshold. Replace the entire example with values from reviewed literature or a clinician-approved protocol before activating it.

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

Authorization-sensitive `profiles.role` cannot be changed by the browser client. Client profile updates are limited to `display_name`; clinician promotion must use a trusted administrative/server path.

### Storage strategy

The application keeps two representations:

1. **Rep summaries** as the durable compact unit for analytics.
2. **Angle traces downsampled to 10 Hz** for chart replay and research/debugging.

The app does not persist raw webcam images or raw video. The live chart has a bounded display buffer, while the 10 Hz persistence buffer continues for the full recording so longer sessions are not truncated.

## Stage 5 — Reference-form comparison

`lib/biomechanics/dtw.ts` provides Dynamic Time Warping against a labeled reference angle trajectory.

DTW is the explainable baseline because it:

- tolerates different movement speeds
- produces a transparent distance from a reference trajectory
- requires no black-box model
- can be inspected angle-by-angle

The UI can import a reference JSON object:

```json
{
  "angleName": "leftKneeFlexion",
  "values": [0, 10, 20, 30, 20, 10, 0],
  "sourceLabel": "Replace with the actual validated reference source"
}
```

These numbers are only a file-format illustration, **not a good-form template**.

Without a validated boundary, the app displays only the normalized DTW deviation score. If a `deviationBoundary` is supplied, the UI can classify the trajectory as closer-to-reference or more-deviant-from-reference, but that boundary must be validated on labeled movement data.

A future lightweight classifier can be compared with DTW once a representative labeled dataset exists. It would still be a **form-deviation classifier**, not injury prediction.

## Stage 6 — Visualization and history

The analysis workspace provides:

- live webcam pose/skeleton display
- live selected-angle readout over the capture area
- recording controls
- rep count
- angle-over-time chart
- highlighted rule-flag timestamps
- sourced flag explanations
- DTW reference-form comparison
- authenticated session persistence
- historical angle trend across recent completed sessions

Trend values are descriptive movement measurements. A longitudinal drift must not be presented as evidence that an injury will occur.

## Supabase setup

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

A legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback, but new deployments should prefer a publishable key. Never expose a Supabase secret/service-role key to the browser.

Apply the SQL migrations in order to the Supabase project used by this application. This repository does **not** automatically modify the existing Axion production database.

For passwordless email sign-in, add the local and deployed application URLs to the allowed Supabase Auth redirect URLs.

## Run locally

```bash
npm install
npm run test
npm run dev
```

Then open `http://localhost:3000` and allow camera access. Browser camera APIs require localhost or HTTPS.

## Vercel deployment

1. Import `AadiJ1in/MovementScienceLab` into Vercel.
2. Add the two public Supabase environment variables above.
3. Deploy with the standard Next.js preset.
4. Add the deployed Vercel URL to Supabase Auth redirect URLs if persistence/auth is enabled.
5. Test webcam permission, landmark confidence gating, recording, persistence, and RLS with separate patient/clinician accounts before any pilot use.

## Verification

CI runs:

```bash
npm install
npm run test
npm run lint
npm run build
```

The test suite covers angle math, confidence rejection, DTW, rep segmentation, session aggregation, rule evaluation, external rule validation, absolute signed metrics, and per-rep flag collapsing.

## Single-camera limitations

Results remain sensitive to camera alignment, occlusion, lens distortion, body rotation, clothing, and motion outside the image plane. 2D webcam measurements can support movement-quality feedback and research prototypes but must not be represented as diagnostic measurements, true 3D kinetics/kinematics, or validated injury-risk probabilities without appropriate validation and longitudinal outcome data.
