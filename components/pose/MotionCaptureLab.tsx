"use client";

import { useMemo, useRef, useState } from "react";
import {
  AssessmentCapture,
  type AssessmentCaptureTelemetry,
} from "@/components/assessment/AssessmentCapture";
import {
  buildPoseStreamFrame,
  type PoseLandmarkName,
  type PoseStreamFrame,
} from "@/lib/pose/stream";
import type { MovementType, PoseFrame } from "@/lib/pose/types";

const CAPTURE_MODES: Array<{
  value: MovementType;
  label: string;
  description: string;
}> = [
  {
    value: "general-front",
    label: "Frontal plane",
    description: "Face the camera for bilateral alignment and frontal-plane capture.",
  },
  {
    value: "general-side",
    label: "Sagittal plane",
    description: "Turn side-on for flexion/extension-oriented capture.",
  },
];

const ANCHOR_LANDMARKS: PoseLandmarkName[] = [
  "left_shoulder",
  "right_shoulder",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

export function MotionCaptureLab() {
  const [movement, setMovement] = useState<MovementType>("general-front");
  const [telemetry, setTelemetry] = useState<AssessmentCaptureTelemetry | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [latestFrame, setLatestFrame] = useState<PoseStreamFrame | null>(null);
  const [framesReceived, setFramesReceived] = useState(0);
  const [posesDetected, setPosesDetected] = useState(0);
  const sequenceRef = useRef(0);
  const telemetryRef = useRef<AssessmentCaptureTelemetry | null>(null);

  function handleTelemetry(next: AssessmentCaptureTelemetry | null) {
    telemetryRef.current = next;
    setTelemetry(next);
  }

  function handleFrame(frame: PoseFrame | null) {
    const activeTelemetry = telemetryRef.current;
    sequenceRef.current += 1;

    const streamFrame = buildPoseStreamFrame(frame, {
      sequence: sequenceRef.current,
      callbackTimestampMs: performance.now(),
      capturedAtEpochMs: Date.now(),
      width: activeTelemetry?.width,
      height: activeTelemetry?.height,
      facingMode: activeTelemetry?.facingMode,
      delegate: activeTelemetry?.delegate,
      cameraFps: activeTelemetry?.cameraFps,
      inferenceFps: activeTelemetry?.processingFps,
      averageInferenceLatencyMs: activeTelemetry?.averageInferenceLatencyMs,
    });

    setLatestFrame(streamFrame);
    setFramesReceived((current) => current + 1);
    if (streamFrame.pose.detected) {
      setPosesDetected((current) => current + 1);
    }
  }

  function resetStreamCounters() {
    sequenceRef.current = 0;
    setLatestFrame(null);
    setFramesReceived(0);
    setPosesDetected(0);
  }

  const detectionRate = framesReceived > 0 ? posesDetected / framesReceived : null;
  const mode = CAPTURE_MODES.find((item) => item.value === movement) ?? CAPTURE_MODES[0];
  const anchors = useMemo(() => {
    if (!latestFrame) return [];
    const byName = new Map(latestFrame.pose.landmarks.map((point) => [point.name, point]));
    return ANCHOR_LANDMARKS.map((name) => byName.get(name)).filter(
      (point): point is NonNullable<typeof point> => Boolean(point),
    );
  }, [latestFrame]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden border border-zinc-300 bg-white shadow-[0_24px_80px_rgba(24,24,27,0.08)]">
        <div className="border-b border-zinc-200 bg-[#111413] px-5 py-4 text-white sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
                Stage 1 · Local pose capture
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Motion capture instrument</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
              <StatusPill label="Video" value="Browser local" />
              <StatusPill label="Pose" value="MediaPipe 33-point" />
              <StatusPill
                label="State"
                value={captureReady ? "Framing usable" : telemetry ? "Adjust framing" : "Camera idle"}
                active={captureReady}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-200 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="bg-[#f6f7f5] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Capture plane</p>
            <div className="mt-3 space-y-2">
              {CAPTURE_MODES.map((item) => {
                const selected = movement === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setMovement(item.value);
                      resetStreamCounters();
                    }}
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
                This workspace captures pose landmarks and capture quality only. It does not calculate joint angles, count repetitions, or classify injury risk.
              </p>
            </div>
          </aside>

          <div className="bg-white p-3 sm:p-5">
            <AssessmentCapture
              movement={movement}
              onFrame={handleFrame}
              onReadyChange={setCaptureReady}
              onTelemetryChange={handleTelemetry}
              overlay={
                <div className="border border-white/20 bg-black/65 px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm">
                  <div className="font-semibold text-white">Raw landmark stream</div>
                  <div className="mt-1">No angle interpretation</div>
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
          detail="Frames submitted to pose inference in this browser session."
        />
        <MetricCard
          label="Pose detection"
          value={detectionRate === null ? "—" : `${Math.round(detectionRate * 100)}%`}
          detail="Descriptive capture quality only; not a clinical confidence score."
        />
        <MetricCard
          label="Pose throughput"
          value={telemetry?.processingFps ? `${telemetry.processingFps.toFixed(1)} fps` : "—"}
          detail={telemetry?.averageInferenceLatencyMs !== undefined ? `${telemetry.averageInferenceLatencyMs.toFixed(1)} ms mean inference latency` : "Waiting for capture telemetry."}
        />
        <MetricCard
          label="Capture profile"
          value={telemetry?.width && telemetry?.height ? `${telemetry.width}×${telemetry.height}` : "—"}
          detail={`${telemetry?.delegate ?? "—"} runtime${telemetry?.cameraFps ? ` · ${telemetry.cameraFps.toFixed(1)} camera fps` : ""}`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div className="border border-zinc-300 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Per-frame data</p>
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
                      Enable the camera and place your full body in frame to populate the landmark stream.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="border border-zinc-300 bg-[#111413] p-5 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Frame contract · v1.0</p>
          <h3 className="mt-2 text-lg font-semibold">Clean stream for later analysis</h3>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Every analyzed frame receives a sequence number, monotonic timestamp, wall-clock timestamp, image dimensions, pose status, named landmarks, trust state, and runtime telemetry.
          </p>

          <dl className="mt-5 divide-y divide-white/10 border-y border-white/10 text-xs">
            <StreamRow label="Sequence" value={latestFrame ? `#${latestFrame.sequence}` : "—"} />
            <StreamRow label="Captured at" value={latestFrame ? compactIso(latestFrame.capturedAtIso) : "—"} />
            <StreamRow label="Timestamp" value={latestFrame ? `${latestFrame.timestampMs.toFixed(1)} ms` : "—"} />
            <StreamRow label="Clock source" value={latestFrame?.timestampSource ?? "—"} />
            <StreamRow label="Pose detected" value={latestFrame ? (latestFrame.pose.detected ? "yes" : "no") : "—"} />
            <StreamRow label="Mean visibility" value={latestFrame?.pose.meanVisibility === null || latestFrame?.pose.meanVisibility === undefined ? "—" : latestFrame.pose.meanVisibility.toFixed(3)} />
          </dl>

          <div className="mt-5 border border-white/10 bg-white/[0.04] p-4 text-xs leading-5 text-white/55">
            <p className="font-semibold text-white/85">Scientific note</p>
            <p className="mt-1">
              MediaPipe x/y coordinates are normalized image coordinates. The reported z value is model-relative depth, not a calibrated metric 3D laboratory coordinate. Stage 2 should not treat z as centimeters or millimeters without separate validation.
            </p>
          </div>
        </aside>
      </section>

      <section className="border border-zinc-300 bg-[#eef4f0] p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-900/70">Privacy & scope</p>
          <div className="grid gap-4 text-sm leading-6 text-zinc-700 md:grid-cols-2">
            <p>
              Webcam pixels are consumed by the browser-side MediaPipe pose model and are not uploaded or stored by this Stage 1 workspace. Only the in-memory landmark stream is rendered here.
            </p>
            <p>
              The MediaPipe package/model and WASM assets may be downloaded from configured remote hosts, and MediaPipe Tasks documents performance/utilization telemetry. That is different from sending the patient&apos;s video to this application server.
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

function compactIso(value: string) {
  return value.replace("T", " ").replace("Z", " UTC");
}
