import Link from "next/link";
import { MovementAnalysisWorkspace } from "@/components/analysis/MovementAnalysisWorkspace";

const TOOLS = [
  { href: "/research/acl-risk-ai", title: "ACL tear prediction research AI", text: "ACL-only research workspace combining MediaPipe landing mechanics, prior ACL history, strength balance, jump kinetics, exposure, and an explicit prospective prediction formula." },
  { href: "/research/measurement-accuracy", title: "Measurement accuracy", text: "Audit MAE, RMSE, bias, limits of agreement, ICC, SEM, MDC95, device strata, and metric validation status." },
  { href: "/methodology", title: "Measurement methodology", text: "How camera-derived measurements and 2D projection proxies are calculated." },
  { href: "/validation", title: "Validation status", text: "What has been engineering-tested, internally validated, externally validated, or remains research-only." },
  { href: "/diagnostics", title: "Browser diagnostics", text: "Inspect browser, camera, and MediaPipe capability information." },
  { href: "/camera-lab", title: "Camera lab", text: "Test camera devices, resolution, FPS, and saved capture profiles." },
  { href: "/dual-camera-lab", title: "Experimental dual-camera capture", text: "Run two browser camera streams side-by-side for multi-view ACL biomechanics research." },
] as const;

export default function ResearchPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">ACL Research & Validation</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">ACL-focused biomechanics and prospective prediction research.</h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">The prediction program is now intentionally narrow: future medically confirmed noncontact/indirect-contact ACL rupture. Research controls, measurement validation, provenance, diagnostics, and camera tools remain available here without turning an unvalidated screening signal into a clinical probability.</p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:shadow-md">
              <h2 className="font-semibold text-zinc-950">{tool.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{tool.text}</p>
              <p className="mt-4 text-sm font-semibold text-emerald-700">Open →</p>
            </Link>
          ))}
        </div>

        <section className="mt-12 border-t border-zinc-200 pt-10">
          <div className="mb-6 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Advanced measurement workspace</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Raw metrics, sourced rules, trajectories, persistence, and reference comparison</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">The general movement-analysis tools remain available for measurement engineering, but the injury-prediction research target is ACL-only.</p>
          </div>
          <MovementAnalysisWorkspace />
        </section>
      </div>
    </main>
  );
}
