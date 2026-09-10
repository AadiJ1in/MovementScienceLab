import Link from "next/link";
import { BrowserDiagnostics } from "@/components/diagnostics/BrowserDiagnostics";

export default function DiagnosticsPage() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Movement Science Lab
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Camera & browser diagnostics
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600">
            Use this page to identify local browser, HTTPS, webcam-API, WebAssembly, and graphics-runtime problems before beginning movement capture.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900">
              Back to analysis
            </Link>
            <Link href="/methodology" className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
              Measurement methodology
            </Link>
          </div>
        </header>

        <BrowserDiagnostics />
      </div>
    </main>
  );
}
