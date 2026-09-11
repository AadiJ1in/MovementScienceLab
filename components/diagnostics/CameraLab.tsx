"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAMERA_PROFILE_STORAGE_KEY,
  DEFAULT_CAMERA_PREFERENCE,
  buildCameraConstraints,
  parseCameraPreference,
  type CameraTargetResolution,
} from "@/lib/pose/camera-preferences";

type CameraOption = {
  deviceId: string;
  label: string;
};

type CaptureProfile = {
  width?: number;
  height?: number;
  frameRate?: number;
  facingMode?: string;
  deviceId?: string;
};

export function CameraLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">(DEFAULT_CAMERA_PREFERENCE.facingMode);
  const [targetResolution, setTargetResolution] = useState<CameraTargetResolution>(DEFAULT_CAMERA_PREFERENCE.targetResolution);
  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CaptureProfile>({});
  const [saved, setSaved] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setProfile({});
    setStatus("idle");
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === "videoinput");
    setCameras(
      videoInputs.map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      })),
    );
  }, []);

  useEffect(() => {
    const stored = parseCameraPreference(window.localStorage.getItem(CAMERA_PROFILE_STORAGE_KEY));
    setSelectedDeviceId(stored.deviceId ?? "");
    setFacingMode(stored.facingMode);
    setTargetResolution(stored.targetResolution);
    setSaved(Boolean(window.localStorage.getItem(CAMERA_PROFILE_STORAGE_KEY)));

    void refreshDevices();
    const mediaDevices = navigator.mediaDevices;
    mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [refreshDevices]);

  async function startCamera() {
    try {
      setStatus("starting");
      setError(null);
      setSaved(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());

      const requestedPreference = {
        ...(selectedDeviceId ? { deviceId: selectedDeviceId } : {}),
        facingMode,
        targetResolution,
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: buildCameraConstraints(requestedPreference),
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview element is unavailable.");
      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      setProfile({
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        facingMode: settings.facingMode,
        deviceId: settings.deviceId,
      });
      await refreshDevices();
      setStatus("ready");
    } catch (caught) {
      stopStream();
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Unable to start camera.");
    }
  }

  function saveForAnalysis() {
    if (status !== "ready") return;
    const testedDeviceId = profile.deviceId || selectedDeviceId || undefined;
    const preference = {
      ...(testedDeviceId ? { deviceId: testedDeviceId } : {}),
      facingMode,
      targetResolution,
    };
    window.localStorage.setItem(CAMERA_PROFILE_STORAGE_KEY, JSON.stringify(preference));
    setSelectedDeviceId(testedDeviceId ?? "");
    setSaved(true);
  }

  const qualityLabel = useMemo(() => {
    if (status !== "ready") return "Not measured";
    if ((profile.width ?? 0) >= 1920 && (profile.frameRate ?? 0) >= 25) return "High capture quality";
    if ((profile.width ?? 0) >= 1280 && (profile.frameRate ?? 0) >= 20) return "Usable capture quality";
    return "Low capture quality";
  }, [profile, status]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-black shadow-sm">
        <div className="relative aspect-video bg-zinc-950">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          {status !== "ready" && (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white/80">
              {status === "starting" ? "Starting selected camera…" : "Start a camera to inspect its real capture settings."}
            </div>
          )}
          <div className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            {qualityLabel}
          </div>
        </div>
      </section>

      <aside className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Camera lab</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">Multi-camera calibration</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Compare built-in, rear-facing, and external cameras before movement capture. The browser may negotiate settings different from the requested target.
          </p>
        </div>

        <label className="block text-sm font-medium text-zinc-800">
          Camera device
          <select
            value={selectedDeviceId}
            onChange={(event) => { setSelectedDeviceId(event.target.value); setSaved(false); }}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Automatic camera</option>
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-zinc-800">
            Preferred side
            <select
              value={facingMode}
              disabled={Boolean(selectedDeviceId)}
              onChange={(event) => { setFacingMode(event.target.value as "user" | "environment"); setSaved(false); }}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm disabled:bg-zinc-100"
            >
              <option value="user">Front / user</option>
              <option value="environment">Rear / environment</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-800">
            Target quality
            <select
              value={targetResolution}
              onChange={(event) => { setTargetResolution(event.target.value as CameraTargetResolution); setSaved(false); }}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => void startCamera()} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white">
            {status === "ready" ? "Restart camera" : "Start camera"}
          </button>
          <button type="button" onClick={stopStream} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800">
            Stop
          </button>
        </div>

        <button
          type="button"
          disabled={status !== "ready"}
          onClick={saveForAnalysis}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
        >
          {saved ? "Saved for movement analysis" : "Use this camera for movement analysis"}
        </button>

        <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-950">Negotiated capture</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <dt>Resolution</dt><dd>{profile.width && profile.height ? `${profile.width} × ${profile.height}` : "—"}</dd>
            <dt>Frame rate</dt><dd>{profile.frameRate ? `${profile.frameRate.toFixed(1)} fps` : "—"}</dd>
            <dt>Facing mode</dt><dd>{profile.facingMode || "—"}</dd>
            <dt>Detected cameras</dt><dd>{cameras.length}</dd>
          </dl>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        <p className="text-xs leading-5 text-zinc-500">
          Saved camera preferences stay in this browser and contain only a device identifier and requested capture settings. Camera quality is an engineering prerequisite only; it does not establish clinical validity.
        </p>
      </aside>
    </div>
  );
}