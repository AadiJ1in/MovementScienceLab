import Link from "next/link";

export default function ProgressPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Progress</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Compare compatible movement sessions over time.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">Longitudinal comparison is being separated into a dedicated patient experience. Until that migration is complete, existing authenticated trend charts remain available in the advanced research workspace.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Same movement", "Comparisons should use the same exercise/capture mode."],
            ["Same camera view", "Front- and side-view measurements are not mixed."],
            ["Same measurement version", "Incompatible measurement definitions should not be trended together."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200"><h2 className="font-semibold text-zinc-950">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p></div>
          ))}
        </div>

        <Link href="/research" className="mt-8 inline-flex rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">Open existing session trends</Link>
      </div>
    </main>
  );
}
