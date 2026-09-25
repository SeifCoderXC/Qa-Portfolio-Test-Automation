import { eq, getDb, jobs, projects } from "@ai-qa/db";
import { error, json, readJson } from "@/lib/http";
import { enqueueRun } from "@/lib/runs";

const ALLOWED_TYPES = ["discover", "plan", "run"] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await readJson(req);
  if (!read.ok) return error(400, "invalid JSON body");

  const body = (read.body ?? {}) as { type?: unknown; heuristic?: unknown };
  if (!ALLOWED_TYPES.includes(body.type as AllowedType)) {
    return error(400, "validation failed", { type: `must be one of: ${ALLOWED_TYPES.join(", ")}` });
  }
  const type = body.type as AllowedType;

  const db = getDb();
  const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!project) return error(404, "project not found");

  if (type === "run") {
    const res = enqueueRun(id);
    return res.ok ? json({ ...res.job, runId: res.run.id }, 201) : error(409, res.error);
  }

  const payload =
    type === "plan" && body.heuristic === true
      ? { projectId: id, heuristic: true }
      : { projectId: id };
  const job = db.insert(jobs).values({ type, payloadJson: payload }).returning().get();
  return json(job, 201);
}
