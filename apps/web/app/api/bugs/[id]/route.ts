import { error, json } from "@/lib/http";
import { bugDetail } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = bugDetail(id);
  return detail ? json(detail) : error(404, "bug not found");
}
