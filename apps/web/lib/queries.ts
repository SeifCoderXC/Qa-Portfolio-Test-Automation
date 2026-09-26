import {
  and,
  appMaps,
  asc,
  bugs,
  desc,
  eq,
  evidence,
  getDb,
  inArray,
  jobs,
  projects,
  results,
  runs,
  sql,
  testCases,
} from "@ai-qa/db";
import { latestPlan } from "./plans";

export type Project = typeof projects.$inferSelect;

export function listProjects(): Project[] {
  return getDb().select().from(projects).orderBy(desc(projects.createdAt)).all();
}

/** The project named by ?p=, else the newest one. */
export function pickProject(id: string | undefined): Project | undefined {
  const all = listProjects();
  return all.find((p) => p.id === id) ?? all[0];
}

export function recentRuns(projectId: string, limit = 5) {
  const db = getDb();
  return db
    .select({
      id: runs.id,
      status: runs.status,
      startedAt: runs.startedAt,
      finishedAt: runs.finishedAt,
      // Fully qualified: inside a subquery, bare column names would bind to the inner table.
      total: sql<number>`(select count(*) from results r where r.run_id = "runs"."id")`,
      passed: sql<number>`(select count(*) from results r where r.run_id = "runs"."id" and r.status = 'passed')`,
    })
    .from(runs)
    .where(eq(runs.projectId, projectId))
    .orderBy(desc(sql`rowid`))
    .limit(limit)
    .all();
}

export function overview(projectId: string) {
  const db = getDb();
  const plan = latestPlan(projectId);
  const tests = plan
    ? db
        .select({ n: sql<number>`count(*)` })
        .from(testCases)
        .where(eq(testCases.planId, plan.id))
        .get()!.n
    : 0;
  const lastRun = recentRuns(projectId, 1)[0];
  const lastResults = lastRun
    ? db.select({ status: results.status }).from(results).where(eq(results.runId, lastRun.id)).all()
    : [];
  const recentResults = db
    .select({
      id: results.id,
      runId: results.runId,
      status: results.status,
      durationMs: results.durationMs,
      classification: results.classification,
      caseKey: testCases.caseKey,
      title: testCases.title,
    })
    .from(results)
    .innerJoin(runs, eq(runs.id, results.runId))
    .innerJoin(testCases, eq(testCases.id, results.caseId))
    .where(eq(runs.projectId, projectId))
    .orderBy(desc(sql`${results}.rowid`))
    .limit(8)
    .all();
  const mapRow = db
    .select({ createdAt: appMaps.createdAt, json: appMaps.json })
    .from(appMaps)
    .where(eq(appMaps.projectId, projectId))
    .orderBy(desc(appMaps.createdAt))
    .limit(1)
    .get();
  return {
    plan,
    tests,
    lastRun,
    passed: lastResults.filter((r) => r.status === "passed").length,
    failed: lastResults.filter((r) => r.status !== "passed").length,
    recentResults,
    recentRuns: recentRuns(projectId),
    openBugs: listBugs(projectId, "open").slice(0, 5),
    mapPages: mapRow ? ((mapRow.json as { pages?: unknown[] }).pages?.length ?? 0) : null,
  };
}

export function runDetail(runId: string) {
  const db = getDb();
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) return undefined;
  const rows = db
    .select({ result: results, testCase: testCases })
    .from(results)
    .innerJoin(testCases, eq(testCases.id, results.caseId))
    .where(eq(results.runId, runId))
    .orderBy(asc(testCases.caseKey))
    .all();
  const ev = rows.length
    ? db
        .select()
        .from(evidence)
        .where(
          inArray(
            evidence.resultId,
            rows.map((r) => r.result.id),
          ),
        )
        .all()
    : [];
  const runBugs = rows.length
    ? db
        .select({ id: bugs.id, resultId: bugs.resultId })
        .from(bugs)
        .where(
          inArray(
            bugs.resultId,
            rows.map((r) => r.result.id),
          ),
        )
        .all()
    : [];
  return {
    run,
    results: rows.map(({ result, testCase }) => ({
      ...result,
      caseKey: testCase.caseKey,
      title: testCase.title,
      severity: testCase.severity,
      evidence: ev.filter((e) => e.resultId === result.id),
      bugId: runBugs.find((b) => b.resultId === result.id)?.id ?? null,
    })),
  };
}

export function listBugs(projectId?: string, status?: "open" | "pushed" | "ignored") {
  const db = getDb();
  const where = and(
    projectId ? eq(bugs.projectId, projectId) : undefined,
    status ? eq(bugs.status, status) : undefined,
  );
  return db
    .select()
    .from(bugs)
    .where(where)
    .orderBy(desc(sql`${bugs}.rowid`))
    .all();
}

export function bugDetail(bugId: string) {
  const db = getDb();
  const bug = db.select().from(bugs).where(eq(bugs.id, bugId)).get();
  if (!bug) return undefined;
  const project = db.select().from(projects).where(eq(projects.id, bug.projectId)).get();
  const result = bug.resultId
    ? db.select().from(results).where(eq(results.id, bug.resultId)).get()
    : undefined;
  const testCase = result
    ? db.select().from(testCases).where(eq(testCases.id, result.caseId)).get()
    : undefined;
  const ev = result ? db.select().from(evidence).where(eq(evidence.resultId, result.id)).all() : [];
  // Latest execution of the same case, e.g. after a retest.
  const latest = testCase
    ? db
        .select({ status: results.status, runId: results.runId })
        .from(results)
        .where(eq(results.caseId, testCase.id))
        .orderBy(desc(sql`rowid`))
        .limit(1)
        .get()
    : undefined;
  const run = result ? db.select().from(runs).where(eq(runs.id, result.runId)).get() : undefined;
  return { bug, project, result, run, testCase, evidence: ev, latest };
}

export function recentJobs(projectId: string, limit = 8) {
  return getDb()
    .select()
    .from(jobs)
    .where(
      sql`json_extract(${jobs.payloadJson}, '$.projectId') = ${projectId}
      or json_extract(${jobs.payloadJson}, '$.runId') in (select id from ${runs} where ${runs.projectId} = ${projectId})`,
    )
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .all();
}
