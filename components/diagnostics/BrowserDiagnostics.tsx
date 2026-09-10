"use client";

import { useEffect, useMemo, useState } from "react";

type Diagnostic = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export function BrowserDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [cameraPermission, setCameraPermission] = useState<string>("not checked");

  useEffect(() => {
    const next: Diagnostic[] = [];

    next.push({
      name: "Secure context",
      status: window.isSecureContext ? "pass" : "fail",
      detail: window.isSecureContext
        ? "HTTPS/secure context is available."
        : "Camera access is commonly blocked outside HTTPS or localhost.",
    });

    next.push({
      name: "Camera API",
      status: navigator.mediaDevices?.getUserMedia ? "pass" : "fail",
      detail: navigator.mediaDevices?.getUserMedia
        ? "navigator.mediaDevices.getUserMedia is available."
        : "This browser does not expose the webcam capture API used by the app.",
    });

    next.push({
      name: "WebAssembly",
      status: typeof WebAssembly === "object" ? "pass" : "fail",
      detail:
        typeof WebAssembly === "object"
          ? "WebAssembly is available for MediaPipe runtime support."
          : "WebAssembly is unavailable, so the pose runtime cannot initialize normally.",
    });

    const canvas = document.createElement("canvas");
    const webgl2 = canvas.getContext("webgl2");
    const webgl = webgl2 ?? canvas.getContext("webgl");
    next.push({
      name: "GPU graphics context",
      status: webgl ? "pass" : "warn",
      detail: webgl
        ? `${webgl2 ? "WebGL2" : "WebGL"} is available. The app can still fall back to CPU pose inference when GPU delegation fails.`
        : "No WebGL context was detected. CPU inference may still work but performance can be reduced.",
    });

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    next.push({
      name: "Reduced-motion preference",
      status: "pass",
      detail: reducedMotion
        ? "Reduced-motion preference is enabled on this device."
        : "No reduced-motion preference was detected.",
    });

    setDiagnostics(next);

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "camera" as PermissionName })
        .then((result) => {
          setCameraPermission(result.state);
          result.addEventListener("change", () => setCameraPermission(result.state));
        })
        .catch(() => setCameraPermission("browser does not expose camera permission state"));
    }
  }, []);

  const overall = useMemo(() => {
    if (diagnostics.some((item) => item.status === "fail")) return "Not ready";
    if (diagnostics.some((item) => item.status === "warn")) return "Usable with warning";
    return diagnostics.length ? "Ready for capture testing" : "Checking…";
  }, [diagnostics]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Local environment
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">{overall}</h2>
          </div>
          <div className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700">
            Camera permission: {cameraPermission}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {diagnostics.map((item) => (
          <article key={item.name} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-950">{item.name}</h3>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Browser details</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-zinc-50 p-4">
            <dt className="font-medium text-zinc-700">Platform</dt>
            <dd className="mt-1 break-words text-zinc-600">{typeof navigator === "undefined" ? "" : navigator.platform}</dd>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <dt className="font-medium text-zinc-700">Viewport</dt>
            <dd className="mt-1 text-zinc-600">
              {typeof window === "undefined" ? "" : `${window.innerWidth} × ${window.innerHeight}`}
            </dd>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4 sm:col-span-2">
            <dt className="font-medium text-zinc-700">User agent</dt>
            <dd className="mt-1 break-words text-xs leading-5 text-zinc-600">
              {typeof navigator === "undefined" ? "" : navigator.userAgent}
            </dd>
          </div>
        </dl>
      </section>

      <p className="text-xs leading-5 text-zinc-500">
        Diagnostics assess browser/runtime readiness only. A passing result does not validate biomechanical accuracy or clinical performance.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: Diagnostic["status"] }) {
  const classes =
    status === "pass"
      ? "bg-emerald-50 text-emerald-700"
      : status === "warn"
        ? "bg-amber-50 text-amber-800"
        : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{status}</span>;
}
