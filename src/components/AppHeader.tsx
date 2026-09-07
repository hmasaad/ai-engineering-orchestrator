"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "New ticket" },
  { href: "/run", label: "Run" },
  { href: "/evals", label: "Evals" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="no-print border-b border-rule bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-serif text-xl tracking-tight text-navy">
            Engineering Orchestrator
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.18em] text-ink-soft sm:inline">
            Control plane
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" suppressHydrationWarning>
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 transition ${
                  active ? "bg-navy text-paper" : "text-ink-soft hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
