// pnpm demo: seed example.com -> discover -> plan (heuristic) -> run -> analyze, all offline-capable.
import { and, desc, eq, getDb, projects, runs, testPlans } from "@ai-qa/db";
import { enqueue } from "../src/queue";
import { drain } from "../src/worker";

const DEMO_URL = process.env.DEMO_URL ?? "https://example.com";
const db = getDb();

let project = db
  .select()
  .from(projects)
  .where(and(eq(projects.name, "Demo"), eq(projects.baseUrl, DEMO_URL)))
  .get();
project ??= db.insert(projects).values({ name: "Demo", baseUrl: DEMO_URL }).returning().get();
console.log(`\n1/4 project "Demo" ${project.baseUrl} (${project.id})`);

console.log("2/4 discover");
enqueue("discover", { projectId: project.id });
await drain();

console.log("3/4 plan (heuristic, no API key needed)");
enqueue("plan", { projectId: project.id, heuristic: true });
await drain();
const plan = db
  .select()
  .from(testPlans)
  .where(eq(testPlans.projectId, project.id))
  .orderBy(desc(testPlans.createdAt))
  .limit(1)
  .get();
if (!plan) throw new Error("demo: no plan was created; see the log above");

console.log("4/4 run all cases (+ analyze failures)");
const run = db.insert(runs).values({ projectId: project.id, planId: plan.id }).returning().get();
enqueue("run", { runId: run.id });
await drain();

const done = db.select().from(runs).where(eq(runs.id, run.id)).get()!;
console.log(`\nRun ${done.status}. Open it:  pnpm dev  ->  http://localhost:3000/runs/${run.id}\n`);
