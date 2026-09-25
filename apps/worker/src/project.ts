import { decrypt, eq, getDb, projects, secrets } from "@ai-qa/db";
import type { Credentials } from "@ai-qa/engine";

export function loadProject(projectId: unknown) {
  if (typeof projectId !== "string") throw new Error("payload.projectId missing");
  const project = getDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error(`project ${projectId} not found`);
  return project;
}

/** Decrypted login for a project, or undefined. Values stay in memory only. */
export function loadCredentials(projectId: string): Credentials | undefined {
  const rows = getDb().select().from(secrets).where(eq(secrets.projectId, projectId)).all();
  const email = rows.find((r) => r.kind === "loginEmail");
  const password = rows.find((r) => r.kind === "loginPassword");
  if (!email || !password) return undefined;
  return { email: decrypt(email.valueEnc), password: decrypt(password.valueEnc) };
}
