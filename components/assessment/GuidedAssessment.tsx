"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AngleTimeSeriesChart } from "@/components/analysis/AngleCharts";
import { AssessmentCapture, type AssessmentCaptureTelemetry } from "./AssessmentCapture";
import { buildCalibrationChecks, calibrationPassed } from "@/lib/assessment/calibration";
import { MOVEMENT_DEFINITIONS, getMovementDefinition, statusLabel } from "@/lib/assessment/movement-definitions";
import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import { computeAnglesForMovement } from "@/lib/biomechanics/measurement-profile";
import type { RepSummary } from "@/lib/biomechanics/rep-segmentation";
import { getExerciseDefinition } from "@/lib/exercises/registry";
import { createExerciseRepSegmenter, type ExerciseRepSegmenter } from "@/lib/exercises/segmentation";
import type { MovementType, PoseFrame } from "@/lib/pose/types";

const MAX_CAPTURED_READINGS = 12000;
type Step = 1 | 2 | 3 | 4 | 5;

const ANGLE_LABELS: Record<AngleName, string> = {
  leftKneeFlexion: "Left knee flexion",
  rightKneeFlexion: "Right knee flexion",
  leftKneeFrontalDeviation: "Left knee tracking proxy",
  rightKneeFrontalDeviation: "Right knee tracking proxy",
  trunkLean: "Trunk lean",
  pelvicLineObliquity: "Pelvic-line obliquity",
  leftShoulderElevation: "Left shoulder elevation",
  rightShoulderElevation: "Right shoulder elevation",
};

export function GuidedAssessment() {
  const [step, setStep] = useState<Step>(1);
  const [movement, setMovement] = useState<MovementType>("squat-front");
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [telemetry, setTelemetry] = useState<AssessmentCaptureTelemetry | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [liveReading, setLiveReading] = useState<AngleReading | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [selectedRep, setSelectedRep] = useState<number | null>(null);

  const readingsRef = useRef<AngleReading[]>([]);
  const repsRef = useRef<RepSummary[]>([]);
  const segmenterRef = useRef<ExerciseRepSegmenter | null>(null);
  const startTimestampRef = useRef<number | null>(null);
  const recordingRef = useRef(false);

  const definition = getMovementDefinition(movement);
  const exercise = getExerciseDefinition(movement);
  const hasRepDetector = exercise.segmentation.strategy === "angle-cycle";
  const calibrationChecks = useMemo(() => buildCalibrationChecks(frame, movement), [frame, movement]);
  const isCalibrated = captureReady && calibrationPassed(calibrationChecks);

  function beginRecording() {
    readingsRef.current = [];
    repsRef.current = [];
    segmenterRef.current = createExerciseRepSegmenter(movement);
    startTimestampRef.current = null;
    recordingRef.current = true;
    setRepCount(0);
    setSelectedRep(null);
    setIsRecording(true);
    setStep(4);
  }

  useEffect(() => {
    recordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      beginRecording();
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((current) => (current === null ? null : current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  function chooseMovement(next: MovementType) {
    setMovement(next);
    setStep(2);
    setFrame(null);
    setCaptureReady(false);
  }

  function handleFrame(nextFrame: PoseFrame | null) {
    setFrame(nextFrame);
    if (!nextFrame) {
      setLiveReading(null);
      return;
    }

    const angles = computeAnglesForMovement(nextFrame, movement);
    const primary = angles.find((item) => item.angleName === definition.primaryMetric) ?? angles[0] ?? null;
    setLiveReading(primary);
    if (!recordingRef.current) return;

    if (startTimestampRef.current === null) startTimestampRef.current = nextFrame.frameTimestamp;
    const normalized = angles.map((item) => ({
      ...item,
      frameTimestamp: item.frameTimestamp - (startTimestampRef.current ?? item.frameTimestamp),
    }));

    readingsRef.current.push(...normalized);
    if (readingsRef.current.length > MAX_CAPTURED_READINGS) {
      readingsRef.current.splice(0, readingsRef.current.length - MAX_CAPTURED_READINGS);
    }

    const segmenter = segmenterRef.current;
    if (!segmenter) return;
    const rep = segmenter.ingest(normalized);
    if (rep) {
      repsRef.current.push(rep);
      setRepCount(repsRef.current.length);
    }
  }

  function beginCountdown() {
    if (isCalibrated && countdown === null) setCountdown(3);
  }

  function stopRecording() {
    recordingRef.current = false;
    setIsRecording(false);
    setStep(5);
  }

  function restart() {
    recordingRef.current = false;
    readingsRef.current = [];
    repsRef.current = [];
    segmenterRef.current?.reset();
    segmenterRef.current = null;
    setStep(1);
    setIsRecording(false);
    setCountdown(null);
    setFrame(null);
    setCaptureReady(false);
    setLiveReading(null);
    setRepCount(0);
    setSelectedRep(null);
  }

  const captureOverlay = isRecording ? (
    <div className="rounded-2xl bg-black/75 px-4 py-3 text-right text-white backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">Live measurement</p>
      <p className="mt-1 text-sm font-medium">{liveReading ? ANGLE_LABELS[liveReading.angleName] : "Tracking"}</p>
      <p className="text-2xl font-semibold tabular-nums">{liveReading ? `${liveReading.value.toFixed(1)}°` : "—"}</p>
      {hasRepDetector && <p className="mt-1 text-xs text-white/70">Reps {repCount}</p>}
    </div>
  ) : countdown !== null ? (
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/80 text-4xl font-semibold text-white backdrop-blur">{countdown || "Go"}</div>
  ) : null;

  const needsCamera = step >= 2 && step <= 4;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <AssessmentProgress step={step} />

      {step === 1 && (
        <section className="mx-auto max-w-5xl py-8 sm:py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Step 1</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Choose a movement</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">Choose the movement and camera view that match what you want to measure. Each card lists only measurements supported by the current camera pipeline.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MOVEMENT_DEFINITIONS.map((item) => (
              <button key={item.id} type="button" onClick={() => chooseMovement(item.id)} className="group rounded-[1.75rem] bg-white p-6 text-left shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-500">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xl font-semibold text-zinc-950">{item.title}</p><p className="mt-1 text-sm font-medium text-sky-700">{item.viewLabel}</p></div>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">{statusLabel(item.status)}</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-600">{item.shortDescription}</p>
                <ul className="mt-5 space-y-2 text-sm text-zinc-700">
                  {item.supportedMeasurements.map((measurement) => <li key={measurement} className="flex gap-2"><span aria-hidden="true" className="text-sky-600">•</span><span>{measurement}</span></li>)}
                </ul>
                <div className="mt-6 text-sm font-semibold text-zinc-950">Select assessment →</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {needsCamera && (
        <section className="mt-6 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Step {step}</p>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-3xl">{step === 2 ? "Set up your camera" : step === 3 ? "Calibrate your position" : "Complete the movement"}</h1>
              <p className="mt-2 text-sm text-zinc-600">{definition.title} · {definition.viewLabel}</p>
            </div>
            {step !== 4 && <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700">Change movement</button>}
          </div>

          <AssessmentCapture movement={movement} onFrame={handleFrame} onReadyChange={setCaptureReady} onTelemetryChange={setTelemetry} overlay={captureOverlay} />

          {step === 2 && (
            <ActionPanel title="Camera connection" text={frame ? "Pose tracking is active. Continue to calibration." : "Enable the camera and move into view before continuing."}>
              <button type="button" disabled={!frame} onClick={() => setStep(3)} className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300">Continue to calibration</button>
            </ActionPanel>
          )}

          {step === 3 && (
            <div className="grid gap-4 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="font-semibold text-zinc-950">Calibration checklist</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {calibrationChecks.map((check) => (
                    <div key={check.id} className="flex items-center gap-2 text-sm text-zinc-700">
                      <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${check.passed ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"}`}>{check.passed ? "✓" : "–"}</span>
                      <span>{check.label}</span><span className="sr-only">{check.passed ? "passed" : "not yet passed"}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-zinc-500">These are capture-quality checks based on landmark visibility and framing. They are not clinical measurements.</p>
              </div>
              <button type="button" disabled={!isCalibrated || countdown !== null} onClick={beginCountdown} className="rounded-xl bg-sky-700 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300">{countdown !== null ? `Starting in ${countdown}…` : "Begin assessment"}</button>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4 rounded-[1.75rem] bg-zinc-950 p-5 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Recording</p><p className="mt-1 text-lg font-semibold">Move naturally through the assessment.</p><p className="mt-1 text-sm text-white/65">{captureReady ? "Capture quality is currently usable." : "Tracking quality dropped. Reposition before continuing."}</p></div>
              <button type="button" onClick={stopRecording} className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950">Finish assessment</button>
            </div>
          )}
        </section>
      )}

      {step === 5 && <ResultsScreen movement={movement} readings={readingsRef.current} reps={repsRef.current} telemetry={telemetry} selectedRep={selectedRep} onSelectRep={setSelectedRep} onRestart={restart} />}
    </div>
  );
}

function ResultsScreen({ movement, readings, reps, telemetry, selectedRep, onSelectRep, onRestart }: {
  movement: MovementType;
  readings: AngleReading[];
  reps: RepSummary[];
  telemetry: AssessmentCaptureTelemetry | null;
  selectedRep: number | null;
  onSelectRep: (rep: number | null) => void;
  onRestart: () => void;
}) {
  const definition = getMovementDefinition(movement);
  const exercise = getExerciseDefinition(movement);
  const repDetectionEnabled = exercise.segmentation.strategy === "angle-cycle";
  const primary = readings.filter((item) => item.angleName === definition.primaryMetric);
  const values = primary.map((item) => item.value);
  const confidence = primary.length ? primary.reduce((sum, item) => sum + item.confidence, 0) / primary.length : null;
  const range = values.length ? Math.max(...values) - Math.min(...values) : null;
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const variability = values.length && mean !== null ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) : null;
  const averageRepDuration = reps.length ? reps.reduce((sum, rep) => sum + (rep.endedMs - rep.startedMs), 0) / reps.length : null;
  const selected = reps.find((rep) => rep.repIndex === selectedRep) ?? null;
  const selectedTrajectory = selected ? primary.filter((item) => item.frameTimestamp >= selected.startedMs && item.frameTimestamp <= selected.endedMs) : [];

  return (
    <section className="mx-auto max-w-6xl py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Movement summary</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">{definition.title} · {definition.viewLabel}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">Camera-derived movement measurements from this session. This is not a medical diagnosis or injury prediction.</p></div>
        <button type="button" onClick={onRestart} className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">New assessment</button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric label="Completed repetitions" value={repDetectionEnabled ? String(reps.length) : "Not enabled"} note={repDetectionEnabled ? "Engineering detector enabled for this capture mode" : "Rep detector not yet registered for this movement"} />
        <SummaryMetric label="Measured range" value={range === null ? "—" : `${range.toFixed(1)}°`} note={ANGLE_LABELS[definition.primaryMetric]} />
        <SummaryMetric label="Measurement variability" value={variability === null ? "—" : `${variability.toFixed(1)}°`} note="Standard deviation across captured samples" />
        <SummaryMetric label="Movement confidence" value={confidence === null ? "—" : confidence >= 0.85 ? "High" : confidence >= 0.7 ? "Moderate" : "Low"} note={confidence === null ? "No usable samples" : `Mean landmark-derived confidence ${(confidence * 100).toFixed(0)}%`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-zinc-950">Measurement trajectory</p><p className="mt-1 text-xs text-zinc-500">{selected ? `Rep ${selected.repIndex}` : ANGLE_LABELS[definition.primaryMetric]}</p></div>{selected && <button type="button" onClick={() => onSelectRep(null)} className="text-xs font-semibold text-zinc-600 underline">Show full session</button>}</div>
          <div className="mt-4"><AngleTimeSeriesChart readings={selected ? selectedTrajectory : primary} flags={[]} /></div>
          {selected && <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-zinc-100 pt-4 text-sm"><MetricCell label="Excursion" value={`${selected.excursionDegrees.toFixed(1)}°`} /><MetricCell label="Peak" value={`${selected.peakValue.toFixed(1)}°`} /><MetricCell label="Duration" value={`${((selected.endedMs - selected.startedMs) / 1000).toFixed(2)} s`} /></dl>}
        </div>
        <div className="space-y-4">
          <div className="rounded-[1.75rem] bg-zinc-950 p-5 text-white"><p className="text-sm font-semibold">Capture quality</p><dl className="mt-4 space-y-3 text-sm"><Row label="Resolution" value={telemetry?.width && telemetry.height ? `${telemetry.width}×${telemetry.height}` : "Unavailable"} /><Row label="Camera FPS" value={telemetry?.cameraFps ? telemetry.cameraFps.toFixed(1) : "Unavailable"} /><Row label="Pose FPS" value={telemetry?.inferenceFps ? telemetry.inferenceFps.toFixed(1) : "Unavailable"} /><Row label="Runtime" value={telemetry?.delegate ?? "Unavailable"} /></dl></div>
          {averageRepDuration !== null && <div className="rounded-[1.75rem] bg-sky-50 p-5 text-sm text-sky-950"><p className="font-semibold">Rep timing</p><p className="mt-2 leading-6">Average detected rep duration was {(averageRepDuration / 1000).toFixed(2)} seconds.</p></div>}
        </div>
      </div>

      {reps.length > 0 && <div className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200"><p className="font-semibold text-zinc-950">Repetitions</p><p className="mt-1 text-sm text-zinc-600">Select a repetition to inspect its trajectory and measured excursion.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{reps.map((rep) => <button key={rep.repIndex} type="button" onClick={() => onSelectRep(rep.repIndex)} className={`rounded-2xl p-4 text-left ring-1 ${selectedRep === rep.repIndex ? "bg-sky-50 ring-sky-300" : "bg-zinc-50 ring-zinc-200"}`}><p className="font-semibold text-zinc-950">Rep {rep.repIndex}</p><p className="mt-2 text-sm text-zinc-600">Excursion {rep.excursionDegrees.toFixed(1)}°</p><p className="text-sm text-zinc-600">Duration {((rep.endedMs - rep.startedMs) / 1000).toFixed(2)} s</p></button>)}</div></div>}
    </section>
  );
}

function ActionPanel({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-zinc-950">{title}</p><p className="mt-1 text-sm text-zinc-600">{text}</p></div>{children}</div>;
}
function SummaryMetric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-3 text-2xl font-semibold text-zinc-950">{value}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{note}</p></div>; }
function MetricCell({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><dt className="text-white/55">{label}</dt><dd className="font-medium">{value}</dd></div>; }
function AssessmentProgress({ step }: { step: Step }) {
  const labels = ["Movement", "Camera", "Calibration", "Exercise", "Results"];
  return <nav aria-label="Assessment progress" className="overflow-x-auto"><ol className="flex min-w-[620px] items-center gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-zinc-200">{labels.map((label, index) => { const value = (index + 1) as Step; const active = value === step; const complete = value < step; return <li key={label} className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${active ? "bg-zinc-950 text-white" : complete ? "bg-emerald-50 text-emerald-800" : "text-zinc-500"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${active ? "bg-white/15" : complete ? "bg-emerald-100" : "bg-zinc-100"}`}>{complete ? "✓" : value}</span><span>{label}</span></li>; })}</ol></nav>;
}
