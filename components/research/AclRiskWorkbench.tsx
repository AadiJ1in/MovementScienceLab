"use client";

import { useMemo, useRef, useState } from "react";
import { StageOneCapture } from "@/components/pose/StageOneCapture";
import {
  StageTwoMovementAnalyzer,
  type StageTwoAnalysisSnapshot,
} from "@/lib/biomechanics/stage-two-analysis";
import {
  computeLiteratureSeededAclSignal,
  type AclRiskInput,
} from "@/lib/acl/acl-risk-equation";
import {
  extractAclVideoFeatures,
  type AclVideoFeatureSnapshot,
} from "@/lib/acl/acl-video-features";
import type { PoseStreamFrame } from "@/lib/pose/stream";
import type { MovementType } from "@/lib/pose/types";

const EMPTY_VIDEO: AclVideoFeatureSnapshot = {
  dynamicKneeValgusProxyDeg: null,
  trunkLeanProxyDeg: null,
  kneeFlexionPeakDeg: null,
  kneeFlexionMinimumDeg: null,
  interlimbKneeFlexionAsymmetryDeg: null,
  repVariabilityDeg: null,
  measurementFrameFraction: 0,
  meanMeasurementConfidence: null,
  measurementCompatibility: "2d-proxy-research-only",
};

type ManualInputs = {
  priorAclRupture: 0 | 1;
  cmjPeakTakeoffForceBw: number | null;
  hipAdductorAbductorRatio: number | null;
  sportExposureHours28d: number | null;
};

function mergeVideo(
  current: AclVideoFeatureSnapshot,
  next: AclVideoFeatureSnapshot,
): AclVideoFeatureSnapshot {
  const result = { ...current };
  for (const key of Object.keys(result) as Array<keyof AclVideoFeatureSnapshot>) {
    const value = next[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      // TypeScript cannot preserve the mapped scalar type through Object.keys.
      (result as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

export function AclRiskWorkbench() {
  const [movement, setMovement] = useState<MovementType>("general-front");
  const analyzer = useMemo(() => new StageTwoMovementAnalyzer(movement), [movement]);
  const [analysis, setAnalysis] = useState<StageTwoAnalysisSnapshot | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [videoFeatures, setVideoFeatures] = useState<AclVideoFeatureSnapshot>(EMPTY_VIDEO);
  const [savedViews, setSavedViews] = useState<string[]>([]);
  const [manual, setManual] = useState<ManualInputs>({
    priorAclRupture: 0,
    cmjPeakTakeoffForceBw: null,
    hipAdductorAbductorRatio: null,
    sportExposureHours28d: null,
  });
  const lastUiRef = useRef(-Infinity);

  function handleFrame(frame: PoseStreamFrame) {
    const snapshot = analyzer.ingest(frame);
    if (frame.timestampMs - lastUiRef.current >= 100) {
      lastUiRef.current = frame.timestampMs;
      setAnalysis(snapshot);
    }
  }

  function selectView(next: MovementType) {
    setMovement(next);
    setAnalysis(null);
    setCaptureReady(false);
    lastUiRef.current = -Infinity;
  }

  function saveCapture() {
    if (!analysis) return;
    const extracted = extractAclVideoFeatures(analysis);
    setVideoFeatures((current) => mergeVideo(current, extracted));
    setSavedViews((current) =>
      current.includes(movement) ? current : [...current, movement],
    );
  }

  const equationInput: AclRiskInput = {
    priorAclRupture: manual.priorAclRupture,
    dynamicKneeValgusDeg: videoFeatures.dynamicKneeValgusProxyDeg,
    ipsilateralTrunkFlexionDeg: videoFeatures.trunkLeanProxyDeg,
    cmjPeakTakeoffForceBw: manual.cmjPeakTakeoffForceBw,
    hipAdductorAbductorRatio: manual.hipAdductorAbductorRatio,
    kneeFlexionAtInitialContactDeg: videoFeatures.kneeFlexionMinimumDeg,
    trainingExposureHours: manual.sportExposureHours28d,
  };
  const signal = computeLiteratureSeededAclSignal(equationInput);

  const completeForLiteratureSignal = signal.missingCoreFeatures.length === 0;
  const captureQuality =
    videoFeatures.meanMeasurementConfidence === null
      ? "Not captured"
      : `${(videoFeatures.meanMeasurementConfidence * 100).toFixed(0)}%`;

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
        <div className="bg-[#0d1612] px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                ACL-only research AI
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Predictive research focused only on noncontact ACL rupture
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
                This workspace combines MediaPipe-derived landing mechanics with ACL history,
                hip strength balance, jump kinetics, and exposure. The current equation is a
                literature-seeded research signal; absolute tear probability remains locked until
                prospective ACL outcomes and external validation exist.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
              <p className="font-semibold">Clinical probability</p>
              <p>Disabled · prospective validation required</p>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-200 xl:grid-cols-[1.35fr_.65fr]">
          <div className="bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Standardized video mechanics capture
                </p>
                <h2 className="mt-1 text-xl font-semibold">Front + side landing screen</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Use the front view for frontal knee-line deviation and the side view for knee
                  flexion/trunk projection. Perform the same controlled landing task in each view.
                  These are 2D proxies, not laboratory 3D kinetics.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectView("general-front")}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${movement === "general-front" ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}
                >
                  Front landing
                </button>
                <button
                  type="button"
                  onClick={() => selectView("general-side")}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${movement === "general-side" ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}
                >
                  Side landing
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
              <strong className="text-zinc-900">Capture protocol:</strong> keep the full body and both feet visible for the front view; use a true side-on view for the sagittal capture. Record several controlled landings. The model stores measurement summaries, not a diagnosis.
            </div>

            <div className="mt-5">
              <StageOneCapture
                key={movement}
                movement={movement}
                onStreamFrame={handleFrame}
                onReadyChange={setCaptureReady}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveCapture}
                disabled={!analysis || !captureReady}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Save ACL mechanics capture
              </button>
              <span className="text-xs text-zinc-500">
                Views saved: {savedViews.length ? savedViews.map((view) => view.replace("general-", "")).join(" + ") : "none"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Metric label="Knee valgus / frontal deviation proxy" value={degrees(videoFeatures.dynamicKneeValgusProxyDeg)} />
              <Metric label="Trunk lean proxy" value={degrees(videoFeatures.trunkLeanProxyDeg)} />
              <Metric label="Peak knee flexion projection" value={degrees(videoFeatures.kneeFlexionPeakDeg)} />
              <Metric label="Minimum knee flexion projection" value={degrees(videoFeatures.kneeFlexionMinimumDeg)} />
              <Metric label="Interlimb knee-flexion asymmetry" value={degrees(videoFeatures.interlimbKneeFlexionAsymmetryDeg)} />
              <Metric label="Tracking quality" value={captureQuality} />
            </div>
          </div>

          <aside className="bg-[#f7f8f7] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Non-video ACL inputs
            </p>
            <div className="mt-4 space-y-4">
              <label className="block rounded-xl bg-white p-4 ring-1 ring-zinc-200">
                <span className="text-sm font-semibold">Prior ACL rupture/reconstruction</span>
                <select
                  value={manual.priorAclRupture}
                  onChange={(event) => setManual((current) => ({ ...current, priorAclRupture: Number(event.target.value) as 0 | 1 }))}
                  className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value={0}>No</option>
                  <option value={1}>Yes</option>
                </select>
              </label>
              <NumberField
                label="CMJ peak take-off force"
                unit="× body weight"
                value={manual.cmjPeakTakeoffForceBw}
                placeholder="e.g. 1.19"
                onChange={(value) => setManual((current) => ({ ...current, cmjPeakTakeoffForceBw: value }))}
              />
              <NumberField
                label="Hip adductor : abductor strength ratio"
                value={manual.hipAdductorAbductorRatio}
                placeholder="e.g. 0.97"
                onChange={(value) => setManual((current) => ({ ...current, hipAdductorAbductorRatio: value }))}
              />
              <NumberField
                label="Sport exposure · previous 28 days"
                unit="hours"
                value={manual.sportExposureHours28d}
                placeholder="e.g. 32"
                onChange={(value) => setManual((current) => ({ ...current, sportExposureHours28d: value }))}
              />
            </div>
            <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs leading-5 text-sky-950">
              Force and strength are not inferred from an ordinary webcam. A future video-to-force model must first be validated against force-plate measurements before it can replace direct kinetic testing.
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={`rounded-[1.75rem] border p-6 ${completeForLiteratureSignal ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Literature-seeded ACL signal
          </p>
          <p className="mt-3 text-4xl font-semibold tabular-nums text-zinc-950">
            {completeForLiteratureSignal ? signal.relativeLogOddsSignal.toFixed(2) : "Incomplete"}
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-700">relative log-odds signal</p>
          <p className="mt-4 text-sm leading-6 text-zinc-700">{signal.interpretation}</p>
          <div className="mt-5 rounded-xl bg-white/70 p-3 text-xs text-zinc-600">
            Core feature coverage: <strong>{signal.observedCoreFeatures}/5</strong>
          </div>
          {signal.missingCoreFeatures.length > 0 && (
            <div className="mt-3 text-xs leading-5 text-zinc-700">
              Missing: {signal.missingCoreFeatures.join("; ")}
            </div>
          )}
        </div>

        <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Mathematical model</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">Target equation for prospective ACL prediction</h2>
          <div className="mt-4 overflow-x-auto rounded-xl bg-zinc-950 p-4 font-mono text-sm leading-7 text-emerald-200">
            P(ACL tear in horizon) = 1 − exp[−E · h₀ · exp(β₀ + Σ βⱼzⱼ)]
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-600">
            E is sport exposure during the risk window. The β coefficients combine ACL history,
            validated landing mechanics, strength/kinetics, workload/fatigue, and longitudinal
            change. h₀ and all final coefficients must be learned from prospectively observed ACL
            events; the published odds ratios on this page are priors/reference values only.
          </p>
          <details className="mt-4 rounded-xl border border-zinc-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Show current literature reference formula</summary>
            <p className="mt-3 break-words font-mono text-xs leading-6 text-zinc-600">{signal.formula}</p>
          </details>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard title="Video measurement AI" status="Operational" text="MediaPipe produces versioned 2D ACL-mechanics candidate features. Measurement equivalence to 3D/force-plate variables still requires protocol-specific validation." />
        <StatusCard title="Prospective ACL ML" status="Pipeline operational" text="The repository now has an ACL-only, participant-grouped ML benchmark for medically confirmed noncontact/indirect-contact ACL outcomes." />
        <StatusCard title="Clinical tear probability" status="Locked" text="Requires sufficient prospective ACL events, probability calibration, same-camera measurement validation, independent external validation, and clinical governance." />
      </section>
    </div>
  );
}

function degrees(value: number | null) {
  return value === null ? "Not captured" : `${value.toFixed(1)}°`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4">
      <p className="text-xs leading-5 text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{value}</p>
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number | null;
  placeholder: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <span className="flex justify-between gap-3 text-sm font-semibold text-zinc-900">
        <span>{label}</span>
        <span className="font-normal text-zinc-500">{unit ?? ""}</span>
      </span>
      <input
        type="number"
        step="any"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function StatusCard({ title, status, text }: { title: string; status: string; text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{status}</p>
      <h3 className="mt-2 font-semibold text-zinc-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
    </div>
  );
}
