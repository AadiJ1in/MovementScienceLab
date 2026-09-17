"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/assessment", label: "Assessment" },
  { href: "/progress", label: "Progress" },
  { href: "/research", label: "Research" },
  { href: "/validation", label: "Validation" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/90 bg-[#f8f8f5]/95 backdrop-blur-xl supports-[backdrop-filter]:bg-[#f8f8f5]/88">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-4"
          aria-label="Movement Science Lab home"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-[11px] font-bold tracking-[0.12em] text-white shadow-sm transition group-hover:bg-zinc-800">
            MS
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-zinc-950">Movement Science Lab</span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:block">Research prototype</span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 lg:gap-4">
          <nav aria-label="Primary navigation" className="hidden md:block">
            <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white/80 p-1 shadow-sm">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 ${
                      active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <Link
            href="/account"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 sm:inline-flex"
          >
            Account
          </Link>
          <Link
            href="/assessment"
            className="inline-flex min-w-max items-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          >
            Run assessment
          </Link>
        </div>
      </div>

      <nav aria-label="Mobile navigation" className="border-t border-zinc-200/80 bg-white/70 md:hidden">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-1.5 sm:px-6">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`min-w-max rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/account" className="min-w-max rounded-lg px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 sm:hidden">
            Account
          </Link>
        </div>
      </nav>
    </header>
  );
}
