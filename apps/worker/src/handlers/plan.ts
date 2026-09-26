import { appMaps, desc, eq, getDb, testCases, testPlans } from "@ai-qa/db";
import { aiPlan, heuristicPlan, writesData, type AppMap, type PlannedCase } from "@ai-qa/engine";
import { loadProject } from "../project";
import type { Handler } from "./types";

type Payload = { projectId?: unknown; heuristic?: boolean };

const MIN_CASES = 8;

export const plan: Handler = async (job) => {
  const payload = job.payloadJson as Payload;
  const project = loadProject(payload.projectId);
  const db = getDb();

  const latest = db
    .select()
    .from(appMaps)
    .where(eq(appMaps.projectId, project.id))
    .orderBy(desc(appMaps.createdAt))
    .limit(1)
    .get();
  if (!latest) throw new Error("no app map yet; run discover first");
  const map = latest.json as AppMap;

  let cases: PlannedCase[];
  let source = "heuristic";
  let warning: string | undefined;

  if (!payload.heuristic && process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await aiPlan(map);
      cases = res.cases;
      source = `ai:${res.model}`;
      if (cases.length < MIN_CASES) {
        // Small maps give small plans; top up with offline cases on other topics.
        const titles = new Set(cases.map((c) => c.title.toLowerCase()));
        const extra = heuristicPlan(map, 25).filter((c) => !titles.has(c.title.toLowerCase()));
        cases = [...cases, ...extra.slice(0, MIN_CASES - cases.length)].map((c, i) => ({
          ...c,
          key: `TC-${String(i + 1).padStart(3, "0")}`,
        }));
        source += "+heuristic";
      }
      const dropped = [
        res.droppedSteps && `${res.droppedSteps} step(s) the runner cannot execute`,
        res.droppedWeak && `${res.droppedWeak} case(s) that checked nothing`,
      ].filter(Boolean);
      if (dropped.length) warning = `dropped ${dropped.join(" and ")}`;
    } catch (err) {
      // The product must still work offline or when the API misbehaves.
      warning = `AI planner failed, used heuristic plan: ${err instanceof Error ? err.message : String(err)}`;
      cases = heuristicPlan(map);
    }
  } else {
    cases = heuristicPlan(map);
  }
  if (!cases.length) throw new Error("planner produced no cases");

  db.transaction((tx) => {
    const planRow = tx
      .insert(testPlans)
      .values({ projectId: project.id, source })
      .returning()
      .get();
    tx.insert(testCases)
      .values(
        cases.map((c) => ({
          planId: planRow.id,
          caseKey: c.key,
          title: c.title,
          objective: c.objective,
          preconditions: c.preconditions,
          stepsJson: c.steps,
          expected: c.expected,
          severity: c.severity,
          approved: false,
          risk: writesData(c.steps),
        })),
      )
      .run();
  });
  console.log(`  plan: ${cases.length} case(s) from ${source}`);
  return warning ? { warning } : undefined;
};
