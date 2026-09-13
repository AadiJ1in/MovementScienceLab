import Link from "next/link";

const FEATURES = [
  {
    eyebrow: "Assessment",
    title: "Guided knee-control screen",
    text: "Five paced squats with explicit 3-second lowering, stabilization, rise, and reset cues.",
    href: "/assessment",
  },
  {
    eyebrow: "AI measurement",
    title: "Visible biomechanics, not a hidden black box",
    text: "See knee-deviation proxies, trunk lean, pelvic-line obliquity, pose confidence, and capture telemetry while you move.",
    href: "/assessment",
  },
  {
    eyebrow: "Evidence",
    title: "Prospective injury research stays attached to the result",
    text: "Research associations are shown with the population, task, source, and limitations instead of being converted into a fabricated injury probability.",
    href: "/research",
  },
  {
    eyebrow: "Progress",
    title: "Your own baseline over time",
    text: "Compare only compatible sessions and measurement versions so longitudinal trends remain interpretable.",
    href: "/progress",
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f5f2] text-zinc-950">
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-zinc-300 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Movement Science Lab</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              AI-assisted movement assessment built around measurable biomechanics.
            </h1>
          </div>
          <p className="max-w-sm text-sm leading-6 text-zinc-600">
            Camera-based pose tracking, standardized assessments, evidence-linked research context, and longitudinal movement data.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950">Featured</h2>
          <Link href="/validation" className="text-xs font-medium text-zinc-500 underline underline-offset-4">Validation status</Link>
        </div>

        <div className="grid gap-px bg-zinc-300 lg:grid-cols-[1.55fr_.85fr]">
          <Link href="/assessment" className="group relative min-h-[420px] overflow-hidden bg-[#101010] p-6 text-white sm:p-8">
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center justify-between gap-4">
                <span className="border border-white/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">New assessment</span>
                <span className="text-xs text-emerald-300">AI pose tracking · browser based</span>
              </div>

              <div className="my-10 flex flex-1 items-center justify-center">
                <div className="relative h-60 w-48 border border-white/15">
                  <div className="absolute left-1/2 top-5 h-8 w-8 -translate-x-1/2 rounded-full border border-white/70" />
                  <div className="absolute left-1/2 top-14 h-24 w-px -translate-x-1/2 bg-white/65" />
                  <div className="absolute left-9 right-9 top-[78px] h-px bg-white/65" />
                  <div className="absolute left-[63px] top-[151px] h-20 w-px rotate-[22deg] bg-white/65" />
                  <div className="absolute right-[63px] top-[151px] h-20 w-px -rotate-[22deg] bg-white/65" />
                  <div className="absolute left-[44px] top-[180px] border border-amber-300 bg-black/70 px-2 py-1 text-[10px] text-amber-200">Knee proxy 12.4°</div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">AI knee-control research assessment</p>
                <h3 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">A clearer squat assessment from setup to evidence.</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Follow a paced five-rep protocol while the AI pose model measures frontal-plane knee deviation, trunk lean, pelvic alignment, symmetry, and tracking quality.</p>
                <p className="mt-5 text-sm font-semibold">Start assessment →</p>
              </div>
            </div>
          </Link>

          <div className="grid gap-px bg-zinc-300 sm:grid-cols-2 lg:grid-cols-1">
            <Link href="/account" className="bg-white p-6 transition hover:bg-zinc-50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Account</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">Sign in is now one click away.</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600">Save assessments, establish your baseline, and review progress from a dedicated account page.</p>
              <p className="mt-5 text-sm font-semibold">Sign in / Account →</p>
            </Link>
            <Link href="/progress" className="bg-white p-6 transition hover:bg-zinc-50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Longitudinal data</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">Track compatible measurements over time.</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600">Progress filters exercise, camera view, measurement definition, and implementation version before comparing sessions.</p>
              <p className="mt-5 text-sm font-semibold">Open progress →</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-zinc-300 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">System</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">What the platform actually does</h2>
          </div>
          <p className="hidden max-w-md text-right text-xs leading-5 text-zinc-500 md:block">AI and research claims remain separated from clinical diagnosis. Every risk association should be traceable to its source and task.</p>
        </div>

        <div className="grid gap-px bg-zinc-300 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((item) => (
            <Link key={item.title} href={item.href} className="group min-h-[230px] bg-white p-5 transition hover:bg-zinc-50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{item.eyebrow}</p>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-zinc-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{item.text}</p>
              <p className="mt-6 text-sm font-semibold text-zinc-900">Explore →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-zinc-300 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Scientific boundary</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Measure aggressively. Claim conservatively.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">The platform can quantify camera-derived movement, run research movement-quality models, and link features to prospective injury literature. It does not label a person as injured or guarantee that an injury will occur from a webcam squat.</p>
          </div>
          <Link href="/research" className="border border-zinc-950 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-950 hover:text-white">Research & methodology</Link>
        </div>
      </section>
    </main>
  );
}
