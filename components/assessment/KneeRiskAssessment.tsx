"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssessmentCapture, type AssessmentCaptureTelemetry } from "./AssessmentCapture";
import { computeAnglesForMovement } from "@/lib/biomechanics/measurement-profile";
import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import type { PoseFrame } from "@/lib/pose/types";
import {
  INJURY_EVIDENCE,
  evaluateInjuryRiskResearch,
  summarizeKneeResearchFeatures,
  type InjuryRiskResearchResult,
} from "@/lib/ai/injury-risk-research";

const MOVEMENT = "squat-front" as const;
const TARGET_REPS = 5;
const PHASES = [
  { key: "down", label: "Lower", durationMs: 3000, cue: "Lower under control for 3 seconds" },
  { key: "hold", label: "Stabilize", durationMs: 1000, cue: "Hold your comfortable depth for 1 second" },
  { key: "up", label: "Rise", durationMs: 3000, cue: "Rise under control for 3 seconds" },
  { key: "reset", label: "Reset", durationMs: 2000, cue: "Stand tall and reset for the next repetition" },
] as const;

type ProtocolPhase = "ready" | (typeof PHASES)[number]["key"] | "complete";
type SampleStore = Record<
  "leftKneeFrontalDeviation" | "rightKneeFrontalDeviation" | "trunkLean" | "pelvicLineObliquity" | "poseConfidence",
  number[]
>;

function emptySamples(): SampleStore {
  return {
    leftKneeFrontalDeviation: [],
    rightKneeFrontalDeviation: [],
    trunkLean: [],
    pelvicLineObliquity: [],
    poseConfidence: [],
  };
}

export function KneeRiskAssessment() {
  const [captureReady, setCaptureReady] = useState(false);
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [telemetry, setTelemetry] = useState<AssessmentCaptureTelemetry | null>(null);
  const [phase, setPhase] = useState<ProtocolPhase>("ready");
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [repIndex, setRepIndex] = useState(1);
  const [live, setLive] = useState<Partial<Record<AngleName, AngleReading>>>({});
  const [result, setResult] = useState<InjuryRiskResearchResult | null>(null);
  const [showScience, setShowScience] = useState(false);
  const samplesRef = useRef<SampleStore>(emptySamples());
  const activeRef = useRef(false);

  const protocolActive = phase !== "ready" && phase !== "complete";
  const phaseConfig = PHASES.find((item) => item.key === phase) ?? null;

  useEffect(() => {
    activeRef.current = protocolActive;
  }, [protocolActive]);

  useEffect(() => {
    if (!phaseConfig || phaseStartedAt === null) return;
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - phaseStartedAt;
      const remaining = Math.max(0, phaseConfig.durationMs - elapsed);
      setRemainingMs(remaining);
      if (remaining > 0) return;

      const currentIndex = PHASES.findIndex((item) => item.key === phaseConfig.key);
      if (currentIndex < PHASES.length - 1) {
        const next = PHASES[currentIndex + 1];
        setPhase(next.key);
        setPhaseStartedAt(performance.now());
        setRemainingMs(next.durationMs);
        return;
      }

      if (repIndex < TARGET_REPS) {
        setRepIndex((current) => current + 1);
        setPhase(PHASES[0].key);
        setPhaseStartedAt(performance.now());
        setRemainingMs(PHASES[0].durationMs);
      } else {
        finishProtocol();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [phase, phaseConfig, phaseStartedAt, repIndex]);

  function handleFrame(nextFrame: PoseFrame | null) {
    setFrame(nextFrame);
    if (!nextFrame) return;
    const readings = computeAnglesForMovement(nextFrame, MOVEMENT);
    const byName: Partial<Record<AngleName, AngleReading>> = {};
    readings.forEach((reading) => {
      byName[reading.angleName] = reading;
    });
    setLive(byName);

    if (!activeRef.current) return;
    const samples = samplesRef.current;
    (["leftKneeFrontalDeviation", "rightKneeFrontalDeviation", "trunkLean", "pelvicLineObliquity"] as const)
      .forEach((name) => {
        const reading = byName[name];
        if (reading && reading.confidence >= 0.7) samples[name].push(reading.value);
      });
    const meanConfidence = nextFrame.keypoints.length
      ? nextFrame.keypoints.reduce((sum, point) => sum + point.visibility, 0) / nextFrame.keypoints.length
      : 0;
    samples.poseConfidence.push(meanConfidence);
  }

  function startProtocol() {
    if (!captureReady) return;
    samplesRef.current = emptySamples();
    setResult(null);
    setRepIndex(1);
    setPhase(PHASES[0].key);
    setPhaseStartedAt(performance.now());
    setRemainingMs(PHASES[0].durationMs);
  }

  function finishProtocol() {
    activeRef.current = false;
    setPhase("complete");
    setPhaseStartedAt(null);
    setRemainingMs(0);
    const samples = samplesRef.current;
    const features = summarizeKneeResearchFeatures({
      leftKneeDeviation: samples.leftKneeFrontalDeviation,
      rightKneeDeviation: samples.rightKneeFrontalDeviation,
      trunkLean: samples.trunkLean,
      pelvicObliquity: samples.pelvicLineObliquity,
      poseConfidence: samples.poseConfidence,
    });
    setResult(evaluateInjuryRiskResearch(features));
  }

  function restart() {
    activeRef.current = false;
    samplesRef.current = emptySamples();
    setPhase("ready");
    setPhaseStartedAt(null);
    setRemainingMs(0);
    setRepIndex(1);
    setResult(null);
  }

  const phaseProgress = phaseConfig && phaseStartedAt !== null
    ? Math.min(1, Math.max(0, 1 - remainingMs / phaseConfig.durationMs))
    : 0;
  const seconds = phaseConfig ? Math.max(0, remainingMs / 1000) : 0;

  const overlay = protocolActive ? (
    <div className="w-[min(340px,78vw)] border border-white/20 bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Rep {repIndex} of {TARGET_REPS}</p>
          <p className="mt-1 text-xl font-semibold">{phaseConfig?.label}</p>
        </div>
        <p className="text-4xl font-semibold tabular-nums">{seconds.toFixed(1)}</p>
      </div>
      <p className="mt-2 text-sm text-white/75">{phaseConfig?.cue}</p>
      <div className="mt-3 h-1.5 bg-white/15">
        <div className="h-full bg-white transition-[width] duration-75" style={{ width: `${phaseProgress * 100}%` }} />
      </div>
    </div>
  ) : null;

  const left = live.leftKneeFrontalDeviation;
  const right = live.rightKneeFrontalDeviation;
  const trunk = live.trunkLean;
  const pelvis = live.pelvicLineObliquity;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <section className="grid gap-8 border-b border-zinc-200 pb-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">AI knee-control research assessment</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-5xl">
            A guided, timed squat screen with visible biomechanics and injury-risk research context.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600">
            The AI pose model tracks your body while the protocol standardizes movement timing. The app measures a 2D frontal-plane knee-deviation proxy, trunk lean, pelvic-line obliquity, symmetry, and capture confidence. Results are linked to prospective injury literature without claiming that a webcam can diagnose or guarantee a future injury.
          </p>
        </div>
        <div className="border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-950">Protocol</p>
          <p className="mt-2">5 repetitions · 3 s down · 1 s stabilize · 3 s up · 2 s reset</p>
          <p className="mt-3 text-xs leading-5 text-zinc-500">The 1-second stabilization phase is used to standardize measurement capture; it is not itself an injury-prediction threshold.</p>
        </div>
      </section>

      <section className="mt-6 grid gap-px bg-zinc-200 md:grid-cols-4">
        {[
          ["1", "Face the camera", "Keep shoulders, hips, knees, ankles, and feet visible."],
          ["2", "Stand naturally", "Feet comfortable, torso facing forward, no deliberate correction for the camera."],
          ["3", "Follow the timer", "Move only when the on-screen phase changes: lower, stabilize, rise, reset."],
          ["4", "Complete 5 reps", "Stop if you have pain or cannot safely complete the movement."],
        ].map(([number, title, text]) => (
          <div key={number} className="bg-white p-5">
            <p className="text-xs font-semibold text-zinc-400">{number}</p>
            <h2 className="mt-2 text-sm font-semibold text-zinc-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-zinc-200 bg-white p-3 sm:p-4">
          <AssessmentCapture
            movement={MOVEMENT}
            onFrame={handleFrame}
            onReadyChange={setCaptureReady}
            onTelemetryChange={setTelemetry}
            overlay={overlay}
          />
        </div>

        <aside className="space-y-4">
          <div className="border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Assessment status</p>
              <span className={`h-2.5 w-2.5 rounded-full ${captureReady ? "bg-emerald-500" : "bg-amber-400"}`} aria-hidden="true" />
            </div>
            <p className="mt-3 text-lg font-semibold text-zinc-950">
              {phase === "complete" ? "Assessment complete" : captureReady ? "Ready to assess" : "Camera setup required"}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {phase === "complete"
                ? "Review the measured features and research associations below."
                : captureReady
                  ? "Your required landmarks are visible. Start when you are standing comfortably."
                  : "Enable the camera, accept the local-processing notice, and move your full body into frame."}
            </p>
            <div className="mt-5 flex gap-2">
              {phase === "ready" && (
                <button type="button" onClick={startProtocol} disabled={!captureReady} className="flex-1 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300">
                  Start 5-rep assessment
                </button>
              )}
              {protocolActive && (
                <button type="button" onClick={finishProtocol} className="flex-1 border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-900">
                  Stop assessment
                </button>
              )}
              {phase === "complete" && (
                <button type="button" onClick={restart} className="flex-1 border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-900">
                  Repeat assessment
                </button>
              )}
            </div>
          </div>

          <div className="border border-zinc-200 bg-[#111] p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">AI tracking · live</p>
            <div className="mt-4 space-y-4">
              <LiveMetric label="Left knee deviation proxy" value={left ? `${left.value.toFixed(1)}°` : "—"} confidence={left?.confidence} />
              <LiveMetric label="Right knee deviation proxy" value={right ? `${right.value.toFixed(1)}°` : "—"} confidence={right?.confidence} />
              <LiveMetric label="Trunk lean" value={trunk ? `${trunk.value.toFixed(1)}°` : "—"} confidence={trunk?.confidence} />
              <LiveMetric label="Pelvic-line obliquity" value={pelvis ? `${pelvis.value.toFixed(1)}°` : "—"} confidence={pelvis?.confidence} />
            </div>
            <div className="mt-5 border-t border-white/15 pt-4 text-xs leading-5 text-white/60">
              MediaPipe Pose AI estimates 33 landmarks in the browser. These measurements are 2D camera-derived features, not force, tissue-load, or diagnostic measurements.
            </div>
          </div>

          <div className="border border-zinc-200 bg-white p-5 text-sm">
            <p className="font-semibold text-zinc-950">Capture telemetry</p>
            <dl className="mt-3 space-y-2 text-zinc-600">
              <DataRow label="Resolution" value={telemetry?.width && telemetry.height ? `${telemetry.width}×${telemetry.height}` : "—"} />
              <DataRow label="Pose FPS" value={telemetry?.inferenceFps ? telemetry.inferenceFps.toFixed(1) : "—"} />
              <DataRow label="Mean pose confidence" value={telemetry?.meanPoseConfidence ? `${(telemetry.meanPoseConfidence * 100).toFixed(0)}%` : "—"} />
              <DataRow label="AI runtime" value={telemetry?.delegate ?? "—"} />
            </dl>
          </div>
        </aside>
      </section>

      {result && <ResearchResults result={result} onShowScience={() => setShowScience((value) => !value)} showScience={showScience} />}

      <div className="mt-8 flex flex-wrap gap-3 border-t border-zinc-200 pt-6">
        <Link href="/account" className="bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">Sign in to save progress</Link>
        <Link href="/assessment/general" className="border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800">Open general movement assessment</Link>
        <Link href="/research" className="border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800">Research & validation</Link>
      </div>
    </div>
  );
}

function LiveMetric({ label, value, confidence }: { label: string; value: string; confidence?: number }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
      <div>
        <p className="text-xs text-white/55">{label}</p>
        {confidence !== undefined && <p className="mt-1 text-[10px] text-white/35">confidence {(confidence * 100).toFixed(0)}%</p>}
      </div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-medium text-zinc-900">{value}</dd></div>;
}

function ResearchResults({ result, showScience, onShowScience }: { result: InjuryRiskResearchResult; showScience: boolean; onShowScience: () => void }) {
  const features = result.features;
  return (
    <section className="mt-10 border-t border-zinc-300 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">AI + prospective evidence</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">Research injury-risk screen</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">The system separates measured biomechanics from evidence-linked associations. It does not convert a webcam angle into a fabricated injury probability.</p>
        </div>
        <div className="border border-zinc-200 bg-white px-4 py-3 text-sm">
          Data quality <strong className="ml-2 capitalize">{result.dataQuality}</strong>
        </div>
      </div>

      <div className="mt-6 grid gap-px bg-zinc-200 sm:grid-cols-2 lg:grid-cols-5">
        <ResultMetric label="Peak knee-deviation proxy" value={formatDegrees(features.peakKneeDeviationDeg)} />
        <ResultMetric label="Left knee proxy" value={formatDegrees(features.leftKneeDeviationDeg)} />
        <ResultMetric label="Right knee proxy" value={formatDegrees(features.rightKneeDeviationDeg)} />
        <ResultMetric label="Side-to-side difference" value={formatDegrees(features.kneeAsymmetryDeg)} />
        <ResultMetric label="Peak trunk lean" value={formatDegrees(features.trunkLeanDeg)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {result.associations.map((association) => (
          <article key={association.target} className="border border-zinc-200 bg-white p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{association.status.replaceAll("-", " ")}</p>
            <h3 className="mt-2 text-base font-semibold text-zinc-950">{association.label}</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{association.explanation}</p>
          </article>
        ))}
      </div>

      <div className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        {result.disclaimer}
      </div>

      <button type="button" onClick={onShowScience} className="mt-5 border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900">
        {showScience ? "Hide evidence details" : "Show the science behind this screen"}
      </button>

      {showScience && (
        <div className="mt-4 grid gap-px bg-zinc-200 md:grid-cols-2">
          {INJURY_EVIDENCE.map((evidence) => (
            <article key={evidence.id} className="bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{evidence.strength} evidence · {evidence.task}</p>
              <h3 className="mt-2 text-sm font-semibold text-zinc-950">{evidence.title}</h3>
              <p className="mt-2 text-xs text-zinc-500">Population: {evidence.population}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{evidence.finding}</p>
              <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-zinc-950 underline underline-offset-4">Read source ↗</a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-white p-5"><p className="text-xs leading-5 text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">{value}</p></div>;
}

function formatDegrees(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}°`;
}
