import { getDb, jobs, runs, type Db } from "@ai-qa/db";
import { latestPlan } from "./plans";

type Job = typeof jobs.$inferSelect;
type Run = typeof runs.$inferSelect;

/** Create a queued run for the latest plan and the job that executes it. */
export function enqueueRun(
  projectId: string,
  opts: { type?: "run" | "retest"; caseIds?: string[]; planId?: string; bugId?: string } = {},
): { ok: true; job: Job; run: Run } | { ok: false; error: string } {
  const planId = opts.planId ?? latestPlan(projectId)?.id;
  if (!planId) return { ok: false, error: "no plan yet; generate a plan first" };
  const db: Db = getDb();
  return db.transaction((tx) => {
    const run = tx.insert(runs).values({ projectId, planId }).returning().get();
    const payload = {
      runId: run.id,
      ...(opts.caseIds?.length && { caseIds: opts.caseIds }),
      ...(opts.bugId && { bugId: opts.bugId }),
    };
    const job = tx
      .insert(jobs)
      .values({ type: opts.type ?? "run", payloadJson: payload })
      .returning()
      .get();
    return { ok: true as const, job, run };
  });
}
