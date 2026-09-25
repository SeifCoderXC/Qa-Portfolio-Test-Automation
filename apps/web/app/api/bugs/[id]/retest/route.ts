import { error, json } from "@/lib/http";
import { bugDetail } from "@/lib/queries";
import { enqueueRun } from "@/lib/runs";

/** Re-run the bug's test case in a new run. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = bugDetail(id);
  if (!detail) return error(404, "bug not found");
  if (!detail.testCase) return error(409, "bug has no linked test case");
  const res = enqueueRun(detail.bug.projectId, {
    type: "retest",
    caseIds: [detail.testCase.id],
    planId: detail.testCase.planId,
  });
  return res.ok ? json({ ...res.job, runId: res.run.id }, 201) : error(409, res.error);
}
