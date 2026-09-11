import Link from "next/link";

const NAV = [
  { href: "/assessment", label: "Assessment" },
  { href: "/progress", label: "Progress" },
  { href: "/camera-lab", label: "Camera Lab" },
  { href: "/research", label: "Research" },
  { href: "/validation", label: "Validation" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">MS</span>
          <span className="hidden text-sm font-semibold tracking-tight text-zinc-950 sm:block">Movement Science Lab</span>
        </Link>
        <nav aria-label="Primary navigation" className="overflow-x-auto">
          <div className="flex min-w-max items-center gap-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-sky-500">
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
