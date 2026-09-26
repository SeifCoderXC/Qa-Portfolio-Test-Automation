import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { parseChecks, runChecksOn } from "../src/integrity";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const statements = parseChecks(readFileSync(join(ROOT, "sql", "checks.sql"), "utf8"));
const checks = statements.filter((s) => s.kind === "check");

/** A fresh in-memory database built from the real migration files, plus one of everything, valid. */
function seeded() {
  const db = new Database(":memory:");
  const dir = join(ROOT, "packages", "db", "drizzle");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint"))
      db.exec(stmt);
  const enc = "A".repeat(56); // same shape as real value_enc (base64, ≥ 40 chars)
  db.exec(`
    INSERT INTO projects (id, name, base_url) VALUES ('p1', 'Demo', 'https://example.com/app');
    INSERT INTO secrets (id, project_id, kind, value_enc) VALUES ('s1', 'p1', 'loginEmail', '${enc}'), ('s2', 'p1', 'loginPassword', '${enc}');
    INSERT INTO test_plans (id, project_id, status, source) VALUES ('tp1', 'p1', 'approved', 'heuristic');
    INSERT INTO test_cases (id, plan_id, case_key, title, steps_json, severity, approved)
      VALUES ('c1', 'tp1', 'TC-001', 'Home loads', '["go to \\"/\\""]', 'high', 1),
             ('c2', 'tp1', 'TC-002', 'Labels', '["expect form fields have labels"]', 'medium', 1);
    INSERT INTO runs (id, project_id, plan_id, status, started_at, finished_at) VALUES
      ('ru1', 'p1', 'tp1', 'passed', 1000, 2000),
      ('ru2', 'p1', 'tp1', 'failed', 3000, 4000);
    INSERT INTO results (id, run_id, case_id, status, duration_ms, error_text, classification) VALUES
      ('r1', 'ru1', 'c1', 'passed', 900, NULL, NULL),
      ('r2', 'ru2', 'c2', 'failed', 800, 'accessibility: fields without a label', 'product_bug');
    INSERT INTO evidence (id, result_id, kind, path) VALUES ('e1', 'r2', 'png', 'TC-002/failure.png');
    INSERT INTO bugs (id, project_id, result_id, title, severity, status, jira_key, classification)
      VALUES ('b1', 'p1', 'r2', 'No labels', 'medium', 'pushed', 'DEMO-1', 'product_bug');
    INSERT INTO jobs (id, type, payload_json, status, finished_at) VALUES ('j1', 'run', '{}', 'done', 4000);
  `);
  return db;
}

const failing = (db: Database.Database) =>
  runChecksOn(db, checks)
    .filter((o) => o.rows.length)
    .map((o) => o.name);

test("checks.sql parses into named checks and reports", () => {
  assert.ok(checks.length >= 25, `only ${checks.length} checks`);
  assert.ok(statements.some((s) => s.kind === "report" && s.name === "results_by_status"));
  for (const s of statements) assert.ok(s.sql.length > 10 && s.description.length > 10, s.name);
});

test("valid data passes every check", () => {
  assert.deepEqual(failing(seeded()), []);
});

// One planted defect per check: each must be caught by exactly the check named for it.
const DEFECTS: [check: string, sql: string][] = [
  ["project_url_not_http", "UPDATE projects SET base_url = 'ftp://example.com'"],
  ["project_url_has_credentials", "UPDATE projects SET base_url = 'https://user:pw@example.com/x'"],
  ["secret_columns_outside_value_enc", "ALTER TABLE projects ADD COLUMN admin_password TEXT"],
  ["secret_looks_plaintext", "UPDATE secrets SET value_enc = 'qa@example.com' WHERE id = 's1'"],
  ["secret_kind_unknown", "UPDATE secrets SET kind = 'apiKey' WHERE id = 's1'"],
  ["login_half_stored", "DELETE FROM secrets WHERE id = 's2'"],
  ["orphan_secrets", "UPDATE secrets SET project_id = 'gone' WHERE id = 's1'"],
  ["orphan_test_cases", "UPDATE test_cases SET plan_id = 'gone' WHERE id = 'c1'"],
  ["orphan_runs", "UPDATE runs SET plan_id = 'gone' WHERE id = 'ru1'"],
  ["orphan_results", "UPDATE results SET run_id = 'gone' WHERE id = 'r1'"],
  ["orphan_results_case", "UPDATE results SET case_id = 'gone' WHERE id = 'r1'"],
  ["orphan_evidence", "UPDATE evidence SET result_id = 'gone'"],
  ["orphan_bugs", "UPDATE bugs SET result_id = 'gone'"],
  ["run_status_invalid", "UPDATE runs SET status = 'done' WHERE id = 'ru1'"],
  ["result_status_invalid", "UPDATE results SET status = 'ok' WHERE id = 'r1'"],
  ["severity_invalid", "UPDATE test_cases SET severity = 'urgent' WHERE id = 'c1'"],
  ["classification_invalid", "UPDATE results SET classification = 'bug' WHERE id = 'r2'"],
  ["job_status_invalid", "UPDATE jobs SET status = 'finished'"],
  ["bug_not_product_bug", "UPDATE bugs SET classification = 'test_bug'"],
  ["bug_pushed_without_key", "UPDATE bugs SET jira_key = NULL"],
  [
    "jira_key_duplicated",
    "INSERT INTO bugs (id, project_id, title, severity, status, jira_key) VALUES ('b2', 'p1', 'dup', 'low', 'pushed', 'DEMO-1')",
  ],
  [
    "open_bug_duplicated_per_case",
    "UPDATE bugs SET status = 'open', jira_key = NULL; INSERT INTO bugs (id, project_id, result_id, title, severity, status) VALUES ('b3', 'p1', 'r2', 'again', 'low', 'open')",
  ],
  ["run_finished_before_start", "UPDATE runs SET finished_at = 500 WHERE id = 'ru1'"],
  [
    "run_finished_still_running_case",
    "UPDATE runs SET current_case_key = 'TC-001' WHERE id = 'ru1'",
  ],
  [
    "run_passed_with_failures",
    "UPDATE results SET status = 'failed', error_text = 'x' WHERE id = 'r1'",
  ],
  ["failure_without_reason", "UPDATE results SET error_text = '  ' WHERE id = 'r2'"],
  ["duration_negative", "UPDATE results SET duration_ms = -5 WHERE id = 'r1'"],
  ["case_key_duplicated", "UPDATE test_cases SET case_key = 'TC-001' WHERE id = 'c2'"],
  ["evidence_path_escapes", "UPDATE evidence SET path = '../../etc/passwd'"],
  ["finished_job_without_timestamp", "UPDATE jobs SET status = 'failed', error_text = NULL"],
];

test("every check has a planted defect", () => {
  const covered = new Set(DEFECTS.map(([c]) => c));
  const missing = checks
    .map((c) => c.name)
    .filter((n) => !covered.has(n) && n !== "sqlite_foreign_key_check");
  assert.deepEqual(missing, []);
});

for (const [check, sql] of DEFECTS) {
  test(`catches: ${check}`, () => {
    const db = seeded();
    db.pragma("foreign_keys = OFF"); // plant orphans the app itself would refuse
    db.exec(sql);
    const hit = failing(db);
    assert.ok(hit.includes(check), `${check} did not fire; fired: ${hit.join(", ") || "none"}`);
  });
}

test("catches: sqlite_foreign_key_check", () => {
  const db = seeded();
  db.pragma("foreign_keys = OFF");
  db.exec("UPDATE evidence SET result_id = 'gone'");
  assert.ok(failing(db).includes("sqlite_foreign_key_check"));
});
