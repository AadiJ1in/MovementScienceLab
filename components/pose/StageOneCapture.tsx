"use client";

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CapturePerformanceMonitor,
  type CaptureQualityIssue,
} from "@/lib/pose/capture-quality";
import {
  CAMERA_PROFILE_STORAGE_KEY,
  DEFAULT_CAMERA_PREFERENCE,
  buildCameraConstraints,
  parseCameraPreference,
  type CameraPreference,
  type CameraTargetResolution,
  withoutExactDevice,
} from "@/lib/pose/camera-preferences";
import {
  evaluateCameraGuidance,
  KEYPOINT_VISIBILITY_THRESHOLD,
  MOVEMENT_GUIDANCE,
} from "@/lib/pose/camera-guidance";
import {
  buildPoseStreamFrame,
  type PoseFrameClock,
  type PoseStreamFrame,
} from "@/lib/pose/stream";
import { toPoseFrame, type MovementType, type PoseFrame } from "@/lib/pose/types";

const WASM_ROOT =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_URL?.trim() ||
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL =
  process.env.NEXT_PUBLIC_MEDIAPIPE_MODEL_URL?.trim() ||
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

const REQUESTED_FPS = 30;
const TELEMETRY_UI_INTERVAL_MS = 500;
const POSE_UI_INTERVAL_MS = 100;

type VideoFrameMetadataLike = {
  mediaTime?: number;
  presentedFrames?: number;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export type StageOneCaptureTelemetry = {
  width?: number;
  height?: number;
  requestedFps: number;
  cameraFps?: number;
  inferenceFps?: number;
  averageInferenceLatencyMs?: number;
  estimatedDroppedProcessingFrames?: number;
  meanPoseConfidence?: number | null;
  confidenceStdDev?: number | null;
  facingMode?: string;
  deviceLabel?: string;
  delegate?: "GPU" | "CPU";
  frameClock: PoseFrameClock;
  qualityIssues?: CaptureQualityIssue[];
  recommendLowerProcessingResolution?: boolean;
};

type Props = {
  movement: MovementType;
  onStreamFrame: (frame: PoseStreamFrame) => void;
  onReadyChange: (ready: boolean) => void;
  onTelemetryChange?: (telemetry: StageOneCaptureTelemetry | null) => void;
  overlay?: ReactNode;
};

type CaptureStatus = "idle" | "loading" | "ready" | "error";

export function StageOneCapture({
  movement,
  onStreamFrame,
  onReadyChange,
  onTelemetryChange,
  overlay,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const videoFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastMediaTimeRef = useRef(-1);
  const lastTelemetryUiUpdateRef = useRef(0);
  const lastPoseUiUpdateRef = useRef(0);
  const sequenceRef = useRef(0);
  const monitorRef = useRef(new CapturePerformanceMonitor());
  const onStreamFrameRef = useRef(onStreamFrame);
  const onReadyRef = useRef(onReadyChange);
  const onTelemetryRef = useRef(onTelemetryChange);

  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | null>(null);
  const [preference, setPreference] = useState<CameraPreference>(DEFAULT_CAMERA_PREFERENCE);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [telemetry, setTelemetry] = useState<StageOneCaptureTelemetry | null>(null);

  const { deviceId, facingMode, targetResolution } = preference;

  useEffect(() => {
    onStreamFrameRef.current = onStreamFrame;
    onReadyRef.current = onReadyChange;
    onTelemetryRef.current = onTelemetryChange;
  }, [onStreamFrame, onReadyChange, onTelemetryChange]);

  useEffect(() => {
    setPreference(parseCameraPreference(window.localStorage.getItem(CAMERA_PROFILE_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    function stopWhenHidden() {
      if (document.hidden) setCaptureEnabled(false);
    }
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, []);

  const guidance = useMemo(
    () => evaluateCameraGuidance(frame, movement),
    [frame, movement],
  );
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
      setDelegate(null);
      setError(null);
      performanceMonitor.reset();
      sequenceRef.current = 0;
      onReadyRef.current(false);
      return;
    }

    let cancelled = false;
    const activePreference: CameraPreference = {
      facingMode,
      targetResolution,
      ...(deviceId ? { deviceId } : {}),
    };

    async function refreshDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const next = (await navigator.mediaDevices.enumerateDevices()).filter(
        (item) => item.kind === "videoinput",
      );
      if (!cancelled) setDevices(next);
    }

    function handleTrackEnded() {
      if (cancelled) return;
      setError("The selected camera disconnected or stopped providing video.");
      setStatus("error");
      setFrame(null);
      onReadyRef.current(false);
    }

    async function start() {
      try {
        setStatus("loading");
        setError(null);
        setTelemetry(null);
        setFrame(null);
        performanceMonitor.reset();
        sequenceRef.current = 0;
        lastMediaTimeRef.current = -1;
        lastTelemetryUiUpdateRef.current = 0;
        lastPoseUiUpdateRef.current = 0;

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera capture is not supported in this browser.");
        }

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

        landmarkerRef.current = landmarker;
        setDelegate(activeDelegate);

        let stream: MediaStream;
        let effectivePreference = activePreference;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: buildCameraConstraints(activePreference),
          });
        } catch (caught) {
          const recoverable =
            Boolean(activePreference.deviceId) &&
            caught instanceof DOMException &&
            (caught.name === "NotFoundError" || caught.name === "OverconstrainedError");
          if (!recoverable) throw caught;

          effectivePreference = withoutExactDevice(activePreference);
          setPreference(effectivePreference);
          window.localStorage.setItem(
            CAMERA_PROFILE_STORAGE_KEY,
            JSON.stringify(effectivePreference),
          );
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: buildCameraConstraints(effectivePreference),
          });
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
        const selectedDevice = (await navigator.mediaDevices.enumerateDevices()).find(
          (item) => item.kind === "videoinput" && item.deviceId === settings.deviceId,
        );
        const videoWithCallback = video as VideoWithFrameCallback;
        const frameClock: PoseFrameClock = videoWithCallback.requestVideoFrameCallback
          ? "request-video-frame-callback"
          : "animation-frame-fallback";

        const baseTelemetry: StageOneCaptureTelemetry = {
          width: settings.width,
          height: settings.height,
          requestedFps: REQUESTED_FPS,
          cameraFps: settings.frameRate,
          facingMode: settings.facingMode,
          deviceLabel: selectedDevice?.label || "Camera",
          delegate: activeDelegate,
          frameClock,
        };
        setTelemetry(baseTelemetry);
        window.localStorage.setItem(
          CAMERA_PROFILE_STORAGE_KEY,
          JSON.stringify({
            ...effectivePreference,
            ...(settings.deviceId ? { deviceId: settings.deviceId } : {}),
          }),
        );
        setStatus("ready");
        navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices);

        const context = canvasRef.current?.getContext("2d") ?? null;
        const drawingUtils = context ? new DrawingUtils(context) : null;

        function scheduleNextFrame() {
          if (cancelled) return;
          const activeVideo = videoRef.current as VideoWithFrameCallback | null;
          if (!activeVideo) return;

          if (activeVideo.requestVideoFrameCallback) {
            videoFrameRef.current = activeVideo.requestVideoFrameCallback((now, metadata) => {
              processFrame(now, metadata.mediaTime);
            });
          } else {
            animationRef.current = requestAnimationFrame((now) => {
              processFrame(now, activeVideo.currentTime);
            });
          }
        }

        function processFrame(callbackTimestampMs: number, mediaTimeSeconds?: number) {
          if (cancelled) return;

          const activeVideo = videoRef.current;
          const canvas = canvasRef.current;
          const activeLandmarker = landmarkerRef.current;
          if (
            !activeVideo ||
            !canvas ||
            !activeLandmarker ||
            activeVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            scheduleNextFrame();
            return;
          }

          const mediaTime = mediaTimeSeconds ?? activeVideo.currentTime;
          if (frameClock === "animation-frame-fallback" && mediaTime === lastMediaTimeRef.current) {
            scheduleNextFrame();
            return;
          }
          lastMediaTimeRef.current = mediaTime;

          if (
            canvas.width !== activeVideo.videoWidth ||
            canvas.height !== activeVideo.videoHeight
          ) {
            canvas.width = activeVideo.videoWidth;
            canvas.height = activeVideo.videoHeight;
          }

          const inferenceStarted = performance.now();
          const result = activeLandmarker.detectForVideo(activeVideo, callbackTimestampMs);
          const inferenceLatencyMs = performance.now() - inferenceStarted;
          drawResult(result, drawingUtils, canvas);

          const landmarks = result.landmarks[0];
          const nextFrame =
            landmarks?.length === 33
              ? toPoseFrame(
                  landmarks,
                  callbackTimestampMs,
                  KEYPOINT_VISIBILITY_THRESHOLD,
                )
              : null;
          const worldLandmarks = result.worldLandmarks?.[0] ?? [];
          const poseConfidence = nextFrame
            ? nextFrame.keypoints.reduce((sum, point) => sum + point.visibility, 0) /
              nextFrame.keypoints.length
            : null;

          const snapshot = performanceMonitor.add(
            {
              timestampMs: callbackTimestampMs,
              inferenceLatencyMs,
              poseConfidence,
            },
            settings.frameRate,
            effectivePreference.targetResolution,
          );

          sequenceRef.current += 1;
          const streamFrame = buildPoseStreamFrame(
            nextFrame,
            {
              sequence: sequenceRef.current,
              callbackTimestampMs,
              capturedAtEpochMs: Math.round(performance.timeOrigin + callbackTimestampMs),
              mediaTimeMs: mediaTime * 1000,
              frameClock,
              width: activeVideo.videoWidth || settings.width,
              height: activeVideo.videoHeight || settings.height,
              facingMode: settings.facingMode,
              delegate: activeDelegate,
              cameraFps: settings.frameRate,
              inferenceFps: snapshot.processingFps,
              averageInferenceLatencyMs: snapshot.averageInferenceLatencyMs,
              inferenceLatencyMs,
            },
            worldLandmarks,
          );
          onStreamFrameRef.current(streamFrame);

          if (callbackTimestampMs - lastPoseUiUpdateRef.current >= POSE_UI_INTERVAL_MS) {
            lastPoseUiUpdateRef.current = callbackTimestampMs;
            setFrame(nextFrame);
          }

          if (
            callbackTimestampMs - lastTelemetryUiUpdateRef.current >=
            TELEMETRY_UI_INTERVAL_MS
          ) {
            lastTelemetryUiUpdateRef.current = callbackTimestampMs;
            setTelemetry({
              ...baseTelemetry,
              inferenceFps: snapshot.processingFps,
              averageInferenceLatencyMs: snapshot.averageInferenceLatencyMs,
              estimatedDroppedProcessingFrames: snapshot.estimatedDroppedProcessingFrames,
              meanPoseConfidence: snapshot.meanPoseConfidence,
              confidenceStdDev: snapshot.confidenceStdDev,
              qualityIssues: snapshot.qualityIssues,
              recommendLowerProcessingResolution:
                snapshot.recommendLowerProcessingResolution,
            });
          }

          scheduleNextFrame();
        }

        scheduleNextFrame();
      } catch (caught) {
        setStatus("error");
        setError(cameraErrorMessage(caught));
        setFrame(null);
        setTelemetry(null);
        onReadyRef.current(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      const activeVideo = videoRef.current as VideoWithFrameCallback | null;
      if (
        videoFrameRef.current !== null &&
        activeVideo?.cancelVideoFrameCallback
      ) {
        activeVideo.cancelVideoFrameCallback(videoFrameRef.current);
      }
      videoFrameRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      performanceMonitor.reset();
      const canvasContext = canvasRef.current?.getContext("2d");
      if (canvasContext && canvasRef.current) {
        canvasContext.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    };
  }, [captureEnabled, deviceId, facingMode, targetResolution]);

  function updatePreference(next: CameraPreference) {
    window.localStorage.setItem(CAMERA_PROFILE_STORAGE_KEY, JSON.stringify(next));
    setPreference(next);
  }

  async function enterFullScreen() {
    const element = previewRef.current;
    if (!element?.requestFullscreen) return;
    try {
      await element.requestFullscreen();
    } catch {
      // Fullscreen can be rejected by browser policy; capture remains usable.
    }
  }

  const config = MOVEMENT_GUIDANCE[movement];
  const qualityIssues = telemetry?.qualityIssues ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl shadow-zinc-950/10">
        <div
          ref={previewRef}
          className="relative aspect-video min-h-[280px] w-full overflow-hidden bg-[#090b0a] sm:min-h-0"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-contain sm:object-cover ${mirror ? "scale-x-[-1]" : ""}`}
          />
          <canvas
            ref={canvasRef}
            className={`pointer-events-none absolute inset-0 h-full w-full object-contain sm:object-cover ${mirror ? "scale-x-[-1]" : ""}`}
          />

          <LabGridOverlay />
          {captureEnabled && <GuideOverlay view={config.view} ready={captureReady} />}

          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <div className="border border-white/15 bg-black/65 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur-sm">
              {status === "idle" && "Camera off"}
              {status === "loading" && "Starting pose engine…"}
              {status === "ready" &&
                (frame
                  ? `${frame.trustedKeypointCount}/33 trusted landmarks`
                  : "Searching for full-body pose…")}
              {status === "error" && "Capture unavailable"}
            </div>
            {telemetry && (
              <div className="border border-white/15 bg-black/65 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-white/65 backdrop-blur-sm">
                {telemetry.frameClock === "request-video-frame-callback" ? "Source-frame clock" : "Display-clock fallback"}
              </div>
            )}
          </div>

          {telemetry && (
            <div className="absolute bottom-4 left-4 border border-white/15 bg-black/65 px-3 py-2 text-[10px] text-white/70 backdrop-blur-sm">
              <span className="font-semibold text-white">{telemetry.inferenceFps?.toFixed(1) ?? "—"} pose fps</span>
              <span className="mx-2 text-white/25">|</span>
              {telemetry.averageInferenceLatencyMs?.toFixed(1) ?? "—"} ms mean latency
              <span className="mx-2 text-white/25">|</span>
              {telemetry.delegate ?? "—"}
            </div>
          )}

          {captureEnabled && typeof document !== "undefined" && document.fullscreenEnabled && (
            <button
              type="button"
              onClick={() => void enterFullScreen()}
              className="absolute bottom-4 right-4 border border-white/15 bg-black/65 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm"
            >
              Full screen
            </button>
          )}

          {overlay && (
            <div className="pointer-events-none absolute right-4 top-4">{overlay}</div>
          )}

          {!captureEnabled && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md border border-white/15 bg-black/80 p-6 text-center text-white backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Local capture</p>
                <p className="mt-2 text-lg font-semibold">Camera and pose inference are off</p>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Enable capture after reviewing the local-processing notice. Video frames are not uploaded by this Stage 1 workspace.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4 border border-zinc-200 bg-white p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Capture setup</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">{config.label}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{config.instruction}</p>
        </div>

        {!captureEnabled ? (
          <div className="space-y-3">
            <div className="border border-zinc-200 bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
              <p className="font-semibold text-zinc-900">Camera privacy notice</p>
              <p className="mt-1">
                Camera pixels are processed in this browser with MediaPipe Pose Landmarker and are not uploaded or stored by this Stage 1 workspace. MediaPipe model/WASM assets can be loaded from configured remote hosts, and the MediaPipe package documents performance/utilization telemetry.
              </p>
            </div>
            <label className="flex gap-2 text-xs leading-5 text-zinc-600">
              <input
                type="checkbox"
                checked={privacyAcknowledged}
                onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
                className="mt-1"
              />
              <span>I understand the capture and processing scope above.</span>
            </label>
            <button
              type="button"
              disabled={!privacyAcknowledged}
              onClick={() => setCaptureEnabled(true)}
              className="w-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Enable local motion capture
            </button>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-zinc-800">
              Camera
              <select
                aria-label="Camera device"
                value={deviceId ?? ""}
                onChange={(event) =>
                  updatePreference({
                    ...preference,
                    deviceId: event.target.value || undefined,
                  })
                }
                className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Automatic camera</option>
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Lens direction</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <PreferenceButton
                  active={facingMode === "user" && !deviceId}
                  onClick={() =>
                    updatePreference({
                      ...preference,
                      deviceId: undefined,
                      facingMode: "user",
                    })
                  }
                >
                  Front
                </PreferenceButton>
                <PreferenceButton
                  active={facingMode === "environment" && !deviceId}
                  onClick={() =>
                    updatePreference({
                      ...preference,
                      deviceId: undefined,
                      facingMode: "environment",
                    })
                  }
                >
                  Rear
                </PreferenceButton>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Requested capture</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["720p", "1080p"] as CameraTargetResolution[]).map((resolution) => (
                  <PreferenceButton
                    key={resolution}
                    active={targetResolution === resolution}
                    onClick={() => updatePreference({ ...preference, targetResolution: resolution })}
                  >
                    {resolution}
                  </PreferenceButton>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCaptureEnabled(false)}
              className="w-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
            >
              Stop camera
            </button>
          </>
        )}

        {telemetry && (
          <dl className="grid grid-cols-2 gap-px bg-zinc-200 text-xs">
            <TelemetryCell
              label="Resolution"
              value={telemetry.width && telemetry.height ? `${telemetry.width}×${telemetry.height}` : "—"}
            />
            <TelemetryCell label="Camera FPS" value={telemetry.cameraFps?.toFixed(1) ?? "—"} />
            <TelemetryCell label="Pose FPS" value={telemetry.inferenceFps?.toFixed(1) ?? "—"} />
            <TelemetryCell
              label="Latency"
              value={
                telemetry.averageInferenceLatencyMs !== undefined
                  ? `${telemetry.averageInferenceLatencyMs.toFixed(1)} ms`
                  : "—"
              }
            />
            <TelemetryCell
              label="Frame clock"
              value={telemetry.frameClock === "request-video-frame-callback" ? "source" : "fallback"}
            />
            <TelemetryCell label="Runtime" value={telemetry.delegate ?? delegate ?? "—"} />
          </dl>
        )}

        {telemetry?.recommendLowerProcessingResolution && targetResolution === "1080p" && (
          <div className="border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            <p className="font-semibold">720p may be more stable</p>
            <p className="mt-1 text-xs leading-5">
              1080p is reducing real-time pose throughput on this device. Lower resolution can improve temporal sampling.
            </p>
            <button
              type="button"
              onClick={() => updatePreference({ ...preference, targetResolution: "720p" })}
              className="mt-3 bg-sky-800 px-3 py-2 text-xs font-semibold text-white"
            >
              Switch to 720p
            </button>
          </div>
        )}

        {captureEnabled && (
          <div
            className={`border p-4 text-sm ${
              captureReady && qualityIssues.length === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            <p className="font-semibold">
              {captureReady && qualityIssues.length === 0
                ? "Capture quality looks usable"
                : "Capture quality needs attention"}
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5">
              {guidance.messages.map((message) => (
                <li key={message}>• {message}</li>
              ))}
              {qualityIssues.map((issue) => (
                <li key={issue.code}>• {issue.message}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] opacity-70">
              Engineering capture checks only — not clinical findings.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
      </aside>
    </div>
  );
}

async function createLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: "GPU" | "CPU",
) {
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
    if (caught.name === "NotAllowedError" || caught.name === "SecurityError") {
      return "Camera permission was denied. Allow camera access in your browser settings, then try again.";
    }
    if (caught.name === "NotFoundError") {
      return "No usable camera was detected. Connect a camera and try again.";
    }
    if (caught.name === "NotReadableError") {
      return "The camera is busy or unavailable. Close other apps using it, then try again.";
    }
    if (caught.name === "OverconstrainedError") {
      return "This camera cannot provide the requested capture mode. Choose another camera or resolution.";
    }
  }
  return caught instanceof Error ? caught.message : "Unable to start motion capture.";
}

function drawResult(
  result: PoseLandmarkerResult,
  drawingUtils: DrawingUtils | null,
  canvas: HTMLCanvasElement,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const landmarks = result.landmarks[0];
  if (!landmarks || !drawingUtils) return;

  drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
    color: "rgba(125, 211, 252, 0.88)",
    lineWidth: 3,
  });

  context.save();
  for (const landmark of landmarks) {
    const visibility =
      typeof landmark.visibility === "number"
        ? Math.max(0, Math.min(1, landmark.visibility))
        : 1;
    context.globalAlpha = 0.2 + visibility * 0.8;
    context.fillStyle =
      visibility >= KEYPOINT_VISIBILITY_THRESHOLD ? "#a7f3d0" : "#fcd34d";
    context.beginPath();
    context.arc(
      landmark.x * canvas.width,
      landmark.y * canvas.height,
      visibility >= KEYPOINT_VISIBILITY_THRESHOLD ? 4 : 2.5,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}

function LabGridOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-35">
      <div className="absolute inset-x-0 top-1/2 border-t border-white/10" />
      <div className="absolute inset-y-0 left-1/2 border-l border-white/10" />
      <div className="absolute inset-x-[12%] bottom-[12%] border-t border-dashed border-white/15" />
      <div className="absolute inset-[8%] border border-white/[0.06]" />
    </div>
  );
}

function GuideOverlay({ view, ready }: { view: "front" | "side"; ready: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className={`relative h-[82%] border transition-colors ${
          view === "front" ? "w-[42%]" : "w-[34%]"
        } ${ready ? "border-emerald-300/80" : "border-white/25"}`}
      >
        <span className="absolute -left-px -top-px h-5 w-5 border-l-2 border-t-2 border-current" />
        <span className="absolute -right-px -top-px h-5 w-5 border-r-2 border-t-2 border-current" />
        <span className="absolute -bottom-px -left-px h-5 w-5 border-b-2 border-l-2 border-current" />
        <span className="absolute -bottom-px -right-px h-5 w-5 border-b-2 border-r-2 border-current" />
        <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/75 backdrop-blur-sm">
          {view === "front" ? "Frontal capture zone" : "Side capture zone"}
        </div>
      </div>
    </div>
  );
}

function PreferenceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3 py-2 text-sm font-medium ${
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}

function TelemetryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-900 tabular-nums">{value}</dd>
    </div>
  );
}
