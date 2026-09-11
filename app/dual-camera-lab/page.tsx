import Link from "next/link";
import { DualCameraLab } from "@/components/diagnostics/DualCameraLab";

export default function DualCameraLabPage() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Movement Science Lab</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Dual-camera research lab</h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">Test whether this device/browser can sustain two distinct cameras at the same time for complementary front/side research views. This is a capture-capability tool, not validated 3D motion capture.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">Back to analysis</Link>
            <Link href="/camera-lab" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">Single-camera calibration</Link>
          </div>
        </header>
        <DualCameraLab />
      </div>
    </main>
  );
}
