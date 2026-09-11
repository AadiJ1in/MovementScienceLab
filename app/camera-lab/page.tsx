import Link from "next/link";
import { CameraLab } from "@/components/diagnostics/CameraLab";

export default function CameraLabPage() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Movement Science Lab</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Camera calibration lab</h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">
            Test multiple cameras, front/rear capture, requested resolution, and the actual frame rate negotiated by the browser before collecting movement data.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">Back to analysis</Link>
            <Link href="/diagnostics" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">Browser diagnostics</Link>
          </div>
        </header>
        <CameraLab />
      </div>
    </main>
  );
}
