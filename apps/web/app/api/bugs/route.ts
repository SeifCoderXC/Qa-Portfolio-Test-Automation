import { error, json } from "@/lib/http";
import { listBugs } from "@/lib/queries";

const STATUSES = ["open", "pushed", "ignored"] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return error(400, "validation failed", { status: `must be one of: ${STATUSES.join(", ")}` });
  }
  return json(
    listBugs(
      url.searchParams.get("projectId") ?? undefined,
      status as (typeof STATUSES)[number] | undefined,
    ),
  );
}
