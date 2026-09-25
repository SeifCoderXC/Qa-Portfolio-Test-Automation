import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

const TONES: Record<string, string> = {
  passed: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  blocked: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  error: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  running: "bg-accent-soft text-accent",
  queued: "bg-zinc-500/12 text-muted",
  cancelled: "bg-zinc-500/12 text-muted",
  done: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  open: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  pushed: "bg-accent-soft text-accent",
  ignored: "bg-zinc-500/12 text-muted",
  critical: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  low: "bg-zinc-500/12 text-muted",
  product_bug: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  test_bug: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  env: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  flake: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  unknown: "bg-zinc-500/12 text-muted",
};

export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[value] ?? TONES.unknown}`}
    >
      {value.replace("_", " ")}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButton = `${buttonClass} bg-accent text-white hover:opacity-90`;
export const secondaryButton = `${buttonClass} border border-line bg-surface hover:bg-bg`;

export function ms(n: number | null | undefined) {
  if (n == null) return "";
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}

export function when(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
