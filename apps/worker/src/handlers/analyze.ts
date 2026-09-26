import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  and,
  bugs,
  eq,
  evidence,
  evidenceDir,
  getDb,
  inArray,
  isNull,
  results,
  runs,
  testCases,
} from "@ai-qa/db";
import {
  aiClassify,
  heuristicClassify,
  type Classification,
  type FailureInput,
  type Severity,
} from "@ai-qa/engine";
import type { Handler } from "./types";

function readJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export const analyze: Handler = async (job) => {
  const { runId } = job.payloadJson as { runId?: unknown };
  if (typeof runId !== "string") throw new Error("payload.runId missing");
  const db = getDb();
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new Error(`run ${runId} not found`);

  const failed = db
    .select({ result: results, testCase: testCases })
    .from(results)
    .innerJoin(testCases, eq(testCases.id, results.caseId))
    .where(
      and(
        eq(results.runId, runId),
        inArray(results.status, ["failed", "blocked", "error"]),
        isNull(results.classification),
      ),
    )
    .all();

  const useAi = Boolean(process.env.ANTHROPIC_API_KEY);
  const warnings: string[] = [];
  let bugCount = 0;

  for (const { result, testCase } of failed) {
    const ev = db.select().from(evidence).where(eq(evidence.resultId, result.id)).all();
    const file = (kind: string) => ev.find((e) => e.kind === kind)?.path;
    const consoleFile = file("console");
    const networkFile = file("network");
    const pageFile = file("page");
    const input: FailureInput = {
      caseKey: testCase.caseKey,
      title: testCase.title,
      objective: testCase.objective ?? undefined,
      steps: testCase.stepsJson as string[],
      expected: testCase.expected ?? "",
      severity: testCase.severity as Severity,
      status: result.status as FailureInput["status"],
      errorText: result.errorText ?? "",
      consoleTail: consoleFile
        ? readJson<string[]>(join(evidenceDir(), runId, consoleFile), [])
        : [],
      pageExcerpt: pageFile ? readText(join(evidenceDir(), runId, pageFile)) : undefined,
      serverErrors: networkFile
        ? readJson<{ serverErrors: string[] }>(join(evidenceDir(), runId, networkFile), {
            serverErrors: [],
          }).serverErrors
        : [],
    };

    let c: Classification;
    if (useAi) {
      try {
        c = await aiClassify(input);
      } catch (err) {
        warnings.push(
          `${testCase.caseKey}: AI failed, used heuristic (${err instanceof Error ? err.message : String(err)})`,
        );
        c = heuristicClassify(input);
      }
    } else {
      c = heuristicClassify(input);
    }
    console.log(`  analyze: ${testCase.caseKey} -> ${c.class} (${c.source})`);

    const evidenceRefs = ev.length
      ? `\n\nEvidence: ${ev.map((e) => `${e.kind} ${runId}/${e.path}`).join(", ")}`
      : "";
    db.transaction((tx) => {
      tx.update(results)
        .set({ classification: c.class, analysis: c.analysis })
        .where(eq(results.id, result.id))
        .run();
      if (c.class !== "product_bug") return;
      // One open bug per case: a re-run that fails the same way updates nothing new.
      const open = tx
        .select({ id: bugs.id })
        .from(bugs)
        .innerJoin(results, eq(results.id, bugs.resultId))
        .where(
          and(
            eq(bugs.projectId, run.projectId),
            eq(bugs.status, "open"),
            eq(results.caseId, testCase.id),
          ),
        )
        .get();
      if (open) return;
      tx.insert(bugs)
        .values({
          projectId: run.projectId,
          resultId: result.id,
          title: c.title,
          severity: c.severity,
          analysis: c.analysis + evidenceRefs,
          classification: c.class,
        })
        .run();
      bugCount++;
    });
  }

  console.log(`  analyze: ${failed.length} failure(s), ${bugCount} new bug(s)`);
  return warnings.length ? { warning: warnings.join("; ") } : undefined;
};
