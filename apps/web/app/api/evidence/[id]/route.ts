import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { eq, evidence, evidenceDir, getDb, results } from "@ai-qa/db";
import { error } from "@/lib/http";

const TYPES: Record<string, string> = {
  png: "image/png",
  webm: "video/webm",
  console: "application/json",
  network: "application/json",
  page: "text/plain; charset=utf-8",
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db
    .select({ kind: evidence.kind, path: evidence.path, runId: results.runId })
    .from(evidence)
    .innerJoin(results, eq(results.id, evidence.resultId))
    .where(eq(evidence.id, id))
    .get();
  if (!row) return error(404, "evidence not found");

  // Paths come from the DB, but never serve outside the run's directory.
  const runDir = resolve(evidenceDir(), row.runId);
  const file = resolve(join(runDir, row.path));
  if (!file.startsWith(runDir + sep)) return error(400, "invalid evidence path");

  try {
    const data = await readFile(file);
    return new Response(data, {
      headers: {
        "Content-Type": TYPES[row.kind] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return error(404, "evidence file missing on disk");
  }
}
