import { getDb, jobs, runs, type Db } from "@ai-qa/db";
import { latestPlan } from "./plans";

type Job = typeof jobs.$inferSelect;
type Run = typeof runs.$inferSelect;

/** Create a queued run for the latest plan and the job that executes it. */
export function enqueueRun(
  projectId: string,
  opts: { type?: "run" | "retest"; caseIds?: string[] } = {},
): { ok: true; job: Job; run: Run } | { ok: false; error: string } {
  const plan = latestPlan(projectId);
  if (!plan) return { ok: false, error: "no plan yet; generate a plan first" };
  const db: Db = getDb();
  return db.transaction((tx) => {
    const run = tx.insert(runs).values({ projectId, planId: plan.id }).returning().get();
    const payload = opts.caseIds?.length
      ? { runId: run.id, caseIds: opts.caseIds }
      : { runId: run.id };
    const job = tx
      .insert(jobs)
      .values({ type: opts.type ?? "run", payloadJson: payload })
      .returning()
      .get();
    return { ok: true as const, job, run };
  });
}
