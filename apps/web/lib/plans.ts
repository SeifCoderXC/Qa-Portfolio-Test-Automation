import { asc, desc, eq, getDb, testCases, testPlans } from "@ai-qa/db";

export function latestPlan(projectId: string) {
  return getDb()
    .select()
    .from(testPlans)
    .where(eq(testPlans.projectId, projectId))
    .orderBy(desc(testPlans.createdAt))
    .limit(1)
    .get();
}

export function casesOf(planId: string) {
  return getDb()
    .select()
    .from(testCases)
    .where(eq(testCases.planId, planId))
    .orderBy(asc(testCases.caseKey))
    .all();
}
