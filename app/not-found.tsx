import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[70vh] bg-[#f5f5f2] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">404 · Page not found</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">That Movement Science Lab route does not exist.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">Use the guided assessment for the primary workflow, or return to the research and validation workspaces from the navigation.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/assessment" className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800">Run assessment</Link>
          <Link href="/" className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500">Return home</Link>
        </div>
      </div>
    </main>
  );
}
