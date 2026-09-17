export default function Loading() {
  return (
    <main className="min-h-[65vh] bg-[#f5f5f2] px-4 py-12 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading Movement Science Lab">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-3 w-40 rounded bg-zinc-200" />
        <div className="mt-5 h-10 max-w-2xl rounded bg-zinc-200" />
        <div className="mt-3 h-5 max-w-xl rounded bg-zinc-200" />
        <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
          <div className="aspect-video min-h-[320px] rounded-2xl bg-zinc-900" />
          <div className="space-y-4">
            <div className="h-36 rounded-2xl bg-white ring-1 ring-zinc-200" />
            <div className="h-52 rounded-2xl bg-white ring-1 ring-zinc-200" />
          </div>
        </div>
      </div>
    </main>
  );
}
