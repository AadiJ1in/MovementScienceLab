"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-[70vh] bg-[#f5f5f2] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">This workspace hit an unexpected error.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          Your camera session may have been interrupted or a page component may have failed to load. Retry this screen first; if the problem continues, use Diagnostics before starting another assessment.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800">
            Retry screen
          </button>
          <Link href="/diagnostics" className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500">
            Open diagnostics
          </Link>
          <Link href="/" className="rounded-lg px-5 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950">
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}
