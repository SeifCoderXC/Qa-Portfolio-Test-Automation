import { handlers } from "./handlers";
import { claimNext, markDone, markFailed, type Job } from "./queue";

export async function processJob(job: Job): Promise<void> {
  const started = Date.now();
  console.log(`[job ${job.id.slice(0, 8)}] ${job.type} started`);
  try {
    const res = await handlers[job.type](job);
    const warning = res ? res.warning : undefined;
    markDone(job.id, warning);
    console.log(
      `[job ${job.id.slice(0, 8)}] ${job.type} done in ${Date.now() - started}ms` +
        (warning ? ` (warning: ${warning})` : ""),
    );
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    markFailed(job.id, text);
    console.error(`[job ${job.id.slice(0, 8)}] ${job.type} failed: ${text}`);
  }
}

/** Process queued jobs until none are left. Used by --drain and the demo. */
export async function drain(): Promise<number> {
  let n = 0;
  for (let job = claimNext(); job; job = claimNext()) {
    await processJob(job);
    n++;
  }
  return n;
}
