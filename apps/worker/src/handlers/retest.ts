import { and, bugs, eq, getDb, inArray, results, runs, testCases } from "@ai-qa/db";
import { jiraConfig, syncRetest } from "@ai-qa/integrations";
import { executeRun } from "./run";
import type { Handler } from "./types";

/**
 * Same as run, restricted to the given cases (from a bug page or the assistant).
 * When started from a bug that is in Jira, the verdict is reported there (see syncRetest).
 */
export const retest: Handler = async (job) => {
  const { runId, caseIds, bugId } = job.payloadJson as {
    runId?: unknown;
    caseIds?: unknown;
    bugId?: unknown;
  };
  if (typeof runId !== "string") throw new Error("payload.runId missing");
  if (!Array.isArray(caseIds) || !caseIds.length || !caseIds.every((c) => typeof c === "string")) {
    throw new Error("payload.caseIds must be a non-empty string array");
  }
  try {
    await executeRun(runId, caseIds as string[]);
  } catch (err) {
    getDb()
      .update(runs)
      .set({ status: "failed", finishedAt: new Date(), currentCaseKey: null })
      .where(and(eq(runs.id, runId), inArray(runs.status, ["queued", "running"])))
      .run();
    throw err;
  }
  if (typeof bugId === "string") return reportToJira(bugId, runId);
};

async function reportToJira(bugId: string, runId: string) {
  const db = getDb();
  const bug = db.select().from(bugs).where(eq(bugs.id, bugId)).get();
  const cfg = jiraConfig();
  if (!bug?.jiraKey || !cfg) return;
  const row = db
    .select({ status: results.status, errorText: results.errorText, caseKey: testCases.caseKey })
    .from(results)
    .innerJoin(testCases, eq(testCases.id, results.caseId))
    .where(eq(results.runId, runId))
    .get();
  if (!row) return;
  try {
    const s = await syncRetest(
      bug.jiraKey,
      { passed: row.status === "passed", caseKey: row.caseKey, runId, errorText: row.errorText },
      cfg,
    );
    console.log(`  jira: ${bug.jiraKey} ${s.statusBefore} -> ${s.statusAfter} (${s.action})`);
  } catch (err) {
    // The retest itself succeeded; a tracker outage must not fail the job.
    return { warning: `Jira sync failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
