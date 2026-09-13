import Link from "next/link";

const NAV = [
  { href: "/assessment", label: "Assessment" },
  { href: "/progress", label: "Progress" },
  { href: "/research", label: "Research" },
  { href: "/validation", label: "Validation" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-[#f8f8f5]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-max items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center bg-zinc-950 text-[11px] font-bold tracking-wide text-white">MS</span>
          <span className="hidden text-sm font-semibold tracking-tight text-zinc-950 sm:block">Movement Science Lab</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <nav aria-label="Primary navigation" className="hidden md:block">
            <div className="flex items-center gap-5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-zinc-600 transition hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          <Link
            href="/account"
            className="ml-2 border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          >
            Sign in / Account
          </Link>
        </div>
      </div>

      <nav aria-label="Mobile navigation" className="border-t border-zinc-200 md:hidden">
        <div className="mx-auto flex max-w-7xl overflow-x-auto px-4 sm:px-6">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="min-w-max px-3 py-2 text-xs font-medium text-zinc-600 first:pl-0">
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
