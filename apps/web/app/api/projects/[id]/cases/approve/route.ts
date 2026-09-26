import { and, eq, getDb, inArray, isNull, testCases, testPlans } from "@ai-qa/db";
import { error, json, readJson } from "@/lib/http";
import { casesOf, latestPlan } from "@/lib/plans";

/**
 * Body: {ids: string[] | "all", approved?: boolean}. Applies to the latest plan only.
 * "all" never approves cases that may write data (risk set); those need their id listed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await readJson(req);
  if (!read.ok) return error(400, "invalid JSON body");
  const body = (read.body ?? {}) as { ids?: unknown; approved?: unknown };

  const all = body.ids === "all";
  const ids =
    Array.isArray(body.ids) && body.ids.every((x) => typeof x === "string")
      ? (body.ids as string[])
      : null;
  if (!all && !ids)
    return error(400, "validation failed", { ids: 'must be "all" or an array of case ids' });
  if (body.approved !== undefined && typeof body.approved !== "boolean") {
    return error(400, "validation failed", { approved: "must be a boolean" });
  }
  const approved = body.approved ?? true;

  const plan = latestPlan(id);
  if (!plan) return error(404, "no plan yet");

  const db = getDb();
  const where = all
    ? approved
      ? and(eq(testCases.planId, plan.id), isNull(testCases.risk))
      : eq(testCases.planId, plan.id)
    : and(eq(testCases.planId, plan.id), inArray(testCases.id, ids!.length ? ids! : [""]));
  const changed = db.update(testCases).set({ approved }).where(where).run().changes;

  const cases = casesOf(plan.id);
  const status = cases.some((c) => c.approved) ? "approved" : "draft";
  db.update(testPlans).set({ status }).where(eq(testPlans.id, plan.id)).run();

  return json({ changed, planStatus: status, cases });
}
