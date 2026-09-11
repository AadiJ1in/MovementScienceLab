"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraOption = { deviceId: string; label: string };
type StreamMetrics = { width?: number; height?: number; frameRate?: number; label?: string };

export function DualCameraLab() {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const primaryStreamRef = useRef<MediaStream | null>(null);
  const secondaryStreamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [primaryId, setPrimaryId] = useState("");
  const [secondaryId, setSecondaryId] = useState("");
  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [primaryMetrics, setPrimaryMetrics] = useState<StreamMetrics>({});
  const [secondaryMetrics, setSecondaryMetrics] = useState<StreamMetrics>({});

  const stop = useCallback(() => {
    primaryStreamRef.current?.getTracks().forEach((track) => track.stop());
    secondaryStreamRef.current?.getTracks().forEach((track) => track.stop());
    primaryStreamRef.current = null;
    secondaryStreamRef.current = null;
    if (primaryVideoRef.current) primaryVideoRef.current.srcObject = null;
    if (secondaryVideoRef.current) secondaryVideoRef.current.srcObject = null;
    setPrimaryMetrics({});
    setSecondaryMetrics({});
    setStatus("idle");
  }, []);

  const refreshDevices = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;
    const devices = await mediaDevices.enumerateDevices();
    const options = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
    setCameras(options);
    setPrimaryId((current) => current || options[0]?.deviceId || "");
    setSecondaryId((current) => current || options[1]?.deviceId || "");
  }, []);

  useEffect(() => {
    void refreshDevices();
    const mediaDevices = navigator.mediaDevices;
    mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      primaryStreamRef.current?.getTracks().forEach((track) => track.stop());
      secondaryStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [refreshDevices]);

  function metricsFor(stream: MediaStream): StreamMetrics {
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    return {
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      label: track?.label,
    };
  }

  async function start() {
    try {
      setError(null);
      setStatus("starting");
      primaryStreamRef.current?.getTracks().forEach((track) => track.stop());
      secondaryStreamRef.current?.getTracks().forEach((track) => track.stop());

      if (!primaryId || !secondaryId) {
        throw new Error("Two camera devices must be selected.");
      }
      if (primaryId === secondaryId) {
        throw new Error("Choose two different camera devices.");
      }

      const common: Omit<MediaTrackConstraints, "deviceId"> = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, min: 20 },
      };

      const first = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...common, deviceId: { exact: primaryId } },
      });
      primaryStreamRef.current = first;

      let second: MediaStream;
      try {
        second = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...common, deviceId: { exact: secondaryId } },
        });
      } catch (caught) {
        first.getTracks().forEach((track) => track.stop());
        primaryStreamRef.current = null;
        throw caught;
      }
      secondaryStreamRef.current = second;

      const primaryVideo = primaryVideoRef.current;
      const secondaryVideo = secondaryVideoRef.current;
      if (!primaryVideo || !secondaryVideo) throw new Error("Dual preview elements are unavailable.");
      primaryVideo.srcObject = first;
      secondaryVideo.srcObject = second;
      await Promise.all([primaryVideo.play(), secondaryVideo.play()]);
      setPrimaryMetrics(metricsFor(first));
      setSecondaryMetrics(metricsFor(second));
      await refreshDevices();
      setStatus("ready");
    } catch (caught) {
      primaryStreamRef.current?.getTracks().forEach((track) => track.stop());
      secondaryStreamRef.current?.getTracks().forEach((track) => track.stop());
      primaryStreamRef.current = null;
      secondaryStreamRef.current = null;
      setPrimaryMetrics({});
      setSecondaryMetrics({});
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Unable to start two cameras simultaneously.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-2">
        <CameraPanel title="Primary view" videoRef={primaryVideoRef} metrics={primaryMetrics} status={status} />
        <CameraPanel title="Secondary view" videoRef={secondaryVideoRef} metrics={secondaryMetrics} status={status} />
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <CameraSelect label="Primary camera" value={primaryId} onChange={setPrimaryId} cameras={cameras} />
          <CameraSelect label="Secondary camera" value={secondaryId} onChange={setSecondaryId} cameras={cameras} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => void start()} disabled={status === "starting"} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:bg-zinc-400">
            {status === "starting" ? "Starting both cameras…" : "Start dual-camera test"}
          </button>
          <button type="button" onClick={stop} className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800">Stop both</button>
        </div>
        {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
          <p className="font-semibold text-zinc-900">Research limitation</p>
          <p className="mt-1">Two simultaneous browser cameras can provide complementary views and camera-domain validation. They are not automatically synchronized, calibrated, or sufficient for true 3D kinematics. Clinical 3D measurements require a validated calibration/reconstruction protocol.</p>
        </div>
      </section>
    </div>
  );
}

function CameraSelect({ label, value, onChange, cameras }: { label: string; value: string; onChange: (value: string) => void; cameras: CameraOption[] }) {
  return (
    <label className="block text-sm font-medium text-zinc-800">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm">
        <option value="">Select camera</option>
        {cameras.map((camera) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>)}
      </select>
    </label>
  );
}

function CameraPanel({ title, videoRef, metrics, status }: { title: string; videoRef: React.RefObject<HTMLVideoElement | null>; metrics: StreamMetrics; status: "idle" | "starting" | "ready" | "error" }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-200 bg-black shadow-sm">
      <div className="relative aspect-video bg-zinc-950">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        {status !== "ready" && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/70">{status === "starting" ? "Opening camera…" : title}</div>}
        <div className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">{title}</div>
        {status === "ready" && <div className="absolute bottom-4 left-4 rounded-xl bg-black/70 px-3 py-2 text-xs text-white backdrop-blur">{metrics.width && metrics.height ? `${metrics.width}×${metrics.height}` : "resolution ?"}{metrics.frameRate ? ` · ${metrics.frameRate.toFixed(1)} fps` : ""}</div>}
      </div>
    </article>
  );
}
