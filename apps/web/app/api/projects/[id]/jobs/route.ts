import { eq, getDb, jobs, projects } from "@ai-qa/db";
import { error, json, readJson } from "@/lib/http";

const ALLOWED_TYPES = ["discover"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await readJson(req);
  if (!read.ok) return error(400, "invalid JSON body");

  const type = (read.body as { type?: unknown } | null)?.type;
  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return error(400, "validation failed", { type: `must be one of: ${ALLOWED_TYPES.join(", ")}` });
  }

  const db = getDb();
  const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!project) return error(404, "project not found");

  const job = db
    .insert(jobs)
    .values({ type: "discover", payloadJson: { projectId: id } })
    .returning()
    .get();

  return json(job, 201);
}
