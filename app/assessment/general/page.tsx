import { GuidedAssessment } from "@/components/assessment/GuidedAssessment";

export default function GeneralAssessmentPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Advanced assessment</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">General movement measurement</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          Use the broader research workflow for alternate movements and camera views. For the guided knee-control injury-risk research screen, use the main Assessment page.
        </p>
      </div>
      <GuidedAssessment />
    </main>
  );
}
