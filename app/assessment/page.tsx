import Link from "next/link";
import { KneeRiskAssessment } from "@/components/assessment/KneeRiskAssessment";

export default function AssessmentPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border border-zinc-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Assessment options</p>
            <p className="mt-1 text-sm text-zinc-700">Start with the guided bilateral squat, or use the single-leg research battery for a task closer to prospective frontal-plane knee-control studies.</p>
          </div>
          <Link href="/assessment/single-leg-knee-control" className="min-w-max border border-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-950 hover:text-white">
            Single-leg research screen →
          </Link>
        </div>
      </div>
      <KneeRiskAssessment />
    </main>
  );
}
