import Link from "next/link";
import { MovementAnalysisWorkspace } from "@/components/analysis/MovementAnalysisWorkspace";

const TOOLS = [
  { href: "/methodology", title: "Measurement methodology", text: "How camera-derived measurements and 2D projection proxies are calculated." },
  { href: "/validation", title: "Validation status", text: "What has been engineering-tested, internally validated, externally validated, or remains research-only." },
  { href: "/diagnostics", title: "Browser diagnostics", text: "Inspect browser, camera, and MediaPipe capability information." },
  { href: "/camera-lab", title: "Camera lab", text: "Test camera devices, resolution, FPS, and saved capture profiles." },
  { href: "/dual-camera-lab", title: "Experimental dual-camera capture", text: "Run two browser camera streams side-by-side for multi-view research." },
] as const;

export default function ResearchPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Research & Validation</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Advanced tools without cluttering the patient assessment.</h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">Research controls, provenance, rule configuration, reference comparison, diagnostics, and experimental camera tools remain available here. Research classifiers are kept separate from clinically validated outputs.</p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:shadow-md">
              <h2 className="font-semibold text-zinc-950">{tool.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{tool.text}</p>
              <p className="mt-4 text-sm font-semibold text-sky-700">Open →</p>
            </Link>
          ))}
        </div>

        <section className="mt-12 border-t border-zinc-200 pt-10">
          <div className="mb-6 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Advanced analysis workspace</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Raw metrics, sourced rules, trajectories, persistence, and reference comparison</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">This is the existing research interface preserved for technical users. Its controls are intentionally not part of the default patient flow.</p>
          </div>
          <MovementAnalysisWorkspace />
        </section>
      </div>
    </main>
  );
}
