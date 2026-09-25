import Link from "next/link";
import { NewProjectForm } from "@/components/new-project";
import { Badge, ButtonLink, Card, Empty, SectionTitle, Stat, ms, when } from "@/components/ui";
import { overview, pickProject } from "@/lib/queries";

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const project = pickProject((await searchParams).p);

  if (!project) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Test a web app</h1>
        <p className="mt-1 mb-6 text-muted">
          Add the URL. AI QA maps it, writes tests, runs them in Chromium and files proven bugs.
        </p>
        <Card>
          <NewProjectForm />
        </Card>
      </div>
    );
  }

  const o = overview(project.id);
  const q = `?p=${project.id}`;
  const lastRunLabel = o.lastRun ? (
    <>
      last run {when(o.lastRun.finishedAt ?? o.lastRun.startedAt)} ·{" "}
      <Badge value={o.lastRun.status} />
    </>
  ) : (
    "no runs yet"
  );

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <a
            href={project.baseUrl}
            className="text-sm text-muted hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {project.baseUrl}
          </a>
        </div>
        <ButtonLink href={`/plans${q}`}>Plan &amp; run tests →</ButtonLink>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Tests"
          value={o.tests}
          hint={
            o.plan
              ? `latest plan · ${o.plan.source}`
              : o.mapPages != null
                ? `${o.mapPages} page(s) mapped, no plan yet`
                : "run discovery first"
          }
        />
        <Stat
          label="Passed"
          value={<span className="text-emerald-600 dark:text-emerald-400">{o.passed}</span>}
          hint={lastRunLabel}
        />
        <Stat
          label="Failed"
          value={
            <span className={o.failed ? "text-rose-600 dark:text-rose-400" : ""}>{o.failed}</span>
          }
          hint={`${o.openBugs.length} open bug(s)`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <SectionTitle>Recent results</SectionTitle>
          {o.recentResults.length === 0 ? (
            <Empty>No results yet.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {o.recentResults.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/runs/${r.runId}`}
                    className="flex items-center gap-3 py-2.5 text-sm hover:text-accent"
                  >
                    <span className="w-14 shrink-0 font-mono text-xs text-muted">{r.caseKey}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="text-xs text-muted tabular-nums">{ms(r.durationMs)}</span>
                    <Badge value={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 min-w-0 content-start gap-6 lg:col-span-2">
          <Card>
            <SectionTitle>Runs</SectionTitle>
            {o.recentRuns.length === 0 ? (
              <Empty>No runs yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {o.recentRuns.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/runs/${r.id}`}
                      className="flex items-center gap-3 py-2.5 text-sm hover:text-accent"
                    >
                      <span className="flex-1 text-muted">{when(r.startedAt) || "queued"}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {r.passed}/{r.total}
                      </span>
                      <Badge value={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <SectionTitle action={<ButtonLink href={`/bugs${q}`}>All</ButtonLink>}>
              Open bugs
            </SectionTitle>
            {o.openBugs.length === 0 ? (
              <Empty>No open bugs.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {o.openBugs.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/bugs/${b.id}`}
                      className="flex items-center gap-3 py-2.5 text-sm hover:text-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">{b.title}</span>
                      <Badge value={b.severity} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <details className="rounded-xl border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-medium">New project</summary>
        <div className="mt-4">
          <NewProjectForm />
        </div>
      </details>
    </div>
  );
}
