"use client";

import { useMemo, useRef, useState } from "react";
import {
  StageOneCapture,
  type StageOneCaptureTelemetry,
} from "@/components/pose/StageOneCapture";
import { StageTwoAnalysisPanel } from "@/components/pose/StageTwoAnalysisPanel";
import {
  StageTwoMovementAnalyzer,
  type StageTwoAnalysisSnapshot,
} from "@/lib/biomechanics/stage-two-analysis";
import type {
  PoseLandmarkName,
  PoseStreamFrame,
  PoseStreamLandmark,
} from "@/lib/pose/stream";
import type { MovementType } from "@/lib/pose/types";

const CAPTURE_MODES: Array<{
  value: MovementType;
  label: string;
  description: string;
}> = [
  {
    value: "squat-side",
    label: "Squat · side",
    description: "Knee-flexion projection, trunk lean, reps, excursion, and tempo.",
  },
  {
    value: "squat-front",
    label: "Squat · front",
    description: "Frontal knee-line deviation, pelvic-line tilt, and trunk alignment proxies.",
  },
  {
    value: "push-up-side",
    label: "Push-up · side",
    description: "Elbow-flexion projection, trunk alignment, reps, excursion, and tempo.",
  },
  {
    value: "shoulder-flexion-side",
    label: "Shoulder flexion · side",
    description: "Shoulder-elevation projection, excursion, trunk lean, reps, and tempo.",
  },
  {
    value: "general-side",
    label: "General · side",
    description: "Explore supported sagittal-plane measurements without exercise-specific rep logic.",
  },
  {
    value: "general-front",
    label: "General · front",
    description: "Explore supported frontal-plane measurements without exercise-specific rep logic.",
  },
];

const ANCHOR_LANDMARKS: PoseLandmarkName[] = [
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

export function MotionCaptureLab() {
  const [movement, setMovement] = useState<MovementType>("squat-side");
  const analyzer = useMemo(() => new StageTwoMovementAnalyzer(movement), [movement]);
  const [analysis, setAnalysis] = useState<StageTwoAnalysisSnapshot | null>(null);
  const [telemetry, setTelemetry] = useState<StageOneCaptureTelemetry | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [latestFrame, setLatestFrame] = useState<PoseStreamFrame | null>(null);
  const [framesReceived, setFramesReceived] = useState(0);
  const [posesDetected, setPosesDetected] = useState(0);
  const [worldFramesReceived, setWorldFramesReceived] = useState(0);
  const sessionKeyRef = useRef(0);
  const lastAnalysisUiUpdateRef = useRef(-Infinity);

  function handleStreamFrame(frame: PoseStreamFrame) {
    setLatestFrame(frame);
    setFramesReceived((current) => current + 1);
    if (frame.pose.detected) setPosesDetected((current) => current + 1);
    if (frame.pose.worldLandmarks.length === 33) {
      setWorldFramesReceived((current) => current + 1);
    }

    const nextAnalysis = analyzer.ingest(frame);
    const completedRep = nextAnalysis.latestCompletedRep !== null;
    if (
      completedRep ||
      frame.timestampMs - lastAnalysisUiUpdateRef.current >= 100
    ) {
      lastAnalysisUiUpdateRef.current = frame.timestampMs;
      setAnalysis(nextAnalysis);
    }
  }

  function selectMovement(nextMovement: MovementType) {
    if (nextMovement === movement) return;
    sessionKeyRef.current += 1;
    lastAnalysisUiUpdateRef.current = -Infinity;
    setMovement(nextMovement);
    setAnalysis(null);
    setLatestFrame(null);
    setFramesReceived(0);
    setPosesDetected(0);
    setWorldFramesReceived(0);
    setTelemetry(null);
    setCaptureReady(false);
  }

  const detectionRate = framesReceived > 0 ? posesDetected / framesReceived : null;
  const worldRate = framesReceived > 0 ? worldFramesReceived / framesReceived : null;
  const mode = CAPTURE_MODES.find((item) => item.value === movement) ?? CAPTURE_MODES[0];
  const anchors = useMemo(() => {
    if (!latestFrame) return [];
    const byName = new Map(latestFrame.pose.landmarks.map((point) => [point.name, point]));
    return ANCHOR_LANDMARKS.map((name) => byName.get(name)).filter(
      (point): point is PoseStreamLandmark => point !== undefined,
    );
  }, [latestFrame]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden border border-zinc-300 bg-white shadow-[0_24px_80px_rgba(24,24,27,0.08)]">
        <div className="border-b border-zinc-200 bg-[#111413] px-5 py-4 text-white sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
                Stages 1–2 · Capture + movement measurement
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Movement science lab</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
              <StatusPill label="Video" value="Browser local" />
              <StatusPill label="Pose" value="MediaPipe 33-point" />
              <StatusPill label="Analysis" value="2D projection" />
              <StatusPill
                label="State"
                value={captureReady ? "Framing usable" : telemetry ? "Adjust framing" : "Camera idle"}
                active={captureReady}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-200 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="bg-[#f6f7f5] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Analysis profile</p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">{mode.description}</p>
            <div className="mt-3 space-y-2">
              {CAPTURE_MODES.map((item) => {
                const selected = movement === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => selectMovement(item.value)}
                    className={`w-full border px-3 py-3 text-left transition ${
                      selected
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={`mt-1 block text-xs leading-5 ${selected ? "text-white/65" : "text-zinc-500"}`}>
                      {item.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 border-t border-zinc-300 pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Stage boundary</p>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                Stage 2 calculates movement measurements, rep cycles, and timing only. Risk thresholds, diagnoses, and program changes remain disabled until Stage 3 and later review.
              </p>
            </div>
          </aside>

          <div className="bg-white p-3 sm:p-5">
            <StageOneCapture
              key={`${movement}-${sessionKeyRef.current}`}
              movement={movement}
              onStreamFrame={handleStreamFrame}
              onReadyChange={setCaptureReady}
              onTelemetryChange={setTelemetry}
              overlay={
                <div className="border border-white/20 bg-black/65 px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm">
                  <div className="font-semibold text-white">Stage 2 live measurement</div>
                  <div className="mt-1">
                    {analysis?.selectedSignalAngle
                      ? `${humanizeCamel(analysis.selectedSignalAngle)} · ${analysis.consistency.repCount} reps`
                      : "Acquiring stable movement signal"}
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </section>

      <section className="grid gap-px bg-zinc-300 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Analyzed frames"
          value={framesReceived.toLocaleString()}
          detail="Source frames submitted to browser-side pose inference."
        />
        <MetricCard
          label="Pose detection"
          value={detectionRate === null ? "—" : `${Math.round(detectionRate * 100)}%`}
          detail="Capture-quality statistic only; not a clinical confidence score."
        />
        <MetricCard
          label="Pose throughput"
          value={telemetry?.inferenceFps ? `${telemetry.inferenceFps.toFixed(1)} fps` : "—"}
          detail={telemetry?.averageInferenceLatencyMs !== undefined ? `${telemetry.averageInferenceLatencyMs.toFixed(1)} ms mean inference latency` : "Waiting for capture telemetry."}
        />
        <MetricCard
          label="World landmarks"
          value={worldRate === null ? "—" : `${Math.round(worldRate * 100)}%`}
          detail="MediaPipe model-relative 3D output availability; Stage 2 angle math uses 2D image projections."
        />
      </section>

      <StageTwoAnalysisPanel analysis={analysis} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div className="border border-zinc-300 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Stage 1 source data</p>
              <h3 className="mt-1 text-base font-semibold text-zinc-950">Named anatomical anchors</h3>
            </div>
            <span className="text-xs text-zinc-500">
              {latestFrame?.pose.detected ? `${latestFrame.pose.trustedLandmarkCount}/33 trusted` : "No pose in latest frame"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Landmark</th>
                  <th className="px-4 py-3 font-semibold">x</th>
                  <th className="px-4 py-3 font-semibold">y</th>
                  <th className="px-4 py-3 font-semibold">z</th>
                  <th className="px-4 py-3 font-semibold">Visibility</th>
                  <th className="px-4 py-3 font-semibold">Trust gate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {anchors.length ? (
                  anchors.map((point) => (
                    <tr key={point.name}>
                      <td className="px-5 py-3 font-medium text-zinc-950">{humanizeLandmark(point.name)}</td>
                      <td className="px-4 py-3 tabular-nums">{point.x.toFixed(4)}</td>
                      <td className="px-4 py-3 tabular-nums">{point.y.toFixed(4)}</td>
                      <td className="px-4 py-3 tabular-nums">{point.z.toFixed(4)}</td>
                      <td className="px-4 py-3 tabular-nums">{point.visibility.toFixed(3)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          point.trusted
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}>
                          {point.trusted ? "Trusted" : "Low visibility"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-zinc-500">
                      Enable the camera and place the required joints in frame to populate the landmark stream.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="border border-zinc-300 bg-[#111413] p-5 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Frame contract · v1.1</p>
          <h3 className="mt-2 text-lg font-semibold">Traceable source measurements</h3>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Stage 2 derives its measurements from the same timestamped Stage 1 frame stream, preserving source-media time, visibility, and processing metadata for later review.
          </p>

          <dl className="mt-5 divide-y divide-white/10 border-y border-white/10 text-xs">
            <StreamRow label="Sequence" value={latestFrame ? `#${latestFrame.sequence}` : "—"} />
            <StreamRow label="Captured at" value={latestFrame ? compactIso(latestFrame.capturedAtIso) : "—"} />
            <StreamRow label="Pose timestamp" value={latestFrame ? `${latestFrame.timestampMs.toFixed(1)} ms` : "—"} />
            <StreamRow label="Media time" value={latestFrame?.mediaTimeMs === null || latestFrame?.mediaTimeMs === undefined ? "—" : `${latestFrame.mediaTimeMs.toFixed(1)} ms`} />
            <StreamRow label="Frame clock" value={latestFrame?.frameClock ?? "—"} />
            <StreamRow label="Pose detected" value={latestFrame ? (latestFrame.pose.detected ? "yes" : "no") : "—"} />
            <StreamRow label="Mean visibility" value={latestFrame?.pose.meanVisibility === null || latestFrame?.pose.meanVisibility === undefined ? "—" : latestFrame.pose.meanVisibility.toFixed(3)} />
            <StreamRow label="World points" value={latestFrame ? String(latestFrame.pose.worldLandmarks.length) : "—"} />
          </dl>

          <div className="mt-5 border border-white/10 bg-white/[0.04] p-4 text-xs leading-5 text-white/55">
            <p className="font-semibold text-white/85">Measurement note</p>
            <p className="mt-1">
              Stage 2 currently computes angles from normalized 2D image coordinates. MediaPipe world landmarks remain available for research, but they are not treated as calibrated laboratory 3D coordinates.
            </p>
          </div>
        </aside>
      </section>

      <section className="border border-zinc-300 bg-[#eef4f0] p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-900/70">Privacy & scope</p>
          <div className="grid gap-4 text-sm leading-6 text-zinc-700 md:grid-cols-2">
            <p>
              Webcam pixels and Stage 2 calculations stay in this browser in the current workspace. The UI holds movement measurements in memory only; Stage 4 persistence has not been enabled here.
            </p>
            <p>
              MediaPipe package/model and WASM assets may be downloaded from configured remote hosts. Joint-angle projections, rep segmentation, and tempo metrics are measurement features, not diagnoses or future-injury predictions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <span className={`border px-2.5 py-1.5 ${active ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200" : "border-white/15 bg-white/[0.04] text-white/70"}`}>
      <span className="text-white/40">{label}</span> · {value}
    </span>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-h-[150px] bg-white p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">{value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}

function StreamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-3">
      <dt className="text-white/40">{label}</dt>
      <dd className="break-words text-right font-medium text-white/80 tabular-nums">{value}</dd>
    </div>
  );
}

function humanizeLandmark(name: string) {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeCamel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function compactIso(value: string) {
  return value.replace("T", " ").replace("Z", " UTC");
}
