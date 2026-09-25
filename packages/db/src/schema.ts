import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const FAILURE_CLASSES = ["product_bug", "test_bug", "env", "flake", "unknown"] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

export const projects = sqliteTable("projects", {
  id: id(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  createdAt: createdAt(),
});

export const secrets = sqliteTable(
  "secrets",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["loginEmail", "loginPassword", "basic"] }).notNull(),
    valueEnc: text("value_enc").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("secrets_project_idx").on(t.projectId)],
);

export const appMaps = sqliteTable(
  "app_maps",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    json: text("json", { mode: "json" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("app_maps_project_idx").on(t.projectId)],
);

export const testPlans = sqliteTable(
  "test_plans",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["draft", "approved"] })
      .notNull()
      .default("draft"),
    /** "ai:<model>" or "heuristic". */
    source: text("source").notNull().default("heuristic"),
    createdAt: createdAt(),
  },
  (t) => [index("test_plans_project_idx").on(t.projectId)],
);

export const testCases = sqliteTable(
  "test_cases",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => testPlans.id, { onDelete: "cascade" }),
    caseKey: text("case_key").notNull(),
    title: text("title").notNull(),
    objective: text("objective"),
    preconditions: text("preconditions"),
    stepsJson: text("steps_json", { mode: "json" }).notNull(),
    expected: text("expected"),
    severity: text("severity", { enum: ["low", "medium", "high", "critical"] })
      .notNull()
      .default("medium"),
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("test_cases_plan_idx").on(t.planId)],
);

export const runs = sqliteTable(
  "runs",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => testPlans.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "running", "passed", "failed", "cancelled"] })
      .notNull()
      .default("queued"),
    /** Case the worker is executing right now, for the live run view. */
    currentCaseKey: text("current_case_key"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("runs_project_idx").on(t.projectId)],
);

export const results = sqliteTable(
  "results",
  {
    id: id(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    caseId: text("case_id")
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["passed", "failed", "blocked", "skipped", "error"] }).notNull(),
    durationMs: integer("duration_ms"),
    errorText: text("error_text"),
    classification: text("classification", { enum: FAILURE_CLASSES }),
    analysis: text("analysis"),
  },
  (t) => [index("results_run_idx").on(t.runId)],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: id(),
    resultId: text("result_id")
      .notNull()
      .references(() => results.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["png", "webm", "console", "network", "page"] }).notNull(),
    path: text("path").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("evidence_result_idx").on(t.resultId)],
);

export const bugs = sqliteTable(
  "bugs",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    resultId: text("result_id").references(() => results.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    severity: text("severity", { enum: ["low", "medium", "high", "critical"] })
      .notNull()
      .default("medium"),
    analysis: text("analysis"),
    classification: text("classification", { enum: FAILURE_CLASSES })
      .notNull()
      .default("product_bug"),
    // Set by the app: SQLite cannot ALTER-add a column with an expression default.
    createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
    status: text("status", { enum: ["open", "pushed", "ignored"] })
      .notNull()
      .default("open"),
    jiraKey: text("jira_key"),
  },
  (t) => [index("bugs_project_idx").on(t.projectId)],
);

export const JOB_TYPES = ["ping", "discover", "plan", "run", "analyze", "retest"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    type: text("type", { enum: JOB_TYPES }).notNull(),
    payloadJson: text("payload_json", { mode: "json" }).notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    createdAt: createdAt(),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    errorText: text("error_text"),
  },
  (t) => [index("jobs_status_created_idx").on(t.status, t.createdAt)],
);
