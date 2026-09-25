import { and, eq, getDb, inArray, runs } from "@ai-qa/db";
import { executeRun } from "./run";
import type { Handler } from "./types";

/** Same as run, restricted to the given cases (from a bug page or the assistant). */
export const retest: Handler = async (job) => {
  const { runId, caseIds } = job.payloadJson as { runId?: unknown; caseIds?: unknown };
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
};
