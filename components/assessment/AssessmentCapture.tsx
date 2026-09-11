"use client";

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { toPoseFrame, type MovementType, type PoseFrame } from "@/lib/pose/types";

const WASM_ROOT =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_URL?.trim() ||
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL =
  process.env.NEXT_PUBLIC_MEDIAPIPE_MODEL_URL?.trim() ||
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

export type AssessmentCaptureTelemetry = {
  width?: number;
  height?: number;
  cameraFps?: number;
  inferenceFps?: number;
  inferenceLatencyMs?: number;
  facingMode?: string;
  deviceLabel?: string;
  delegate?: "GPU" | "CPU";
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
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const perfRef = useRef({ windowStarted: 0, frames: 0 });
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

  useEffect(() => {
    onFrameRef.current = onFrame;
    onReadyRef.current = onReadyChange;
    onTelemetryRef.current = onTelemetryChange;
  }, [onFrame, onReadyChange, onTelemetryChange]);

  useEffect(() => {
    setPreference(parseCameraPreference(window.localStorage.getItem(CAMERA_PROFILE_STORAGE_KEY)));
  }, []);

  const guidance = useMemo(() => evaluateCameraGuidance(frame, movement), [frame, movement]);
  const captureReady = captureEnabled && status === "ready" && guidance.ready;
  const mirror = telemetry?.facingMode !== "environment";

  useEffect(() => {
    onReadyRef.current(captureReady);
  }, [captureReady]);

  useEffect(() => {
    onTelemetryRef.current?.(telemetry);
  }, [telemetry]);

  useEffect(() => {
    if (!captureEnabled) {
      setStatus("idle");
      setFrame(null);
      setTelemetry(null);
      setError(null);
      onFrameRef.current(null);
      onReadyRef.current(false);
      return;
    }

    let cancelled = false;

    async function start() {
      try {
        setStatus("loading");
        setError(null);
        lastVideoTimeRef.current = -1;
        perfRef.current = { windowStarted: performance.now(), frames: 0 };

        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is not supported in this browser.");

        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        if (cancelled) return;

        let landmarker: PoseLandmarker;
        let activeDelegate: "GPU" | "CPU" = "GPU";
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
          });
        } catch {
          activeDelegate = "CPU";
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: POSE_MODEL, delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
          });
        }
        setDelegate(activeDelegate);
        landmarkerRef.current = landmarker;

        let stream: MediaStream;
        let effectivePreference = preference;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: buildCameraConstraints(preference) });
        } catch (caught) {
          const recoverable =
            Boolean(preference.deviceId) &&
            caught instanceof DOMException &&
            (caught.name === "NotFoundError" || caught.name === "OverconstrainedError");
          if (!recoverable) throw caught;
          effectivePreference = withoutExactDevice(preference);
          setPreference(effectivePreference);
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: buildCameraConstraints(effectivePreference) });
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          landmarker.close();
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.() ?? {};
        const refreshedDevices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
        setDevices(refreshedDevices);
        const selectedDevice = refreshedDevices.find((device) => device.deviceId === settings.deviceId);
        const nextTelemetry: AssessmentCaptureTelemetry = {
          width: settings.width,
          height: settings.height,
          cameraFps: settings.frameRate,
          facingMode: settings.facingMode,
          deviceLabel: selectedDevice?.label || "Camera",
          delegate: activeDelegate,
        };
        setTelemetry(nextTelemetry);
        window.localStorage.setItem(
          CAMERA_PROFILE_STORAGE_KEY,
          JSON.stringify({
            ...effectivePreference,
            ...(settings.deviceId ? { deviceId: settings.deviceId } : {}),
          }),
        );
        setStatus("ready");

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
            setFrame(nextFrame);
            onFrameRef.current(nextFrame);

            perfRef.current.frames += 1;
            const elapsed = performance.now() - perfRef.current.windowStarted;
            if (elapsed >= 1000) {
              const inferenceFps = (perfRef.current.frames * 1000) / elapsed;
              perfRef.current = { windowStarted: performance.now(), frames: 0 };
              setTelemetry((current) => current ? { ...current, inferenceFps, inferenceLatencyMs } : current);
            }
          }
          animationRef.current = requestAnimationFrame(processFrame);
        };
        animationRef.current = requestAnimationFrame(processFrame);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unable to start camera analysis.";
        setStatus("error");
        setError(message);
        setFrame(null);
        onFrameRef.current(null);
        onReadyRef.current(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [captureEnabled, preference.deviceId, preference.facingMode, preference.targetResolution]);

  function updatePreference(next: CameraPreference) {
    window.localStorage.setItem(CAMERA_PROFILE_STORAGE_KEY, JSON.stringify(next));
    setPreference(next);
  }

  const config = MOVEMENT_GUIDANCE[movement];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-[2rem] bg-zinc-950 shadow-2xl shadow-zinc-950/10">
        <div className="relative aspect-video min-h-[320px] w-full bg-zinc-950 sm:min-h-0">
          <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${mirror ? "scale-x-[-1]" : ""}`} />
          <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${mirror ? "scale-x-[-1]" : ""}`} />
          {captureEnabled && <GuideOverlay view={config.view} ready={captureReady} />}
          <div className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            {status === "idle" && "Camera off"}
            {status === "loading" && "Starting camera…"}
            {status === "ready" && (frame ? `${frame.trustedKeypointCount}/33 landmarks trusted` : "Finding pose…")}
            {status === "error" && "Camera unavailable"}
          </div>
          {overlay && <div className="pointer-events-none absolute right-4 top-4">{overlay}</div>}
          {!captureEnabled && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-2xl bg-black/75 p-5 text-center text-white backdrop-blur">
                <p className="font-semibold">Camera analysis is off</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Video stays in this browser. Enable the camera when you are ready to position yourself.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200/70">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Camera setup</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">{config.label}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{config.instruction}</p>
        </div>

        {!captureEnabled ? (
          <div className="space-y-3">
            <label className="flex gap-2 text-xs leading-5 text-zinc-600">
              <input type="checkbox" checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} className="mt-1" />
              <span>I understand camera frames are processed locally for pose estimation and are not uploaded or stored by this assessment.</span>
            </label>
            <button type="button" disabled={!privacyAcknowledged} onClick={() => setCaptureEnabled(true)} className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300">Enable camera</button>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-zinc-800">
              Camera
              <select
                aria-label="Camera device"
                value={preference.deviceId ?? ""}
                onChange={(event) => updatePreference({ ...preference, deviceId: event.target.value || undefined })}
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Automatic camera</option>
                {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["720p", "1080p"] as CameraTargetResolution[]).map((resolution) => (
                <button key={resolution} type="button" onClick={() => updatePreference({ ...preference, targetResolution: resolution })} className={`rounded-xl px-3 py-2 text-sm font-medium ${preference.targetResolution === resolution ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}>{resolution}</button>
              ))}
            </div>
            {telemetry && (
              <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-zinc-50 p-4 text-xs">
                <div><dt className="text-zinc-500">Resolution</dt><dd className="mt-1 font-semibold text-zinc-900">{telemetry.width && telemetry.height ? `${telemetry.width}×${telemetry.height}` : "—"}</dd></div>
                <div><dt className="text-zinc-500">Camera FPS</dt><dd className="mt-1 font-semibold text-zinc-900">{telemetry.cameraFps?.toFixed(1) ?? "—"}</dd></div>
                <div><dt className="text-zinc-500">Pose FPS</dt><dd className="mt-1 font-semibold text-zinc-900">{telemetry.inferenceFps?.toFixed(1) ?? "—"}</dd></div>
                <div><dt className="text-zinc-500">Runtime</dt><dd className="mt-1 font-semibold text-zinc-900">{delegate ?? "—"}</dd></div>
              </dl>
            )}
          </>
        )}

        {captureEnabled && (
          <div className={`rounded-2xl p-4 text-sm ${captureReady ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}>
            <p className="font-semibold">{captureReady ? "Position looks usable" : "Adjust your position"}</p>
            <ul className="mt-2 space-y-1 text-xs leading-5">{guidance.messages.map((message) => <li key={message}>• {message}</li>)}</ul>
          </div>
        )}

        {error && <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error} Check browser camera permissions, reconnect the camera, then try again.</div>}
      </aside>
    </div>
  );
}

function drawResult(result: PoseLandmarkerResult, drawingUtils: DrawingUtils | null, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const landmarks = result.landmarks[0];
  if (!landmarks || !drawingUtils) return;
  drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { lineWidth: 3 });
  drawingUtils.drawLandmarks(landmarks, { radius: 3, lineWidth: 1 });
}

function GuideOverlay({ view, ready }: { view: "front" | "side"; ready: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className={`relative h-[82%] border-2 border-dashed ${view === "front" ? "w-[38%] rounded-[45%]" : "w-[30%] rounded-[42%]"} ${ready ? "border-emerald-300/90" : "border-white/55"}`}>
        <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white backdrop-blur">{view === "front" ? "Face camera" : "Turn side-on"}</div>
      </div>
    </div>
  );
}
