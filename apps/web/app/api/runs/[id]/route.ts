import { error, json } from "@/lib/http";
import { runDetail } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = runDetail(id);
  return detail ? json(detail) : error(404, "run not found");
}
