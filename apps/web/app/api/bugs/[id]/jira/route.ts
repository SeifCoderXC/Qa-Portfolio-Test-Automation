import { bugs, eq, getDb } from "@ai-qa/db";
import { createIssue, jiraConfig, JiraError } from "@ai-qa/integrations";
import { bugForTracker } from "@/lib/bug-export";
import { error, json } from "@/lib/http";
import { bugDetail } from "@/lib/queries";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = bugDetail(id);
  if (!detail) return error(404, "bug not found");
  if (detail.bug.jiraKey) return json({ error: "already pushed", key: detail.bug.jiraKey }, 409);

  const cfg = jiraConfig();
  if (!cfg)
    return json(
      { error: "Jira not configured", notConfigured: true, download: `/api/bugs/${id}/json` },
      400,
    );

  try {
    const issue = await createIssue(bugForTracker(detail), cfg);
    getDb().update(bugs).set({ jiraKey: issue.key, status: "pushed" }).where(eq(bugs.id, id)).run();
    return json(issue, 201);
  } catch (err) {
    // 502: the upstream tracker failed. Message only; never echo headers or config.
    return error(502, err instanceof JiraError ? err.message : "Jira request failed");
  }
}
