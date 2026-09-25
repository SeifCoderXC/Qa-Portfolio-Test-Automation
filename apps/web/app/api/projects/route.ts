import { desc, encrypt, getDb, projects, secrets } from "@ai-qa/db";
import { error, json, readJson } from "@/lib/http";
import { parseCreateProject } from "@/lib/validate";

export async function GET() {
  const rows = getDb().select().from(projects).orderBy(desc(projects.createdAt)).all();
  return json(rows);
}

export async function POST(req: Request) {
  const read = await readJson(req);
  if (!read.ok) return error(400, "invalid JSON body");

  const parsed = parseCreateProject(read.body);
  if (!parsed.ok) return error(400, "validation failed", parsed.errors);
  const { name, baseUrl, loginEmail, loginPassword } = parsed.value;

  const hasLogin = Boolean(loginEmail && loginPassword);
  if (hasLogin && !process.env.APP_SECRET) {
    return error(500, "server is missing APP_SECRET; cannot store credentials");
  }

  const db = getDb();
  const project = db.transaction((tx) => {
    const row = tx.insert(projects).values({ name, baseUrl }).returning().get();
    if (hasLogin) {
      tx.insert(secrets)
        .values([
          { projectId: row.id, kind: "loginEmail", valueEnc: encrypt(loginEmail!) },
          { projectId: row.id, kind: "loginPassword", valueEnc: encrypt(loginPassword!) },
        ])
        .run();
    }
    return row;
  });

  return json({ ...project, hasLogin }, 201);
}
