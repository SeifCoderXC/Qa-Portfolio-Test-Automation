import { bugForTracker } from "@/lib/bug-export";
import { error } from "@/lib/http";
import { bugDetail } from "@/lib/queries";

/** bug.json download: the offline alternative to Jira. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = bugDetail(id);
  if (!detail) return error(404, "bug not found");
  const body = JSON.stringify({ id, status: detail.bug.status, ...bugForTracker(detail) }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="bug-${detail.testCase?.caseKey ?? id.slice(0, 8)}.json"`,
    },
  });
}
