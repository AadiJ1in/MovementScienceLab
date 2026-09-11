import { ProgressDashboard } from "@/components/progress/ProgressDashboard";

export default function ProgressPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Progress</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Track compatible movement measurements across rehabilitation sessions.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600">Review camera-derived measurements over time, establish your own descriptive baseline, and compare compatible sessions without mixing exercises, camera views, or measurement versions. Changes shown here are measurements—not diagnoses or claims of clinical improvement.</p>
        <div className="mt-8"><ProgressDashboard /></div>
      </div>
    </main>
  );
}
