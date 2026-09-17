"use client";

import { useMemo, useRef, useState } from "react";
import { StageOneCapture } from "@/components/pose/StageOneCapture";
import {
  StageTwoMovementAnalyzer,
  type StageTwoAnalysisSnapshot,
} from "@/lib/biomechanics/stage-two-analysis";
import {
  EMPTY_MEDIAPIPE_RISK_FEATURES,
  extractMediaPipeRiskFeatures,
  mergeMediaPipeRiskFeatures,
  type MediaPipeRiskFeatures,
} from "@/lib/ai/mediapipe-risk-features";
import {
  inferPortableInjuryRisk,
  type InjuryRiskFeatureValue,
  type PortableInjuryRiskModelArtifact,
} from "@/lib/ai/injury-risk-engine";
import type { PoseStreamFrame } from "@/lib/pose/stream";
import type { MovementType } from "@/lib/pose/types";
import demoModelJson from "@/data/injury-risk-demo-model.json";

const demoModel = demoModelJson as unknown as PortableInjuryRiskModelArtifact;

type InputKey =
  | "previous_injury_count"
  | "days_since_last_injury"
  | "pain_score"
  | "soreness_score"
  | "sleep_quality_score"
  | "readiness_score"
  | "training_minutes_7d"
  | "training_minutes_28d"
  | "session_rpe_load_7d"
  | "session_rpe_load_28d"
  | "y_balance_asymmetry_cm";

const INITIAL_INPUTS: Record<InputKey, number> = {
  previous_injury_count: 1,
  days_since_last_injury: 180,
  pain_score: 2,
  soreness_score: 3,
  sleep_quality_score: 7,
  readiness_score: 7,
  training_minutes_7d: 240,
  training_minutes_28d: 1000,
  session_rpe_load_7d: 1200,
  session_rpe_load_28d: 5000,
  y_balance_asymmetry_cm: 3,
};

const INPUTS: Array<{
  key: InputKey;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  description: string;
}> = [
  { key: "previous_injury_count", label: "Previous injuries", min: 0, max: 10, description: "Count before the current prediction index." },
  { key: "days_since_last_injury", label: "Days since last injury", unit: "days", min: 0, max: 1500, description: "History feature; larger values mean more time since the last recorded injury." },
  { key: "pain_score", label: "Pain", unit: "/10", min: 0, max: 10, description: "Current self-reported pain." },
  { key: "soreness_score", label: "Soreness", unit: "/10", min: 0, max: 10, description: "Current self-reported soreness." },
  { key: "sleep_quality_score", label: "Sleep quality", unit: "/10", min: 0, max: 10, description: "Higher means better sleep in this prototype schema." },
  { key: "readiness_score", label: "Readiness", unit: "/10", min: 0, max: 10, description: "Higher means better perceived readiness." },
  { key: "training_minutes_7d", label: "Training volume · 7d", unit: "min", min: 0, max: 1500, description: "Exposure during the previous seven days." },
  { key: "training_minutes_28d", label: "Training volume · 28d", unit: "min", min: 0, max: 5000, description: "Exposure during the previous 28 days." },
  { key: "session_rpe_load_7d", label: "Session-RPE load · 7d", min: 0, max: 10000, description: "Internal workload over the previous seven days." },
  { key: "session_rpe_load_28d", label: "Session-RPE load · 28d", min: 0, max: 30000, description: "Internal workload over the previous 28 days." },
  { key: "y_balance_asymmetry_cm", label: "Balance asymmetry", unit: "cm", min: 0, max: 20, step: 0.5, description: "Optional strength/balance domain input." },
];

const CAMERA_LABELS: Record<keyof MediaPipeRiskFeatures, string> = {
  camera_knee_flexion_asymmetry_deg: "Knee-flexion asymmetry",
  camera_peak_knee_frontal_deviation_deg: "Peak frontal knee-line deviation proxy",
  camera_peak_trunk_lean_deg: "Peak trunk lean",
  camera_peak_pelvic_obliquity_deg: "Peak pelvic-line obliquity",
  camera_rep_excursion_variability_deg: "Rep-excursion variability",
  camera_rep_duration_cv_pct: "Rep-duration CV",
  mean_pose_confidence: "Mean tracking confidence",
  camera_measurement_frame_fraction: "Measurement-frame fraction",
};

function formatFeature(key: keyof MediaPipeRiskFeatures, value: number | null): string {
  if (value === null) return "Not captured";
  if (key === "mean_pose_confidence" || key === "camera_measurement_frame_fraction") {
    return `${(value * 100).toFixed(0)}%`;
  }
  if (key === "camera_rep_duration_cv_pct") return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)}°`;
}

export function InjuryRiskWorkbench() {
  const [movement, setMovement] = useState<MovementType>("squat-side");
  const analyzer = useMemo(() => new StageTwoMovementAnalyzer(movement), [movement]);
  const [analysis, setAnalysis] = useState<StageTwoAnalysisSnapshot | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [cameraFeatures, setCameraFeatures] = useState<MediaPipeRiskFeatures>(
    EMPTY_MEDIAPIPE_RISK_FEATURES,
  );
  const [inputs, setInputs] = useState(INITIAL_INPUTS);
  const [capturedProfiles, setCapturedProfiles] = useState<string[]>([]);
  const lastUiRef = useRef(-Infinity);

  function handleFrame(frame: PoseStreamFrame) {
    const snapshot = analyzer.ingest(frame);
    if (
      snapshot.latestCompletedRep ||
      frame.timestampMs - lastUiRef.current >= 120
    ) {
      lastUiRef.current = frame.timestampMs;
      setAnalysis(snapshot);
    }
  }

  function changeMovement(next: MovementType) {
    setMovement(next);
    setAnalysis(null);
    setCaptureReady(false);
    lastUiRef.current = -Infinity;
  }

  function saveSignature() {
    if (!analysis) return;
    const next = extractMediaPipeRiskFeatures(analysis);
    setCameraFeatures((current) => mergeMediaPipeRiskFeatures(current, next));
    setCapturedProfiles((current) =>
      current.includes(movement) ? current : [...current, movement],
    );
  }

  const featureValues = useMemo(() => {
    const values: Record<string, InjuryRiskFeatureValue> = {
      ...inputs,
      ...cameraFeatures,
    };
    return values;
  }, [inputs, cameraFeatures]);

  const inference = useMemo(
    () => inferPortableInjuryRisk(demoModel, featureValues),
    [featureValues],
  );

  const cameraObserved = Object.entries(cameraFeatures).filter(
    ([key, value]) =>
      key !== "mean_pose_confidence" &&
      key !== "camera_measurement_frame_fraction" &&
      value !== null,
  ).length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
        <div className="bg-zinc-950 px-6 py-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
                Multimodal injury-risk AI · research prototype
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                MediaPipe biomechanics + history + readiness + training exposure
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/65">
                The production architecture is designed for a prospectively trained injury model.
                This page currently uses a synthetic model artifact only to demonstrate the complete
                capture → feature → model → explanation pipeline. It is not a real injury probability.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
              <p className="font-semibold">Current evidence state</p>
              <p>Synthetic end-to-end model · clinical validation not claimed</p>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-200 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.8fr)]">
          <div className="bg-white p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Live MediaPipe feature capture
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Capture both front and side squat profiles to populate complementary camera features.
                </p>
              </div>
              <div className="flex gap-2">
                {(["squat-side", "squat-front"] as MovementType[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => changeMovement(item)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      movement === item
                        ? "bg-zinc-950 text-white"
                        : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {item === "squat-side" ? "Side squat" : "Front squat"}
                  </button>
                ))}
              </div>
            </div>

            <StageOneCapture
              key={movement}
              movement={movement}
              onStreamFrame={handleFrame}
              onReadyChange={setCaptureReady}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!analysis || !captureReady}
                onClick={saveSignature}
                className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Save current movement signature
              </button>
              <span className="text-xs text-zinc-500">
                Saved profiles: {capturedProfiles.length ? capturedProfiles.join(", ") : "none"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(cameraFeatures).map(([key, value]) => (
                <div key={key} className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs text-zinc-500">
                    {CAMERA_LABELS[key as keyof MediaPipeRiskFeatures]}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-950">
                    {formatFeature(key as keyof MediaPipeRiskFeatures, value)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-zinc-500">
              MediaPipe tracking confidence and measurement-frame coverage are capture-quality
              metadata. They are not treated as biological injury predictors by the strict
              prospective training pipeline.
            </p>
          </div>

          <div className="bg-[#f7f8f7] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Multimodal predictor inputs
            </p>
            <div className="mt-4 space-y-3">
              {INPUTS.map((field) => (
                <label key={field.key} className="block rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                  <span className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-900">
                    <span>{field.label}</span>
                    <span className="text-xs font-normal text-zinc-500">{field.unit ?? ""}</span>
                  </span>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    value={inputs[field.key]}
                    onChange={(event) =>
                      setInputs((current) => ({
                        ...current,
                        [field.key]: Number(event.target.value),
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
                    {field.description}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
            Synthetic demo model output
          </p>
          <p className="mt-3 text-5xl font-semibold tracking-tight tabular-nums text-zinc-950">
            {(inference.calibratedScore * 100).toFixed(0)}
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-700">model score / 100</p>
          <p className="mt-4 text-sm leading-6 text-amber-950">
            {inference.interpretation}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/70 p-3">
              <dt className="text-zinc-500">Feature coverage</dt>
              <dd className="mt-1 font-semibold text-zinc-950">
                {(inference.featureCoverage * 100).toFixed(0)}%
              </dd>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <dt className="text-zinc-500">Camera features</dt>
              <dd className="mt-1 font-semibold text-zinc-950">{cameraObserved}/6</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Explainable model output
              </p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-950">
                Strongest factors moving this model score
              </h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              {inference.evidenceLabel}
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {inference.topDrivers.map((driver) => (
              <div key={driver.feature} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {driver.feature.replaceAll("_", " ")}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {driver.domain.replaceAll("_", " ")} · observed {driver.observedValue ?? "imputed"}
                  </p>
                </div>
                <div className={`text-right text-sm font-semibold ${
                  driver.logitContribution >= 0 ? "text-amber-700" : "text-emerald-700"
                }`}>
                  {driver.logitContribution >= 0 ? "↑" : "↓"} {Math.abs(driver.logitContribution).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <EvidenceCard
          title="Published prospective benchmark"
          text="Wu et al. (2026) followed 142 competitive endurance runners for 12 months and reported 6,181 weekly samples. Their best reported AUC was 0.784 ± 0.014, but the study did not include independent external validation."
          href="https://doi.org/10.1038/s41746-026-02413-y"
        />
        <EvidenceCard
          title="What Movement Science Lab adds"
          text="The application contributes repeatable browser-based MediaPipe movement features, explicit measurement-version tracking, longitudinal change features, and a leakage-controlled participant-grouped training pipeline."
        />
        <EvidenceCard
          title="Clinical-validation path"
          text="Replace the synthetic artifact with prospectively labeled outcomes, freeze the protocol, validate measurement agreement, run nested participant-grouped evaluation, then test on an independent external cohort before any clinical probability claim."
        />
      </section>
    </div>
  );
}

function EvidenceCard({
  title,
  text,
  href,
}: {
  title: string;
  text: string;
  href?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-5">
      <h3 className="font-semibold text-zinc-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs font-semibold text-sky-700 underline"
        >
          Open source
        </a>
      )}
    </div>
  );
}
