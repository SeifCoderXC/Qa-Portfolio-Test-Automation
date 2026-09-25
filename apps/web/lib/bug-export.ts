import type { BugForJira } from "@ai-qa/integrations";
import { bugDetail } from "./queries";

type Detail = NonNullable<ReturnType<typeof bugDetail>>;

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
    steps: (d.testCase?.stepsJson as string[] | undefined) ?? [],
    expected: d.testCase?.expected ?? undefined,
    errorText: d.result?.errorText ?? undefined,
    evidence: d.result ? d.evidence.map((e) => `data/evidence/${d.result!.runId}/${e.path}`) : [],
  };
}
