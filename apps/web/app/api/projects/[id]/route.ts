import { eq, getDb, projects, secrets } from "@ai-qa/db";
import { error, json } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return error(404, "project not found");

  // Expose which secrets exist, never their values.
  const secretKinds = db
    .select({ kind: secrets.kind })
    .from(secrets)
    .where(eq(secrets.projectId, id))
    .all()
    .map((s) => s.kind);

  return json({ ...project, secretKinds });
}
