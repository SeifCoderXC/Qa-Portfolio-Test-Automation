"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Empty, SectionTitle, primaryButton, secondaryButton, when } from "./ui";

type TestCase = {
  id: string;
  caseKey: string;
  title: string;
  objective: string | null;
  stepsJson: string[];
  expected: string | null;
  severity: string;
  approved: boolean;
};
type Plan = { id: string; status: string; source: string; createdAt: string };
type Job = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  errorText: string | null;
};

export function PlansClient({
  project,
  mapPages,
  hasAi,
}: {
  project: { id: string; name: string; baseUrl: string };
  mapPages: number | null;
  hasAi: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const base = `/api/projects/${project.id}`;

  const load = useCallback(async () => {
    const [c, j] = await Promise.all([fetch(`${base}/cases`), fetch(`${base}/jobs`)]);
    if (c.ok) {
      const data = await c.json();
      setPlan(data.plan);
      setCases(data.cases);
    } else {
      setPlan(null);
      setCases([]);
    }
    if (j.ok) setJobs(await j.json());
  }, [base]);

  const active = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [active, load]);
  // When jobs finish, server components (map page count) may be stale.
  useEffect(() => {
    if (!active) router.refresh();
  }, [active, router]);

  async function enqueue(body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    if (data.runId) return router.push(`/runs/${data.runId}`);
    load();
  }

  async function approve(ids: string[] | "all", approved: boolean) {
    const res = await fetch(`${base}/cases/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, approved }),
    });
    if (res.ok) {
      const data = await res.json();
      setCases(data.cases);
      setPlan((p) => (p ? { ...p, status: data.planStatus } : p));
    }
  }

  const approvedCount = cases.filter((c) => c.approved).length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Plan</h1>
          <p className="text-sm text-muted">
            {project.name} · {mapPages == null ? "not mapped yet" : `${mapPages} page(s) mapped`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryButton}
            disabled={active}
            onClick={() => enqueue({ type: "discover" })}
          >
            {mapPages == null ? "Discover app" : "Re-discover"}
          </button>
          <button
            className={secondaryButton}
            disabled={active || mapPages == null}
            onClick={() => enqueue({ type: "plan" })}
          >
            Generate plan{hasAi ? " (AI)" : ""}
          </button>
          {hasAi && (
            <button
              className={secondaryButton}
              disabled={active || mapPages == null}
              onClick={() => enqueue({ type: "plan", heuristic: true })}
            >
              Offline plan
            </button>
          )}
          <button
            className={primaryButton}
            disabled={active || !cases.length}
            onClick={() => enqueue({ type: "run" })}
          >
            Run {approvedCount ? `${approvedCount} approved` : "all"}
          </button>
        </div>
      </div>

      {msg && (
        <p role="alert" className="text-sm text-rose-600">
          {msg}
        </p>
      )}

      {jobs.length > 0 && (
        <Card>
          <SectionTitle>Activity</SectionTitle>
          <ul className="grid grid-cols-1 gap-2 text-sm">
            {jobs.slice(0, 4).map((j) => (
              <li key={j.id} className="flex items-center gap-3">
                <Badge value={j.status} />
                <span className="font-medium">{j.type}</span>
                <span className="text-muted">{when(j.createdAt)}</span>
                {j.errorText && (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted" title={j.errorText}>
                    {j.errorText}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {active && (
            <p className="mt-3 text-xs text-muted">
              The worker picks jobs up within 2 seconds. Is `pnpm worker` running?
            </p>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle
          action={
            cases.length > 0 && (
              <div className="flex gap-3 text-sm">
                <button
                  className="whitespace-nowrap text-accent hover:underline"
                  onClick={() => approve("all", true)}
                >
                  Approve all
                </button>
                <button
                  className="text-muted hover:underline"
                  onClick={() => approve("all", false)}
                >
                  Clear
                </button>
              </div>
            )
          }
        >
          {plan
            ? `Test cases · ${plan.source} · ${approvedCount}/${cases.length} approved`
            : "Test cases"}
        </SectionTitle>
        {cases.length === 0 ? (
          <Empty>
            {mapPages == null
              ? "Discover the app, then generate a plan."
              : "No plan yet. Generate one."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {cases.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Approve ${c.caseKey}`}
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={c.approved}
                    onChange={(e) => approve([c.id], e.target.checked)}
                  />
                  <span className="w-14 shrink-0 font-mono text-xs text-muted">{c.caseKey}</span>
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm hover:text-accent"
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                  >
                    {c.title}
                  </button>
                  <Badge value={c.severity} />
                </div>
                {open === c.id && (
                  <div className="mt-3 ml-7 grid gap-2 rounded-lg bg-bg p-3 text-sm">
                    {c.objective && <p className="text-muted">{c.objective}</p>}
                    <ol className="list-decimal pl-5 font-mono text-xs">
                      {c.stepsJson.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    {c.expected && (
                      <p>
                        <span className="text-muted">Expected: </span>
                        {c.expected}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
