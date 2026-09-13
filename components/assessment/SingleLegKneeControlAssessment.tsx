"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AssessmentCapture } from "./AssessmentCapture";
import { computeAnglesForMovement } from "@/lib/biomechanics/measurement-profile";
import type { AngleReading } from "@/lib/biomechanics/angles";
import type { PoseFrame } from "@/lib/pose/types";
import { INJURY_EVIDENCE } from "@/lib/ai/injury-risk-research";

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

type SideResult = {
  side: Side;
  peakKneeProxy: number | null;
  medianKneeProxy: number | null;
  peakTrunkLean: number | null;
  meanConfidence: number | null;
  samples: number;
};

type SideSamples = {
  knee: number[];
  trunk: number[];
  confidence: number[];
};

function emptySamples(): SideSamples {
  return { knee: [], trunk: [], confidence: [] };
}

function summarize(side: Side, values: SideSamples): SideResult {
  const sorted = [...values.knee].sort((a, b) => a - b);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : null;
  const meanConfidence = values.confidence.length
    ? values.confidence.reduce((sum, value) => sum + value, 0) / values.confidence.length
    : null;
  return {
    side,
    peakKneeProxy: values.knee.length ? Math.max(...values.knee.map(Math.abs)) : null,
    medianKneeProxy: median,
    peakTrunkLean: values.trunk.length ? Math.max(...values.trunk.map(Math.abs)) : null,
    meanConfidence,
    samples: values.knee.length,
  };
}

export function SingleLegKneeControlAssessment() {
  const [side, setSide] = useState<Side>("left");
  const [phase, setPhase] = useState<Phase>("setup");
  const [rep, setRep] = useState(1);
  const [ready, setReady] = useState(false);
  const [phaseStart, setPhaseStart] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [liveKnee, setLiveKnee] = useState<AngleReading | null>(null);
  const [leftResult, setLeftResult] = useState<SideResult | null>(null);
  const [rightResult, setRightResult] = useState<SideResult | null>(null);
  const samplesRef = useRef<SideSamples>(emptySamples());
  const recordingRef = useRef(false);

  const phaseConfig = PHASES.find((item) => item.key === phase) ?? null;
  const active = Boolean(phaseConfig);

  useEffect(() => {
    recordingRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!phaseConfig || phaseStart === null) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, phaseConfig.ms - (performance.now() - phaseStart));
      setRemainingMs(remaining);
      if (remaining > 0) return;

      const index = PHASES.findIndex((item) => item.key === phaseConfig.key);
      if (index < PHASES.length - 1) {
        const next = PHASES[index + 1];
        setPhase(next.key);
        setPhaseStart(performance.now());
        setRemainingMs(next.ms);
        return;
      }

      if (rep < REPS_PER_SIDE) {
        setRep((current) => current + 1);
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
    const kneeName = side === "left" ? "leftKneeFrontalDeviation" : "rightKneeFrontalDeviation";
    const knee = readings.find((item) => item.angleName === kneeName) ?? null;
    const trunk = readings.find((item) => item.angleName === "trunkLean") ?? null;
    setLiveKnee(knee);

    if (!recordingRef.current || !knee || knee.confidence < 0.7) return;
    samplesRef.current.knee.push(knee.value);
    if (trunk && trunk.confidence >= 0.7) samplesRef.current.trunk.push(trunk.value);
    samplesRef.current.confidence.push(knee.confidence);
  }

  function startSide() {
    if (!ready) return;
    samplesRef.current = emptySamples();
    setRep(1);
    setPhase(PHASES[0].key);
    setPhaseStart(performance.now());
    setRemainingMs(PHASES[0].ms);
  }

  function finishSide() {
    recordingRef.current = false;
    const result = summarize(side, samplesRef.current);
    if (side === "left") {
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
    setSide("right");
    setRep(1);
    samplesRef.current = emptySamples();
    setPhase("setup");
  }

  function restart() {
    setSide("left");
    setPhase("setup");
    setRep(1);
    setLeftResult(null);
    setRightResult(null);
    samplesRef.current = emptySamples();
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
    </div>
  ) : null;

  const asymmetry = leftResult?.peakKneeProxy !== null && leftResult?.peakKneeProxy !== undefined && rightResult?.peakKneeProxy !== null && rightResult?.peakKneeProxy !== undefined
    ? Math.abs(leftResult.peakKneeProxy - rightResult.peakKneeProxy)
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <div className="grid gap-8 border-b border-zinc-300 pb-7 lg:grid-cols-[1fr_360px] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Research battery · single-leg squat</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-5xl">Measure left and right frontal-plane knee control separately.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600">This task is closer to the single-leg squat protocols used in prospective FPKPA injury studies. The app uses a standardized 5-second movement cycle plus a reset period; it does not claim to exactly reproduce every published protocol.</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <strong>Safety:</strong> only use this test if you can balance on one leg comfortably. Stop for pain, instability, dizziness, or if you need external support. This is a research movement screen, not a diagnostic exam.
        </div>
      </div>

      <div className="mt-6 grid gap-px bg-zinc-200 md:grid-cols-4">
        {[
          ["1", "Face forward", "Camera should be centered in front of you with your full stance leg visible."],
          ["2", `Test the ${side} leg`, `Stand on your ${side} leg; bend the opposite knee and keep it off the floor.`],
          ["3", "Follow the pace", "2 seconds down · 1 second stabilize · 2 seconds up."],
          ["4", "Three valid reps", "Stay balanced and move naturally; do not deliberately push your knee in or out for the camera."],
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
            <p className="mt-2 text-xs leading-5 text-white/55">2D hip–knee–ankle projection proxy. It is conceptually related to FPKPA but is not automatically interchangeable with a study-specific marker/video measurement.</p>
          </div>
        </aside>
      </div>

      {(leftResult || rightResult) && (
        <section className="mt-10 border-t border-zinc-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Results</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Side-specific knee-control measurements</h2>
          <div className="mt-5 grid gap-px bg-zinc-200 sm:grid-cols-3">
            <Result title="Left peak proxy" value={leftResult?.peakKneeProxy} />
            <Result title="Right peak proxy" value={rightResult?.peakKneeProxy} />
            <Result title="Peak side-to-side difference" value={asymmetry} />
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
