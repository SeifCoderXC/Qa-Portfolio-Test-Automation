"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type P = { id: string; name: string };

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/plans", label: "Plans" },
  { href: "/bugs", label: "Bugs" },
  { href: "/assistant", label: "Assistant" },
];

export function Nav({ projects, current }: { projects: P[]; current?: string }) {
  const path = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const p = params.get("p") ?? current;
  const q = p ? `?p=${p}` : "";

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href={`/${q}`} className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-white">
            QA
          </span>
          AI QA
        </Link>
        <nav className="flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={`${l.href}${q}`}
                className={`rounded-md px-2.5 py-1.5 ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        {projects.length > 0 && (
          <select
            aria-label="Project"
            className="ml-auto max-w-56 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
            value={p ?? ""}
            onChange={(e) =>
              router.push(
                `${path.startsWith("/runs") || path.startsWith("/bugs/") ? "/" : path}?p=${e.target.value}`,
              )
            }
          >
            {projects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </header>
  );
}
