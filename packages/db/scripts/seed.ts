import { eq } from "drizzle-orm";
import { getDb } from "../src/client";
import { projects } from "../src/schema";

const db = getDb();
const existing = db.select().from(projects).where(eq(projects.name, "Demo")).get();

if (existing) {
  console.log(`seed: project "Demo" already exists (${existing.id})`);
} else {
  const row = db
    .insert(projects)
    .values({ name: "Demo", baseUrl: "https://example.com" })
    .returning()
    .get();
  console.log(`seed: created project "Demo" (${row.id})`);
}
