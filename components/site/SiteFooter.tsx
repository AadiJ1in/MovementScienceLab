import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/methodology", label: "Methodology" },
  { href: "/validation", label: "Measurement validation" },
  { href: "/research", label: "Research" },
  { href: "/diagnostics", label: "Diagnostics" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.35fr_.65fr] lg:px-8">
        <div>
          <p className="text-sm font-semibold tracking-tight text-zinc-950">Movement Science Lab</p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">
            Research software for camera-derived movement measurement and longitudinal analysis. It does not diagnose injury, replace a clinician, or establish future injury probability from a webcam assessment.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold text-zinc-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Validation-aware research prototype
          </div>
        </div>

        <nav aria-label="Footer navigation" className="md:justify-self-end">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4 md:grid-cols-2">
            {FOOTER_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="font-medium text-zinc-600 transition hover:text-zinc-950">
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </footer>
  );
}
