import Link from "next/link";
import { KneeRiskAssessment } from "@/components/assessment/KneeRiskAssessment";

export default function AssessmentPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="grid gap-px bg-zinc-300 lg:grid-cols-[1.2fr_.8fr]">
          <div className="bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Movement capture</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-950">Start with the Stage 1 motion-capture instrument.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Verify camera framing, local MediaPipe tracking, landmark visibility, and the raw timestamped frame stream before interpreting movement metrics.
            </p>
            <Link
              href="/camera-lab"
              className="mt-4 inline-flex border border-zinc-950 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Open motion capture lab →
            </Link>
          </div>

          <div className="bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Research assessments</p>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              Existing bilateral and single-leg research screens remain available, but the new Stage 1 lab is the capture-validation entry point.
            </p>
            <Link
              href="/assessment/single-leg-knee-control"
              className="mt-4 inline-flex border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500"
            >
              Single-leg research screen →
            </Link>
          </div>
        </div>
      </div>
      <KneeRiskAssessment />
    </main>
  );
}
