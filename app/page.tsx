import Link from "next/link";

const WORKFLOW = [
  {
    number: "01",
    title: "Calibrate the capture",
    text: "Confirm framing, landmark visibility, lighting, image sharpness, and short-window camera stability before collecting measurements.",
  },
  {
    number: "02",
    title: "Run a standardized protocol",
    text: "Follow a paced five-repetition knee-control screen while browser-local pose estimation produces transparent 2D movement features.",
  },
  {
    number: "03",
    title: "Review evidence, not a black box",
    text: "See tracking quality, measurement-validation status, movement features, and research context without turning a webcam result into a diagnosis.",
  },
] as const;

const FEATURES = [
  {
    eyebrow: "Measurement",
    title: "Visible biomechanics",
    text: "Inspect knee-deviation proxies, trunk lean, pelvic-line obliquity, repetition behavior, capture quality, and metric provenance while you move.",
    href: "/assessment",
  },
  {
    eyebrow: "Validation",
    title: "Accuracy status stays attached",
    text: "Tracking confidence and empirical measurement validity are kept separate so a clean pose estimate is never presented as proof of clinical accuracy.",
    href: "/validation",
  },
  {
    eyebrow: "AI research",
    title: "Multimodal injury-risk intelligence",
    text: "Combine MediaPipe biomechanics with injury history, readiness, training exposure, and longitudinal research features in an explainable model pipeline.",
    href: "/research/injury-risk-ai",
  },
  {
    eyebrow: "Progress",
    title: "Comparable sessions over time",
    text: "Longitudinal views compare compatible exercise, camera, measurement-definition, and implementation versions before showing a trend.",
    href: "/progress",
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f5f2] text-zinc-950">
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <div className="grid gap-8 border-b border-zinc-300 pb-8 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Movement Science Lab</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800">Validation-aware research prototype</span>
            </div>
            <h1 className="mt-5 max-w-5xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Turn a webcam into a transparent movement-measurement workspace.
            </h1>
          </div>

          <div>
            <p className="text-base leading-7 text-zinc-600">
              Browser-local pose tracking, standardized assessments, validation-aware biomechanics, and longitudinal research data—built to show exactly what is measured and what remains unproven.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/assessment" className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800">Run guided assessment</Link>
              <Link href="/camera-lab" className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500">Open motion capture lab</Link>
              <Link href="/research/injury-risk-ai" className="rounded-lg border border-sky-700 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100">Open injury-risk AI</Link>
            </div>
          </div>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl bg-zinc-200 ring-1 ring-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Browser-local pose", "Camera frames stay in the assessment browser workflow."],
            ["Standardized protocol", "A paced five-rep workflow reduces avoidable capture variability."],
            ["Validation-aware metrics", "Tracking quality is separated from empirical measurement accuracy."],
            ["Multimodal injury AI", "Research modeling can combine MediaPipe biomechanics with history, readiness, and training exposure."],
          ].map(([title, text]) => (
            <div key={title} className="bg-white px-5 py-4">
              <p className="text-sm font-semibold text-zinc-950">{title}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-px overflow-hidden rounded-2xl bg-zinc-300 ring-1 ring-zinc-300 lg:grid-cols-[1.5fr_.8fr]">
          <Link href="/assessment" className="group relative min-h-[500px] overflow-hidden bg-[#101010] p-6 text-white sm:p-8">
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Guided knee-control assessment</span>
                <span className="text-xs font-medium text-emerald-300">MediaPipe pose · local processing</span>
              </div>

              <div className="my-10 flex flex-1 items-center justify-center">
                <div className="relative h-72 w-56 rounded-3xl border border-white/15 bg-white/[0.02] shadow-2xl shadow-sky-500/5">
                  <div className="absolute left-1/2 top-6 h-9 w-9 -translate-x-1/2 rounded-full border border-sky-200/80" />
                  <div className="absolute left-1/2 top-16 h-28 w-px -translate-x-1/2 bg-sky-200/65" />
                  <div className="absolute left-10 right-10 top-[88px] h-px bg-sky-200/65" />
                  <div className="absolute left-[73px] top-[178px] h-24 w-px rotate-[22deg] bg-sky-200/65" />
                  <div className="absolute right-[73px] top-[178px] h-24 w-px -rotate-[22deg] bg-sky-200/65" />
                  <div className="absolute left-6 top-[210px] rounded-lg border border-amber-300/50 bg-black/75 px-2.5 py-1.5 text-[10px] font-medium text-amber-100">Live 2D knee proxy</div>
                  <div className="absolute right-4 top-5 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2.5 py-1 text-[10px] text-emerald-200">Tracking quality</div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Primary demo path</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">From camera setup to interpretable movement data in one guided flow.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                  Calibrate the image, complete the paced protocol, inspect live biomechanics, and review what each result can—and cannot—support.
                </p>
                <p className="mt-5 text-sm font-semibold">Start assessment →</p>
              </div>
            </div>
          </Link>

          <div className="grid gap-px bg-zinc-300 sm:grid-cols-2 lg:grid-cols-1">
            <Link href="/validation" className="bg-white p-6 transition hover:bg-zinc-50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Measurement accuracy</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">Know which metrics are validated, pending, or proxy-only.</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600">The validation workspace keeps empirical error, tracking quality, measurement method, and acceptance criteria separate.</p>
              <p className="mt-5 text-sm font-semibold">Review validation →</p>
            </Link>
            <Link href="/progress" className="bg-white p-6 transition hover:bg-zinc-50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Longitudinal analysis</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">Compare compatible movement sessions over time.</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600">Progress views filter incompatible measurement definitions and capture contexts before presenting a change as a trend.</p>
              <p className="mt-5 text-sm font-semibold">Open progress →</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[.65fr_1.35fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Workflow</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">A demo path designed to explain itself.</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">Every stage exposes the capture condition, measurement logic, and interpretation boundary rather than hiding them behind a single score.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl bg-zinc-200 ring-1 ring-zinc-200 md:grid-cols-3">
            {WORKFLOW.map((item) => (
              <div key={item.number} className="bg-white p-5">
                <p className="text-xs font-semibold text-zinc-400">{item.number}</p>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-zinc-300 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Platform</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">What the system actually does</h2>
          </div>
          <Link href="/methodology" className="hidden text-sm font-semibold text-zinc-600 underline underline-offset-4 hover:text-zinc-950 sm:block">Read methodology</Link>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl bg-zinc-200 ring-1 ring-zinc-200 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((item) => (
            <Link key={item.title} href={item.href} className="group min-h-[240px] bg-white p-5 transition hover:bg-zinc-50">
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
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              The platform can quantify camera-derived movement, evaluate capture quality, organize research models, and link features to evidence. It does not diagnose injury, prescribe treatment, or guarantee that a future injury will occur from a webcam movement screen.
            </p>
          </div>
          <Link href="/research" className="rounded-lg border border-zinc-950 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-950 hover:text-white">Research & methodology</Link>
        </div>
      </section>
    </main>
  );
}
