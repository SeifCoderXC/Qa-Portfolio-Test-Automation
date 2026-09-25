import { error, json } from "@/lib/http";
import { casesOf, latestPlan } from "@/lib/plans";

/** Cases of the project's latest plan. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = latestPlan(id);
  if (!plan) return error(404, "no plan yet");
  return json({ plan, cases: casesOf(plan.id) });
}
