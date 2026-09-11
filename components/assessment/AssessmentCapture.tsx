"use client";

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CapturePerformanceMonitor, type CaptureQualityIssue } from "@/lib/pose/capture-quality";
import {
  CAMERA_PROFILE_STORAGE_KEY,
  DEFAULT_CAMERA_PREFERENCE,
  buildCameraConstraints,
  parseCameraPreference,
  type CameraPreference,
  type CameraTargetResolution,
  withoutExactDevice,
} from "@/lib/pose/camera-preferences";
import { evaluateCameraGuidance, KEYPOINT_VISIBILITY_THRESHOLD, MOVEMENT_GUIDANCE } from "@/lib/pose/camera-guidance";
import { getPrimaryMeasurementMarker, type MeasurementMarker } from "@/lib/pose/measurement-marker";
import { toPoseFrame, type MovementType, type PoseFrame } from "@/lib/pose/types";

const WASM_ROOT = process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_URL?.trim() || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL = process.env.NEXT_PUBLIC_MEDIAPIPE_MODEL_URL?.trim() || "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const REQUESTED_FPS = 30;
const TELEMETRY_UI_INTERVAL_MS = 500;
const POSE_UI_INTERVAL_MS = 100;

export type AssessmentCaptureTelemetry = {
  width?: number;
  height?: number;
  requestedFps: number;
  cameraFps?: number;
  inferenceFps?: number;
  processingFps?: number;
  averageInferenceLatencyMs?: number;
  estimatedDroppedProcessingFrames?: number;
  meanPoseConfidence?: number | null;
  confidenceStdDev?: number | null;
  facingMode?: string;
  deviceLabel?: string;
  delegate?: "GPU" | "CPU";
  qualityIssues?: CaptureQualityIssue[];
  recommendLowerProcessingResolution?: boolean;
};

type Props = {
  movement: MovementType;
  onFrame: (frame: PoseFrame | null) => void;
  onReadyChange: (ready: boolean) => void;
  onTelemetryChange?: (telemetry: AssessmentCaptureTelemetry | null) => void;
  overlay?: ReactNode;
};

export function AssessmentCapture({ movement, onFrame, onReadyChange, onTelemetryChange, overlay }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastTelemetryUiUpdateRef = useRef(0);
  const lastPoseUiUpdateRef = useRef(0);
  const monitorRef = useRef(new CapturePerformanceMonitor());
  const onFrameRef = useRef(onFrame);
  const onReadyRef = useRef(onReadyChange);
  const onTelemetryRef = useRef(onTelemetryChange);

  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | null>(null);
  const [preference, setPreference] = useState<CameraPreference>(DEFAULT_CAMERA_PREFERENCE);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [telemetry, setTelemetry] = useState<AssessmentCaptureTelemetry | null>(null);

  const { deviceId, facingMode, targetResolution } = preference;

  useEffect(() => {
    onFrameRef.current = onFrame;
    onReadyRef.current = onReadyChange;
    onTelemetryRef.current = onTelemetryChange;
  }, [onFrame, onReadyChange, onTelemetryChange]);

  useEffect(() => {
    setPreference(parseCameraPreference(window.localStorage.getItem(CAMERA_PROFILE_STORAGE_KEY)));
  }, []);

  const guidance = useMemo(() => evaluateCameraGuidance(frame, movement), [frame, movement]);
  const marker = useMemo(() => getPrimaryMeasurementMarker(frame, movement), [frame, movement]);
  const captureReady = captureEnabled && status === "ready" && guidance.ready;
  const mirror = telemetry?.facingMode !== "environment";

  useEffect(() => {
    onReadyRef.current(captureReady);
  }, [captureReady]);

  useEffect(() => {
    onTelemetryRef.current?.(telemetry);
  }, [telemetry]);

  useEffect(() => {
    const performanceMonitor = monitorRef.current;
    if (!captureEnabled) {
      setStatus("idle");
      setFrame(null);
      setTelemetry(null);
      setError(null);
      performanceMonitor.reset();
      onFrameRef.current(null);
      onReadyRef.current(false);
      return;
    }

    let cancelled = false;
    const videoElement = videoRef.current;
    const activePreference: CameraPreference = {
      facingMode,
      targetResolution,
      ...(deviceId ? { deviceId } : {}),
    };

    async function refreshDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const next = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "videoinput");
      if (!cancelled) setDevices(next);
    }

    function handleTrackEnded() {
      if (cancelled) return;
      setError("The selected camera disconnected or stopped providing video. Reconnect it or choose another camera.");
      setStatus("error");
      setFrame(null);
      onFrameRef.current(null);
      onReadyRef.current(false);
    }

    async function start() {
      try {
        setStatus("loading");
        setError(null);
        setTelemetry(null);
        performanceMonitor.reset();
        lastVideoTimeRef.current = -1;
        lastTelemetryUiUpdateRef.current = 0;
        lastPoseUiUpdateRef.current = 0;

        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is not supported in this browser.");

        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        if (cancelled) return;

        let landmarker: PoseLandmarker;
        let activeDelegate: "GPU" | "CPU" = "GPU";
        try {
          landmarker = await createLandmarker(vision, "GPU");
        } catch {
          activeDelegate = "CPU";
          landmarker = await createLandmarker(vision, "CPU");
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        setDelegate(activeDelegate);
        landmarkerRef.current = landmarker;

        let stream: MediaStream;
        let effectivePreference = activePreference;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: buildCameraConstraints(activePreference) });
        } catch (caught) {
          const recoverable = Boolean(activePreference.deviceId) && caught instanceof DOMException && (caught.name === "NotFoundError" || caught.name === "OverconstrainedError");
          if (!recoverable) throw caught;
          effectivePreference = withoutExactDevice(activePreference);
          setPreference(effectivePreference);
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: buildCameraConstraints(effectivePreference) });
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        track?.addEventListener("ended", handleTrackEnded);
        await refreshDevices();
        const settings = track?.getSettings?.() ?? {};
        const selectedDevice = (await navigator.mediaDevices.enumerateDevices()).find((item) => item.kind === "videoinput" && item.deviceId === settings.deviceId);
        const baseTelemetry: AssessmentCaptureTelemetry = {
          width: settings.width,
          height: settings.height,
          requestedFps: REQUESTED_FPS,
          cameraFps: settings.frameRate,
          facingMode: settings.facingMode,
          deviceLabel: selectedDevice?.label || "Camera",
          delegate: activeDelegate,
        };
        setTelemetry(baseTelemetry);
        window.localStorage.setItem(CAMERA_PROFILE_STORAGE_KEY, JSON.stringify({
          ...effectivePreference,
          ...(settings.deviceId ? { deviceId: settings.deviceId } : {}),
        }));
        setStatus("ready");

        navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices);
        const context = canvasRef.current?.getContext("2d") ?? null;
        const drawingUtils = context ? new DrawingUtils(context) : null;

        const processFrame = () => {
          if (cancelled) return;
          const activeVideo = videoRef.current;
          const canvas = canvasRef.current;
          const activeLandmarker = landmarkerRef.current;
          if (activeVideo && canvas && activeLandmarker && activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && activeVideo.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = activeVideo.currentTime;
            if (canvas.width !== activeVideo.videoWidth || canvas.height !== activeVideo.videoHeight) {
              canvas.width = activeVideo.videoWidth;
              canvas.height = activeVideo.videoHeight;
            }

            const timestamp = performance.now();
            const inferenceStarted = performance.now();
            const result = activeLandmarker.detectForVideo(activeVideo, timestamp);
            const inferenceLatencyMs = performance.now() - inferenceStarted;
            drawResult(result, drawingUtils, canvas);
            const landmarks = result.landmarks[0];
            const nextFrame = landmarks?.length === 33 ? toPoseFrame(landmarks, timestamp, KEYPOINT_VISIBILITY_THRESHOLD) : null;

            // Keep measurement/rep processing at inference rate while limiting React-only
            // visual state updates to ~10 Hz for smoother long-running sessions.
            onFrameRef.current(nextFrame);
            if (timestamp - lastPoseUiUpdateRef.current >= POSE_UI_INTERVAL_MS) {
              lastPoseUiUpdateRef.current = timestamp;
              setFrame(nextFrame);
            }

            const poseConfidence = nextFrame
              ? nextFrame.keypoints.reduce((sum, point) => sum + point.visibility, 0) / nextFrame.keypoints.length
              : null;
            const snapshot = performanceMonitor.add(
              { timestampMs: timestamp, inferenceLatencyMs, poseConfidence },
              settings.frameRate,
              effectivePreference.targetResolution,
            );

            if (timestamp - lastTelemetryUiUpdateRef.current >= TELEMETRY_UI_INTERVAL_MS) {
              lastTelemetryUiUpdateRef.current = timestamp;
              setTelemetry({
                ...baseTelemetry,
                inferenceFps: snapshot.processingFps,
                processingFps: snapshot.processingFps,
                averageInferenceLatencyMs: snapshot.averageInferenceLatencyMs,
                estimatedDroppedProcessingFrames: snapshot.estimatedDroppedProcessingFrames,
                meanPoseConfidence: snapshot.meanPoseConfidence,
                confidenceStdDev: snapshot.confidenceStdDev,
                qualityIssues: snapshot.qualityIssues,
                recommendLowerProcessingResolution: snapshot.recommendLowerProcessingResolution,
              });
            }
          }
          animationRef.current = requestAnimationFrame(processFrame);
        };
        animationRef.current = requestAnimationFrame(processFrame);
      } catch (caught) {
        setStatus("error");
        setError(cameraErrorMessage(caught));
        setFrame(null);
        setTelemetry(null);
        onFrameRef.current(null);
        onReadyRef.current(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoElement) videoElement.srcObject = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      performanceMonitor.reset();
    };
  }, [captureEnabled, deviceId, facingMode, targetResolution]);

  function updatePreference(next: CameraPreference) {
    window.localStorage.setItem(CAMERA_PROFILE_STORAGE_KEY, JSON.stringify(next));
    setPreference(next);
  }

  async function enterFullScreen() {
    const element = previewRef.current;
    if (!element || !element.requestFullscreen) return;
    try {
      await element.requestFullscreen();
    } catch {
      // Browser may decline fullscreen (notably some mobile WebKit contexts).
    }
  }

  const config = MOVEMENT_GUIDANCE[movement];
  const qualityIssues = telemetry?.qualityIssues ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-hidden rounded-[2rem] bg-zinc-950 shadow-2xl shadow-zinc-950/10">
        <div ref={previewRef} className="relative aspect-video min-h-[260px] w-full bg-zinc-950 sm:min-h-0">
          <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-contain sm:object-cover ${mirror ? "scale-x-[-1]" : ""}`} />
          <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full object-contain sm:object-cover ${mirror ? "scale-x-[-1]" : ""}`} />
          {captureEnabled && <GuideOverlay view={config.view} ready={captureReady} />}
          {captureEnabled && marker && <MeasurementMarkerOverlay marker={marker} mirror={mirror} />}
          <div className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            {status === "idle" && "Camera off"}
            {status === "loading" && "Starting camera…"}
            {status === "ready" && (frame ? `${frame.trustedKeypointCount}/33 landmarks trusted` : "Finding pose…")}
            {status === "error" && "Camera unavailable"}
          </div>
          {captureEnabled && typeof document !== "undefined" && document.fullscreenEnabled && (
            <button type="button" onClick={() => void enterFullScreen()} className="absolute bottom-4 left-4 rounded-lg bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur">Full screen</button>
          )}
          {overlay && <div className="pointer-events-none absolute right-4 top-4">{overlay}</div>}
          {!captureEnabled && <div className="absolute inset-0 flex items-center justify-center p-6"><div className="max-w-sm rounded-2xl bg-black/75 p-5 text-center text-white backdrop-blur"><p className="font-semibold">Camera analysis is off</p><p className="mt-2 text-sm leading-6 text-white/70">Video stays in this browser. Enable the camera when you are ready to position yourself.</p></div></div>}
        </div>
      </div>

      <aside className="space-y-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200/70">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Camera setup</p><h2 className="mt-1 text-lg font-semibold text-zinc-950">{config.label}</h2><p className="mt-2 text-sm leading-6 text-zinc-600">{config.instruction}</p></div>

        {!captureEnabled ? (
          <div className="space-y-3">
            <label className="flex gap-2 text-xs leading-5 text-zinc-600"><input type="checkbox" checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} className="mt-1" /><span>I understand camera frames are processed locally for pose estimation and are not uploaded or stored by this assessment.</span></label>
            <button type="button" disabled={!privacyAcknowledged} onClick={() => setCaptureEnabled(true)} className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300">Enable camera</button>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-zinc-800">Camera<select aria-label="Camera device" value={deviceId ?? ""} onChange={(event) => updatePreference({ ...preference, deviceId: event.target.value || undefined })} className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"><option value="">Automatic camera</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Mobile orientation</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updatePreference({ ...preference, deviceId: undefined, facingMode: "user" })} className={`rounded-xl px-3 py-2 text-sm font-medium ${facingMode === "user" && !deviceId ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}>Front camera</button>
                <button type="button" onClick={() => updatePreference({ ...preference, deviceId: undefined, facingMode: "environment" })} className={`rounded-xl px-3 py-2 text-sm font-medium ${facingMode === "environment" && !deviceId ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}>Rear camera</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">{(["720p", "1080p"] as CameraTargetResolution[]).map((resolution) => <button key={resolution} type="button" onClick={() => updatePreference({ ...preference, targetResolution: resolution })} className={`rounded-xl px-3 py-2 text-sm font-medium ${targetResolution === resolution ? "bg-sky-700 text-white" : "bg-zinc-100 text-zinc-700"}`}>{resolution}</button>)}</div>

            {telemetry && <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-zinc-50 p-4 text-xs">
              <TelemetryCell label="Resolution" value={telemetry.width && telemetry.height ? `${telemetry.width}×${telemetry.height}` : "—"} />
              <TelemetryCell label="Requested FPS" value={String(telemetry.requestedFps)} />
              <TelemetryCell label="Actual FPS" value={telemetry.cameraFps?.toFixed(1) ?? "—"} />
              <TelemetryCell label="Pose FPS" value={telemetry.processingFps?.toFixed(1) ?? "—"} />
              <TelemetryCell label="Inference latency" value={telemetry.averageInferenceLatencyMs !== undefined ? `${telemetry.averageInferenceLatencyMs.toFixed(1)} ms` : "—"} />
              <TelemetryCell label="Processing drops*" value={String(telemetry.estimatedDroppedProcessingFrames ?? 0)} />
              <TelemetryCell label="Confidence stability" value={telemetry.confidenceStdDev === null || telemetry.confidenceStdDev === undefined ? "—" : telemetry.confidenceStdDev < 0.06 ? "Stable" : telemetry.confidenceStdDev < 0.12 ? "Moderate" : "Unstable"} />
              <TelemetryCell label="Runtime" value={delegate ?? "—"} />
            </dl>}
            <p className="text-[11px] leading-4 text-zinc-500">*Processing drops estimate camera frames not analyzed by pose inference. They are not hardware frame-drop measurements.</p>
          </>
        )}

        {telemetry?.recommendLowerProcessingResolution && targetResolution === "1080p" && <div className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-950"><p className="font-semibold">Performance mode recommended</p><p className="mt-1 text-xs leading-5">1080p is reducing real-time pose throughput on this device. Video measurement may be more stable at 720p.</p><button type="button" onClick={() => updatePreference({ ...preference, targetResolution: "720p" })} className="mt-3 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white">Switch to 720p</button></div>}

        {captureEnabled && <div className={`rounded-2xl p-4 text-sm ${captureReady && qualityIssues.length === 0 ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}><p className="font-semibold">{captureReady && qualityIssues.length === 0 ? "Capture quality looks usable" : "Capture quality needs attention"}</p><ul className="mt-2 space-y-1 text-xs leading-5">{guidance.messages.map((message) => <li key={message}>• {message}</li>)}{qualityIssues.map((issue) => <li key={issue.code}>• {issue.message}</li>)}</ul><p className="mt-2 text-[11px] opacity-70">These are engineering capture-quality checks, not clinical findings.</p></div>}

        {error && <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      </aside>
    </div>
  );
}

async function createLandmarker(vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, delegate: "GPU" | "CPU") {
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
}

function cameraErrorMessage(caught: unknown) {
  if (caught instanceof DOMException) {
    if (caught.name === "NotAllowedError" || caught.name === "SecurityError") return "Camera permission was denied. Allow camera access in your browser settings, then try again.";
    if (caught.name === "NotFoundError") return "No usable camera was detected. Connect a camera and try again.";
    if (caught.name === "NotReadableError") return "The camera is busy or unavailable. Close other apps using it, then try again.";
    if (caught.name === "OverconstrainedError") return "This camera cannot provide the requested capture mode. Choose another camera or resolution.";
  }
  return caught instanceof Error ? caught.message : "Unable to start camera analysis.";
}

function drawResult(result: PoseLandmarkerResult, drawingUtils: DrawingUtils | null, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const landmarks = result.landmarks[0];
  if (!landmarks || !drawingUtils) return;
  drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { lineWidth: 3 });

  context.save();
  for (const landmark of landmarks) {
    const confidence = typeof landmark.visibility === "number" ? Math.max(0, Math.min(1, landmark.visibility)) : 1;
    context.globalAlpha = 0.18 + confidence * 0.82;
    context.beginPath();
    context.arc(landmark.x * canvas.width, landmark.y * canvas.height, confidence >= KEYPOINT_VISIBILITY_THRESHOLD ? 4 : 2.5, 0, Math.PI * 2);
    context.fillStyle = confidence >= KEYPOINT_VISIBILITY_THRESHOLD ? "#7dd3fc" : "#a1a1aa";
    context.fill();
  }
  context.restore();
}

function MeasurementMarkerOverlay({ marker, mirror }: { marker: MeasurementMarker; mirror: boolean }) {
  const x = (mirror ? 1 - marker.x : marker.x) * 100;
  const y = marker.y * 100;
  return (
    <div className="pointer-events-none absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -115%)" }}>
      <div className="mb-1 h-3 w-3 rounded-full border-2 border-white bg-sky-400 shadow" aria-hidden="true" />
      <div className="-translate-x-[42%] whitespace-nowrap rounded-lg bg-black/75 px-2.5 py-1.5 text-left text-white shadow-lg backdrop-blur">
        <p className="text-[10px] font-medium text-white/65">{marker.label} · {marker.interpretation === "2d-projection-proxy" ? "2D proxy" : "2D angle"}</p>
        <p className="text-sm font-semibold tabular-nums">{marker.value.toFixed(1)}°</p>
      </div>
    </div>
  );
}

function TelemetryCell({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-900">{value}</dd></div>;
}

function GuideOverlay({ view, ready }: { view: "front" | "side"; ready: boolean }) {
  return <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className={`relative h-[82%] border-2 border-dashed ${view === "front" ? "w-[38%] rounded-[45%]" : "w-[30%] rounded-[42%]"} ${ready ? "border-emerald-300/90" : "border-white/55"}`}><div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white backdrop-blur">{view === "front" ? "Face camera" : "Turn side-on"}</div></div></div>;
}
