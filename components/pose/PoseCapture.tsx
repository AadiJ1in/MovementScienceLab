"use client";

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  evaluateCameraGuidance,
  KEYPOINT_VISIBILITY_THRESHOLD,
  MOVEMENT_GUIDANCE,
} from "@/lib/pose/camera-guidance";
import { toPoseFrame, type MovementType, type PoseFrame } from "@/lib/pose/types";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

const MOVEMENTS: MovementType[] = [
  "squat-front",
  "squat-side",
  "push-up-side",
  "general-front",
  "general-side",
];

type PoseCaptureProps = {
  onFrame?: (frame: PoseFrame | null) => void;
  onMovementChange?: (movement: MovementType) => void;
  onCaptureReadyChange?: (ready: boolean) => void;
  movementLocked?: boolean;
  videoOverlay?: ReactNode;
};

export function PoseCapture({
  onFrame,
  onMovementChange,
  onCaptureReadyChange,
  movementLocked = false,
  videoOverlay,
}: PoseCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onFrameRef = useRef(onFrame);
  const onCaptureReadyChangeRef = useRef(onCaptureReadyChange);
  const lastVideoTimeRef = useRef(-1);

  const [movement, setMovement] = useState<MovementType>("squat-front");
  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    onCaptureReadyChangeRef.current = onCaptureReadyChange;
  }, [onCaptureReadyChange]);

  const guidance = useMemo(
    () => evaluateCameraGuidance(poseFrame, movement),
    [poseFrame, movement],
  );

  const captureReady = status === "ready" && guidance.ready;

  useEffect(() => {
    onCaptureReadyChangeRef.current?.(captureReady);
  }, [captureReady]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setStatus("loading");
        setError(null);
        setDelegate(null);

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not expose webcam capture APIs.");
        }

        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        if (cancelled) return;

        let landmarker: PoseLandmarker;
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: POSE_MODEL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
          });
          setDelegate("GPU");
        } catch {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: POSE_MODEL,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
          });
          setDelegate("CPU");
        }

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Video element was not available.");

        video.srcObject = stream;
        await video.play();
        setStatus("ready");

        const context = canvasRef.current?.getContext("2d") ?? null;
        const drawingUtils = context ? new DrawingUtils(context) : null;

        const processFrame = () => {
          if (cancelled) return;

          const activeVideo = videoRef.current;
          const canvas = canvasRef.current;
          const activeLandmarker = landmarkerRef.current;

          if (
            activeVideo &&
            canvas &&
            activeLandmarker &&
            activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            if (activeVideo.currentTime !== lastVideoTimeRef.current) {
              lastVideoTimeRef.current = activeVideo.currentTime;
              const timestamp = performance.now();

              if (
                canvas.width !== activeVideo.videoWidth ||
                canvas.height !== activeVideo.videoHeight
              ) {
                canvas.width = activeVideo.videoWidth;
                canvas.height = activeVideo.videoHeight;
              }

              const result = activeLandmarker.detectForVideo(activeVideo, timestamp);
              drawResult(result, drawingUtils, canvas);

              const landmarks = result.landmarks[0];
              const nextFrame =
                landmarks?.length === 33
                  ? toPoseFrame(
                      landmarks,
                      timestamp,
                      KEYPOINT_VISIBILITY_THRESHOLD,
                    )
                  : null;

              setPoseFrame(nextFrame);
              onFrameRef.current?.(nextFrame);
            }
          }

          animationFrameRef.current = requestAnimationFrame(processFrame);
        };

        animationFrameRef.current = requestAnimationFrame(processFrame);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Unable to initialize pose capture.";
        setError(message);
        setStatus("error");
        setPoseFrame(null);
        onFrameRef.current?.(null);
        onCaptureReadyChangeRef.current?.(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      onCaptureReadyChangeRef.current?.(false);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  const config = MOVEMENT_GUIDANCE[movement];

  function changeMovement(nextMovement: MovementType) {
    if (movementLocked) return;
    setMovement(nextMovement);
    onMovementChange?.(nextMovement);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
        <div className="relative aspect-video w-full bg-zinc-950">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full scale-x-[-1] object-cover"
          />

          <CameraGuideOverlay view={config.view} ready={guidance.ready} />

          <div className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            {status === "loading" && "Loading pose model…"}
            {status === "ready" &&
              (poseFrame
                ? `${poseFrame.trustedKeypointCount}/33 trusted · ${delegate ?? "runtime"}`
                : `Finding pose…${delegate ? ` · ${delegate}` : ""}`)}
            {status === "error" && "Camera unavailable"}
          </div>

          {videoOverlay && (
            <div className="pointer-events-none absolute right-4 top-4 z-10">
              {videoOverlay}
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Stage 1 · Capture setup
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">Camera guidance</h2>
        </div>

        <label className="block text-sm font-medium text-zinc-800">
          Capture mode
          <select
            value={movement}
            disabled={movementLocked}
            onChange={(event) => changeMovement(event.target.value as MovementType)}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-600 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          >
            {MOVEMENTS.map((item) => (
              <option key={item} value={item}>
                {MOVEMENT_GUIDANCE[item].label}
              </option>
            ))}
          </select>
          {movementLocked && (
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              Capture mode is locked until this recording ends.
            </span>
          )}
        </label>

        <div className="rounded-2xl bg-zinc-100 p-4 text-sm leading-6 text-zinc-700">
          <strong className="text-zinc-950">Position:</strong> {config.instruction}
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            captureReady
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className="text-sm font-semibold text-zinc-950">
            {captureReady ? "Capture position usable" : "Adjust camera/body position"}
          </p>
          <ul className="mt-2 space-y-1 text-sm leading-5 text-zinc-700">
            {guidance.messages.map((message) => (
              <li key={message}>• {message}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-4 text-sm leading-6 text-zinc-600">
          Keypoints are marked <strong>trusted</strong> only when MediaPipe visibility is at
          least {KEYPOINT_VISIBILITY_THRESHOLD.toFixed(1)}. Low-visibility landmarks remain
          available in the frame payload but must not be used for downstream angle calculations.
        </div>

        {delegate === "CPU" && status === "ready" && (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
            GPU acceleration was unavailable, so pose estimation is running on the CPU. Measurement semantics are unchanged, but frame throughput may be lower.
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}. Check browser camera permission and use HTTPS or localhost.
          </div>
        )}
      </aside>
    </section>
  );
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
    lineWidth: 3,
  });
  drawingUtils.drawLandmarks(landmarks, {
    radius: 3,
    lineWidth: 1,
  });
}

function CameraGuideOverlay({
  view,
  ready,
}: {
  view: "front" | "side";
  ready: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className={`relative h-[82%] border-2 border-dashed transition-colors ${
          view === "front" ? "w-[38%] rounded-[45%]" : "w-[30%] rounded-[42%]"
        } ${ready ? "border-emerald-300/90" : "border-white/65"}`}
      >
        <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {view === "front" ? "Face camera" : "Turn side-on to camera"}
        </div>
      </div>
    </div>
  );
}
