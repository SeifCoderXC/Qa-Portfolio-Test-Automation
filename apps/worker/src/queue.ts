import { and, asc, eq, getDb, jobs, type JobType } from "@ai-qa/db";

export type Job = typeof jobs.$inferSelect;

export function enqueue(type: JobType, payload: Record<string, unknown> = {}): Job {
  return getDb().insert(jobs).values({ type, payloadJson: payload }).returning().get();
}

/** Lock the oldest queued job. The status guard makes the UPDATE the lock. */
export function claimNext(): Job | undefined {
  const db = getDb();
  const next = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.status, "queued"))
    .orderBy(asc(jobs.createdAt))
    .limit(1)
    .get();
  if (!next) return undefined;
  return db
    .update(jobs)
    .set({ status: "running", lockedAt: new Date() })
    .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
    .returning()
    .get();
}

export function markDone(id: string, warning?: string): void {
  getDb()
    .update(jobs)
    .set({ status: "done", finishedAt: new Date(), errorText: warning ?? null })
    .where(eq(jobs.id, id))
    .run();
}

export function markFailed(id: string, errorText: string): void {
  getDb()
    .update(jobs)
    .set({ status: "failed", finishedAt: new Date(), errorText: errorText.slice(0, 4000) })
    .where(eq(jobs.id, id))
    .run();
}

/**
 * Single-worker MVP: anything still "running" at startup was orphaned by a crash.
 * Fail it instead of re-queueing, so a job that kills the worker cannot loop forever.
 */
export function failOrphans(): number {
  return getDb()
    .update(jobs)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorText: "worker restarted while job was running",
    })
    .where(eq(jobs.status, "running"))
    .run().changes;
}
