import Link from "next/link";
import { notFound } from "next/navigation";
import { BugActions } from "@/components/bug-actions";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { jiraConfig } from "@ai-qa/integrations";
import { bugDetail } from "@/lib/queries";

export default async function BugPage({ params }: { params: Promise<{ id: string }> }) {
  const d = bugDetail((await params).id);
  if (!d) notFound();
  const { bug, testCase, result, evidence, latest } = d;
  // The stored analysis ends with evidence paths (for Jira); the page shows the files instead.
  const analysis = (bug.analysis ?? "").split("\n\nEvidence: ")[0];
  const shots = evidence.filter((e) => e.kind === "png");
  const files = evidence.filter((e) => e.kind !== "png");
  const jiraCfg = jiraConfig();

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <Link href={`/bugs?p=${bug.projectId}`} className="text-sm text-muted hover:underline">
          ← Bugs
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{bug.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge value={bug.severity} />
          <Badge value={bug.classification} />
          <Badge value={bug.status} />
          {bug.jiraKey && <span className="font-mono text-muted">{bug.jiraKey}</span>}
          {result && (
            <Link href={`/runs/${result.runId}`} className="text-accent hover:underline">
              from run →
            </Link>
          )}
          {latest && latest.runId !== result?.runId && (
            <span className="text-muted">
              latest retest: <Badge value={latest.status} />
            </span>
          )}
        </div>
      </div>

      <BugActions
        bugId={bug.id}
        jiraKey={bug.jiraKey}
        jiraUrl={bug.jiraKey && jiraCfg ? `${jiraCfg.baseUrl}/browse/${bug.jiraKey}` : null}
        jiraReady={jiraCfg !== null}
        canRetest={Boolean(testCase)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle>Analysis</SectionTitle>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis}</p>
          {result?.errorText && (
            <p className="mt-4 font-mono text-xs break-words text-rose-600 dark:text-rose-400">
              {result.errorText}
            </p>
          )}
        </Card>
        {testCase && (
          <Card className="lg:col-span-2">
            <SectionTitle>
              {testCase.caseKey} · {testCase.title}
            </SectionTitle>
            <ol className="list-decimal pl-5 font-mono text-xs">
              {(testCase.stepsJson as string[]).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {testCase.expected && (
              <p className="mt-3 text-sm">
                <span className="text-muted">Expected: </span>
                {testCase.expected}
              </p>
            )}
          </Card>
        )}
      </div>

      {(shots.length > 0 || files.length > 0) && (
        <Card>
          <SectionTitle>Evidence</SectionTitle>
          <div className="flex flex-wrap gap-4">
            {shots.map((e) => (
              <a key={e.id} href={`/api/evidence/${e.id}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/evidence/${e.id}`}
                  alt="failure screenshot"
                  className="h-40 w-64 rounded-lg border border-line object-cover object-top"
                />
              </a>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            {files.map((e) => (
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
          </p>
        </Card>
      )}
    </div>
  );
}
