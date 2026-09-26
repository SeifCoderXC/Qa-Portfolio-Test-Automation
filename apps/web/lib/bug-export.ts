import { join } from "node:path";
import { evidenceDir } from "@ai-qa/db";
import type { Attachment, BugForJira } from "@ai-qa/integrations";
import { bugDetail } from "./queries";

type Detail = NonNullable<ReturnType<typeof bugDetail>>;

/** The runner's browser: Playwright Chromium (or installed Chrome) at Playwright's default viewport. */
const BROWSER = { browser: "Chromium via Playwright (desktop)", viewport: "1280×720" };

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  webm: "video/webm",
  page: "text/plain",
  console: "application/json",
  network: "application/json",
};

/** Everything a tracker needs, without secrets. Used for Jira and the bug.json download. */
export function bugForTracker(d: Detail): BugForJira {
  return {
    title: d.bug.title,
    severity: d.bug.severity,
    classification: d.bug.classification,
    analysis: (d.bug.analysis ?? "").split("\n\nEvidence: ")[0]!,
    baseUrl: d.project?.baseUrl ?? "",
    caseKey: d.testCase?.caseKey,
    caseTitle: d.testCase?.title,
    objective: d.testCase?.objective || undefined,
    preconditions: d.testCase?.preconditions || undefined,
    steps: (d.testCase?.stepsJson as string[] | undefined) ?? [],
    expected: d.testCase?.expected ?? undefined,
    errorText: d.result?.errorText ?? undefined,
    environment: {
      ...BROWSER,
      testedAt: d.run?.startedAt ? new Date(d.run.startedAt).toISOString() : undefined,
      runId: d.result?.runId,
    },
    evidence: d.evidence.map((e) => e.path.split("/").pop()!),
  };
}

/** Evidence files on disk, in the order a developer wants them. */
export function bugAttachments(d: Detail): Attachment[] {
  if (!d.result) return [];
  const order = ["png", "page", "console", "network", "webm"];
  return [...d.evidence]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((e) => ({
      path: join(evidenceDir(), d.result!.runId, e.path),
      contentType: CONTENT_TYPES[e.kind] ?? "application/octet-stream",
    }));
}
