"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, Empty, SectionTitle, ms, when } from "./ui";

type Evidence = { id: string; kind: string; path: string };
type Result = {
  id: string;
  caseKey: string;
  title: string;
  status: string;
  durationMs: number | null;
  errorText: string | null;
  classification: string | null;
  analysis: string | null;
  evidence: Evidence[];
  bugId: string | null;
};
type Detail = {
  run: {
    id: string;
    projectId: string;
    status: string;
    currentCaseKey: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
  results: Result[];
};

const LIVE = new Set(["queued", "running"]);

export function RunView({ initial }: { initial: Detail }) {
  const [d, setD] = useState(initial);
  const live = LIVE.has(d.run.status);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/runs/${d.run.id}`);
      if (res.ok) setD(await res.json());
    }, 2000);
    return () => clearInterval(t);
  }, [live, d.run.id]);

  const passed = d.results.filter((r) => r.status === "passed").length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/?p=${d.run.projectId}`} className="text-sm text-muted hover:underline">
            ← Overview
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            Run <Badge value={d.run.status} />
          </h1>
          <p className="text-sm text-muted">
            {when(d.run.startedAt) || "waiting for the worker"} · {passed}/{d.results.length} passed
          </p>
        </div>
      </div>

      {live && (
        <p
          className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent"
          aria-live="polite"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {d.run.currentCaseKey
            ? `Worker is running case ${d.run.currentCaseKey}`
            : "Queued. Waiting for the worker (pnpm worker)."}
        </p>
      )}

      <Card>
        <SectionTitle>Results</SectionTitle>
        {d.results.length === 0 ? (
          <Empty>No results yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {d.results.map((r) => {
              const png = r.evidence.find((e) => e.kind === "png");
              return (
                <li key={r.id} className="grid grid-cols-1 gap-2 py-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 font-mono text-xs text-muted">{r.caseKey}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="text-xs text-muted tabular-nums">{ms(r.durationMs)}</span>
                    <Badge value={r.classification} />
                    <Badge value={r.status} />
                  </div>
                  {(r.errorText || r.evidence.length > 0) && (
                    <div className="ml-17 flex flex-wrap items-start gap-4">
                      {png && (
                        <a
                          href={`/api/evidence/${png.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/evidence/${png.id}`}
                            alt={`${r.caseKey} screenshot`}
                            className="h-20 w-32 rounded-md border border-line object-cover object-top"
                          />
                        </a>
                      )}
                      <div className="grid min-w-0 flex-1 gap-1 text-xs">
                        {r.errorText && (
                          <p className="font-mono break-words text-rose-600 dark:text-rose-400">
                            {r.errorText}
                          </p>
                        )}
                        {r.analysis && <p className="text-muted">{r.analysis}</p>}
                        <p className="flex flex-wrap gap-3">
                          {r.evidence.map((e) => (
                            <a
                              key={e.id}
                              href={`/api/evidence/${e.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent hover:underline"
                            >
                              {e.path.split("/").pop()}
                            </a>
                          ))}
                          {r.bugId && (
                            <Link
                              href={`/bugs/${r.bugId}`}
                              className="font-medium text-accent hover:underline"
                            >
                              Bug →
                            </Link>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
