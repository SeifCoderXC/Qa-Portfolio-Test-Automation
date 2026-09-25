import { join } from "node:path";
import {
  and,
  asc,
  eq,
  evidence,
  evidenceDir,
  getDb,
  inArray,
  projects,
  results,
  runs,
  testCases,
} from "@ai-qa/db";
import { launchBrowser, runCase } from "@ai-qa/engine";
import { loadCredentials } from "../project";
import { enqueue } from "../queue";
import type { Handler } from "./types";

type Payload = { runId?: unknown; caseIds?: unknown };

/** Execute one queued run row. Also used by retest, which passes explicit caseIds. */
export async function executeRun(runId: string, caseIds?: string[]): Promise<void> {
  const db = getDb();
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new Error(`run ${runId} not found`);
  if (run.status !== "queued") throw new Error(`run ${runId} is ${run.status}, expected queued`);
  const project = db.select().from(projects).where(eq(projects.id, run.projectId)).get();
  if (!project) throw new Error(`project ${run.projectId} not found`);

  const planCases = db
    .select()
    .from(testCases)
    .where(eq(testCases.planId, run.planId))
    .orderBy(asc(testCases.caseKey))
    .all();
  const cases = caseIds?.length
    ? planCases.filter((c) => caseIds.includes(c.id))
    : planCases.some((c) => c.approved)
      ? planCases.filter((c) => c.approved)
      : planCases; // none approved: run all
  if (!cases.length) throw new Error("no cases to run");

  db.update(runs).set({ status: "running", startedAt: new Date() }).where(eq(runs.id, runId)).run();
  const runDir = join(evidenceDir(), runId);
  const credentials = loadCredentials(project.id);
  let anyNotPassed = false;
  let cancelled = false;

  const browser = await launchBrowser();
  try {
    for (const [i, c] of cases.entries()) {
      // Cancellation is checked between cases.
      if (
        db.select({ s: runs.status }).from(runs).where(eq(runs.id, runId)).get()?.s === "cancelled"
      ) {
        cancelled = true;
        break;
      }
      db.update(runs).set({ currentCaseKey: c.caseKey }).where(eq(runs.id, runId)).run();
      console.log(`  run: ${c.caseKey} ${c.title}`);

      const res = await runCase(browser, {
        baseUrl: project.baseUrl,
        testCase: { key: c.caseKey, steps: c.stepsJson as string[], expected: c.expected ?? "" },
        runDir,
        credentials,
        screenshotOnPass: i === 0 || i === cases.length - 1,
      });
      if (res.status !== "passed") anyNotPassed = true;
      console.log(
        `  run: ${c.caseKey} ${res.status} in ${res.durationMs}ms${res.errorText ? ` - ${res.errorText}` : ""}`,
      );

      db.transaction((tx) => {
        const row = tx
          .insert(results)
          .values({
            runId,
            caseId: c.id,
            status: res.status,
            durationMs: res.durationMs,
            errorText: res.errorText,
          })
          .returning()
          .get();
        if (res.evidence.length) {
          tx.insert(evidence)
            .values(res.evidence.map((e) => ({ resultId: row.id, kind: e.kind, path: e.path })))
            .run();
        }
      });
    }
  } finally {
    await browser.close();
  }

  db.update(runs)
    .set({
      status: cancelled ? "cancelled" : anyNotPassed ? "failed" : "passed",
      finishedAt: new Date(),
      currentCaseKey: null,
    })
    .where(and(eq(runs.id, runId), inArray(runs.status, ["running", "cancelled"])))
    .run();

  if (anyNotPassed) enqueue("analyze", { runId });
}

export const run: Handler = async (job) => {
  const { runId } = job.payloadJson as Payload;
  if (typeof runId !== "string") throw new Error("payload.runId missing");
  try {
    await executeRun(runId);
  } catch (err) {
    // A crashed run must not stay "running" forever.
    getDb()
      .update(runs)
      .set({ status: "failed", finishedAt: new Date(), currentCaseKey: null })
      .where(and(eq(runs.id, runId), inArray(runs.status, ["queued", "running"])))
      .run();
    throw err;
  }
};
