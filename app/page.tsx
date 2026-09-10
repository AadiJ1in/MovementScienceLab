import Link from "next/link";
import { MovementAnalysisWorkspace } from "@/components/analysis/MovementAnalysisWorkspace";

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Movement Science Lab
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Webcam movement-quality analysis
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">
            Client-side pose capture, explainable joint-angle analysis, sourced rule-based
            biomechanical flags, reference-form comparison, and session visualization. This is a
            movement-quality tool, not an injury-prediction or diagnostic system.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/validation"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
            >
              View clinical validation status
            </Link>
            <Link
              href="/api/readiness"
              className="rounded-xl border border-zinc-300 bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
            >
              Hospital readiness API
            </Link>
          </div>
        </header>

        <MovementAnalysisWorkspace />

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
          Single-camera 2D pose estimation is sensitive to camera angle, occlusion, lens geometry,
          clothing, and movement out of plane. Frontal knee deviation and pelvic-line obliquity are
          2D proxies and must not be represented as clinical diagnosis or true 3D joint loading.
        </div>
      </div>
    </main>
  );
}
