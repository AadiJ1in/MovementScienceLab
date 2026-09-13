"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AssessmentCapture } from "./AssessmentCapture";
import { computeAnglesForMovement } from "@/lib/biomechanics/measurement-profile";
import type { AngleReading } from "@/lib/biomechanics/angles";
import type { PoseFrame } from "@/lib/pose/types";
import { INJURY_EVIDENCE } from "@/lib/ai/injury-risk-research";
import {
  emptySingleLegRepSamples,
  summarizeSingleLegSide,
  type SingleLegMeasurementPhase,
  type SingleLegRepSamples,
  type SingleLegSideSummary,
} from "@/lib/ai/single-leg-knee-control";

const MOVEMENT = "squat-front" as const;
const REPS_PER_SIDE = 3;
const PHASES = [
  { key: "down", label: "Lower", ms: 2000, cue: "Lower in control for 2 seconds" },
  { key: "hold", label: "Stabilize", ms: 1000, cue: "Pause briefly at a comfortable depth" },
  { key: "up", label: "Rise", ms: 2000, cue: "Return to standing in 2 seconds" },
  { key: "reset", label: "Reset", ms: 2000, cue: "Regain balance before the next repetition" },
] as const;

type Side = "left" | "right";
type Phase = "setup" | (typeof PHASES)[number]["key"] | "side-complete" | "complete";

function createRepBuffer(): SingleLegRepSamples[] {
  return Array.from({ length: REPS_PER_SIDE }, () => emptySingleLegRepSamples());
}

function isMeasurementPhase(phase: Phase): phase is SingleLegMeasurementPhase {
  return phase === "down" || phase === "hold" || phase === "up";
}

function qualityText(result: SingleLegSideSummary | null): string {
  if (!result) return "Not measured";
  if (result.dataQuality === "high") return "High capture quality";
  if (result.dataQuality === "moderate") return "Moderate capture quality";
  return "Low capture quality — repeat recommended";
}

export function SingleLegKneeControlAssessment() {
  const [side, setSide] = useState<Side>("left");
  const [phase, setPhase] = useState<Phase>("setup");
  const [rep, setRep] = useState(1);
  const [ready, setReady] = useState(false);
  const [phaseStart, setPhaseStart] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [liveKnee, setLiveKnee] = useState<AngleReading | null>(null);
  const [leftResult, setLeftResult] = useState<SingleLegSideSummary | null>(null);
  const [rightResult, setRightResult] = useState<SingleLegSideSummary | null>(null);
  const samplesRef = useRef<SingleLegRepSamples[]>(createRepBuffer());
  const phaseRef = useRef<Phase>("setup");
  const repRef = useRef(1);
  const sideRef = useRef<Side>("left");

  const phaseConfig = PHASES.find((item) => item.key === phase) ?? null;
  const active = Boolean(phaseConfig);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    repRef.current = rep;
  }, [rep]);

  useEffect(() => {
    sideRef.current = side;
  }, [side]);

  useEffect(() => {
    if (!phaseConfig || phaseStart === null) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, phaseConfig.ms - (performance.now() - phaseStart));
      setRemainingMs(remaining);
      if (remaining > 0) return;

      const index = PHASES.findIndex((item) => item.key === phaseConfig.key);
      if (index < PHASES.length - 1) {
        const next = PHASES[index + 1];
        phaseRef.current = next.key;
        setPhase(next.key);
        setPhaseStart(performance.now());
        setRemainingMs(next.ms);
        return;
      }

      if (rep < REPS_PER_SIDE) {
        const nextRep = rep + 1;
        repRef.current = nextRep;
        phaseRef.current = PHASES[0].key;
        setRep(nextRep);
        setPhase(PHASES[0].key);
        setPhaseStart(performance.now());
        setRemainingMs(PHASES[0].ms);
        return;
      }

      finishSide();
    }, 50);
    return () => window.clearInterval(timer);
  }, [phase, phaseConfig, phaseStart, rep]);

  function handleFrame(frame: PoseFrame | null) {
    if (!frame) {
      setLiveKnee(null);
      return;
    }

    const readings = computeAnglesForMovement(frame, MOVEMENT);
    const currentSide = sideRef.current;
    const kneeName = currentSide === "left" ? "leftKneeFrontalDeviation" : "rightKneeFrontalDeviation";
    const knee = readings.find((item) => item.angleName === kneeName) ?? null;
    const trunk = readings.find((item) => item.angleName === "trunkLean") ?? null;
    setLiveKnee(knee);

    const currentPhase = phaseRef.current;
    if (!isMeasurementPhase(currentPhase) || !knee || knee.confidence < 0.7) return;

    const repSamples = samplesRef.current[repRef.current - 1];
    if (!repSamples) return;

    repSamples.kneeByPhase[currentPhase].push(knee.value);
    repSamples.kneeConfidence.push(knee.confidence);
    if (trunk && trunk.confidence >= 0.7) repSamples.trunkLean.push(trunk.value);
  }

  function startSide() {
    if (!ready) return;
    samplesRef.current = createRepBuffer();
    repRef.current = 1;
    phaseRef.current = PHASES[0].key;
    setRep(1);
    setPhase(PHASES[0].key);
    setPhaseStart(performance.now());
    setRemainingMs(PHASES[0].ms);
  }

  function finishSide() {
    const result = summarizeSingleLegSide(samplesRef.current);
    phaseRef.current = sideRef.current === "left" ? "side-complete" : "complete";
    if (sideRef.current === "left") {
      setLeftResult(result);
      setPhase("side-complete");
    } else {
      setRightResult(result);
      setPhase("complete");
    }
    setPhaseStart(null);
    setRemainingMs(0);
  }

  function moveToRight() {
    sideRef.current = "right";
    phaseRef.current = "setup";
    repRef.current = 1;
    setSide("right");
    setRep(1);
    samplesRef.current = createRepBuffer();
    setPhase("setup");
  }

  function restart() {
    sideRef.current = "left";
    phaseRef.current = "setup";
    repRef.current = 1;
    setSide("left");
    setPhase("setup");
    setRep(1);
    setLeftResult(null);
    setRightResult(null);
    samplesRef.current = createRepBuffer();
  }

  const progress = phaseConfig ? Math.min(1, Math.max(0, 1 - remainingMs / phaseConfig.ms)) : 0;
  const overlay = active ? (
    <div className="w-[min(330px,78vw)] border border-white/20 bg-black/85 p-4 text-white backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">{side} leg · rep {rep}/{REPS_PER_SIDE}</p>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-xl font-semibold">{phaseConfig?.label}</p>
          <p className="mt-1 text-xs text-white/65">{phaseConfig?.cue}</p>
        </div>
        <p className="text-4xl font-semibold tabular-nums">{(remainingMs / 1000).toFixed(1)}</p>
      </div>
      <div className="mt-3 h-1.5 bg-white/15"><div className="h-full bg-white" style={{ width: `${progress * 100}%` }} /></div>
      {phase === "hold" && <p className="mt-2 text-xs font-semibold text-white/80">Primary stable-measurement window</p>}
      {phase === "reset" && <p className="mt-2 text-xs text-white/60">Reset frames are not included in the knee metric.</p>}
    </div>
  ) : null;

  const stableAsymmetry = leftResult?.stableHoldKneeDeg !== null && leftResult?.stableHoldKneeDeg !== undefined && rightResult?.stableHoldKneeDeg !== null && rightResult?.stableHoldKneeDeg !== undefined
    ? Math.abs(leftResult.stableHoldKneeDeg - rightResult.stableHoldKneeDeg)
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <div className="grid gap-8 border-b border-zinc-300 pb-7 lg:grid-cols-[1fr_360px] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Research battery · single-leg squat</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-5xl">Measure left and right frontal-plane knee control separately.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600">This task is closer to the single-leg squat protocols used in prospective FPKPA injury studies. The app separates each repetition into lower, stabilization, rise, and reset phases, and quality-gates every repetition before including it in the summary.</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <strong>Safety:</strong> only use this test if you can balance on one leg comfortably. Stop for pain, instability, dizziness, or if you need external support. This is a research movement screen, not a diagnostic exam.
        </div>
      </div>

      <div className="mt-6 grid gap-px bg-zinc-200 md:grid-cols-4">
        {[
          ["1", "Face forward", "Camera should be centered in front of you with your full stance leg visible."],
          ["2", `Test the ${side} leg`, `Stand on your ${side} leg; bend the opposite knee and keep it off the floor.`],
          ["3", "Follow the pace", "2 seconds down · 1 second stabilize · 2 seconds up · 2 seconds reset."],
          ["4", "Three quality-gated reps", "The AI requires enough high-confidence frames in the movement and stabilization windows before a rep counts."],
        ].map(([n, title, text]) => <div key={n} className="bg-white p-5"><p className="text-xs font-semibold text-zinc-400">{n}</p><h2 className="mt-2 text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p></div>)}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="border border-zinc-200 bg-white p-3 sm:p-4">
          <AssessmentCapture movement={MOVEMENT} onFrame={handleFrame} onReadyChange={setReady} overlay={overlay} />
        </div>
        <aside className="space-y-4">
          <div className="border border-zinc-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Current trial</p>
            <p className="mt-2 text-xl font-semibold capitalize">{side} stance leg</p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{ready ? "Landmark framing is usable. Begin when balanced and comfortable." : "Enable the camera and keep your full body visible before starting."}</p>
            {phase === "setup" && <button type="button" onClick={startSide} disabled={!ready} className="mt-5 w-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:bg-zinc-300">Start {side} side</button>}
            {active && <button type="button" onClick={finishSide} className="mt-5 w-full border border-zinc-300 px-4 py-3 text-sm font-semibold">Stop side</button>}
            {phase === "side-complete" && <button type="button" onClick={moveToRight} className="mt-5 w-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">Continue with right leg</button>}
            {phase === "complete" && <button type="button" onClick={restart} className="mt-5 w-full border border-zinc-300 px-4 py-3 text-sm font-semibold">Repeat battery</button>}
          </div>

          <div className="border border-zinc-200 bg-[#111] p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">AI tracking · stance knee</p>
            <p className="mt-4 text-4xl font-semibold tabular-nums">{liveKnee ? `${Math.abs(liveKnee.value).toFixed(1)}°` : "—"}</p>
            <p className="mt-2 text-xs leading-5 text-white/55">2D hip–knee–ankle projection proxy. The final result uses a stabilization-window median plus a 90th-percentile movement peak rather than a single raw maximum frame.</p>
          </div>

          <div className="border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-600">
            <p className="font-semibold text-zinc-950">Why the AI can reject a rep</p>
            <p className="mt-2">A rep is excluded if there are too few usable movement frames, too few stabilization frames, or mean stance-knee landmark confidence is below 70%.</p>
          </div>
        </aside>
      </div>

      {(leftResult || rightResult) && (
        <section className="mt-10 border-t border-zinc-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Results</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Quality-gated side-specific knee-control measurements</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">The stable metric is the median knee-projection magnitude during the one-second stabilization window, aggregated across valid repetitions. Robust peaks use the 90th percentile to reduce single-frame outlier sensitivity.</p>

          <div className="mt-5 grid gap-px bg-zinc-200 sm:grid-cols-3">
            <Result title="Left stable knee projection" value={leftResult?.stableHoldKneeDeg} />
            <Result title="Right stable knee projection" value={rightResult?.stableHoldKneeDeg} />
            <Result title="Stable side-to-side difference" value={stableAsymmetry} />
          </div>

          <div className="mt-px grid gap-px bg-zinc-200 sm:grid-cols-3">
            <Result title="Left robust movement peak" value={leftResult?.robustPeakKneeDeg} />
            <Result title="Right robust movement peak" value={rightResult?.robustPeakKneeDeg} />
            <div className="bg-white p-5">
              <p className="text-xs text-zinc-500">Valid repetitions</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{leftResult ? `${leftResult.validRepCount}/${leftResult.totalRepCount} L` : "—"} · {rightResult ? `${rightResult.validRepCount}/${rightResult.totalRepCount} R` : "—"}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <SideQualityCard side="Left" result={leftResult} />
            <SideQualityCard side="Right" result={rightResult} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {INJURY_EVIDENCE.filter((item) => item.id === "raisanen-2018-fpkpa" || item.id === "military-pfp-2020").map((item) => (
              <article key={item.id} className="border border-zinc-200 bg-white p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Prospective evidence · {item.strength}</p>
                <h3 className="mt-2 font-semibold text-zinc-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{item.finding}</p>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Read study ↗</a>
              </article>
            ))}
          </div>
          <div className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">A larger camera-derived knee projection may be relevant to published research, but the current value is not a validated individual injury probability. The prospective athlete study reported poor screening discrimination when FPKPA was used alone.</div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3 border-t border-zinc-200 pt-6">
        <Link href="/assessment" className="bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">Guided bilateral squat</Link>
        <Link href="/research" className="border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold">Research & validation</Link>
      </div>
    </div>
  );
}

function Result({ title, value }: { title: string; value: number | null | undefined }) {
  return <div className="bg-white p-5"><p className="text-xs text-zinc-500">{title}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value === null || value === undefined ? "—" : `${value.toFixed(1)}°`}</p></div>;
}

function SideQualityCard({ side, result }: { side: string; result: SingleLegSideSummary | null }) {
  return (
    <article className="border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{side} side</p>
          <h3 className="mt-1 font-semibold text-zinc-950">{qualityText(result)}</h3>
        </div>
        <span className="border border-zinc-200 px-2 py-1 text-xs font-semibold uppercase text-zinc-600">{result?.dataQuality ?? "—"}</span>
      </div>
      {result ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Metric label="Rep variability" value={result.repVariabilityDeg === null ? "—" : `${result.repVariabilityDeg.toFixed(1)}°`} />
            <Metric label="Mean confidence" value={result.meanKneeConfidence === null ? "—" : `${(result.meanKneeConfidence * 100).toFixed(0)}%`} />
            <Metric label="Robust trunk lean" value={result.robustPeakTrunkLeanDeg === null ? "—" : `${result.robustPeakTrunkLeanDeg.toFixed(1)}°`} />
            <Metric label="Valid reps" value={`${result.validRepCount}/${result.totalRepCount}`} />
          </dl>
          <div className="mt-5 divide-y divide-zinc-100 border-t border-zinc-200">
            {result.reps.map((rep, index) => (
              <div key={index} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 py-2.5 text-xs">
                <span className="font-semibold text-zinc-500">Rep {index + 1}</span>
                <span className="text-zinc-600">{rep.valid ? "Included" : exclusionLabel(rep.exclusionReason)}</span>
                <span className="font-semibold tabular-nums text-zinc-900">{rep.stableHoldKneeDeg === null ? "—" : `${rep.stableHoldKneeDeg.toFixed(1)}°`}</span>
              </div>
            ))}
          </div>
        </>
      ) : <p className="mt-4 text-sm text-zinc-500">Complete this side to calculate quality-gated results.</p>}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>;
}

function exclusionLabel(reason: SingleLegSideSummary["reps"][number]["exclusionReason"]): string {
  if (reason === "too-few-active-samples") return "Excluded · too few movement frames";
  if (reason === "too-few-hold-samples") return "Excluded · too few stabilization frames";
  if (reason === "low-confidence") return "Excluded · low tracking confidence";
  return "Excluded";
}
