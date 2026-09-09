# Movement Science Lab

Webcam-based movement-quality analysis research platform.

## Clinical framing

This project does **not** predict injuries and is not a diagnostic system. It captures movement data and may later produce explainable movement-risk indicators, form-deviation scores, and biomechanical flags. Any future thresholds must be sourced from supplied literature rather than invented in code.

## Current scope: Stage 1 only

- Next.js App Router + React + TypeScript + Tailwind
- MediaPipe Pose Landmarker runs client-side through WASM/JS
- Webcam capture with one detected pose and 33 landmarks per valid frame
- Each landmark preserves MediaPipe visibility and a `trusted` boolean
- Camera-guidance modes for front and side capture
- Low-visibility landmarks are explicitly rejected for downstream calculations

No joint-angle calculations, risk thresholds, Supabase schema, ML classification, or analytics have been implemented yet.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` and allow camera access. Browser camera APIs require localhost or HTTPS in production.

## Stage 1 confidence policy

`KEYPOINT_VISIBILITY_THRESHOLD` is currently `0.7` in `lib/pose/camera-guidance.ts`.

This is an engineering starting point for whether an individual landmark should be trusted downstream; it is **not** a clinical or biomechanical threshold. It should be validated against representative capture conditions before production use. MediaPipe detection/presence/tracking confidence settings remain at `0.5` so the system can continue tracking while the stricter downstream visibility gate rejects weak landmarks.

## Important single-camera limitation

The positioning overlay can check landmark visibility and framing, but it cannot guarantee perfect camera alignment or recover true 3D biomechanics from one 2D webcam. Front/side capture instructions reduce projection error; they do not eliminate it.
