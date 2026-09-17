import Link from "next/link";
import { KneeRiskAssessment } from "@/components/assessment/KneeRiskAssessment";

const TOOLS = [
  {
    href: "/camera-lab",
    eyebrow: "Capture instrument",
    title: "Motion capture lab",
    text: "Inspect landmark visibility, frame timing, capture quality, and the Stage 1 browser-local pose stream before interpreting measurements.",
  },
  {
    href: "/assessment/general",
    eyebrow: "Exploratory analysis",
    title: "General movement assessment",
    text: "Run a broader movement-analysis workspace when you need measurements outside the guided five-rep knee-control protocol.",
  },
  {
    href: "/assessment/single-leg-knee-control",
    eyebrow: "Research screen",
    title: "Single-leg knee control",
    text: "Use the focused single-leg research workflow with the same conservative measurement and evidence boundaries.",
  },
  {
    href: "/diagnostics",
    eyebrow: "Pre-demo check",
    title: "Browser diagnostics",
    text: "Confirm camera APIs, browser support, and runtime prerequisites before a presentation or data-collection session.",
  },
] as const;

export default function AssessmentPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <KneeRiskAssessment />

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="border-t border-zinc-300 pt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Advanced workspace</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Research and troubleshooting instruments</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-zinc-600">
              The guided assessment above is the primary demo path. Use these tools when you need deeper capture telemetry, alternate research protocols, or a browser readiness check.
            </p>
          </div>

          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl bg-zinc-200 ring-1 ring-zinc-200 md:grid-cols-2 xl:grid-cols-4">
            {TOOLS.map((tool) => (
              <Link key={tool.href} href={tool.href} className="group min-h-[220px] bg-white p-5 transition hover:bg-zinc-50 focus-visible:z-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{tool.eyebrow}</p>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-zinc-950">{tool.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{tool.text}</p>
                <p className="mt-6 text-sm font-semibold text-zinc-950">Open tool →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
