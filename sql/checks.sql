-- AI QA data integrity checks (SQLite, data/ai-qa.sqlite).
--
-- Two kinds of statements, each introduced by a marker line:
--   -- @check  <name>: <what it verifies>   must return ZERO rows; any row is a defect
--   -- @report <name>: <what it shows>      informational counts
--
-- Why these exist: Drizzle's `enum` lists are enforced only in TypeScript (the migrations have
-- no CHECK constraints), and SQLite enforces foreign keys only when a connection enables them.
-- So the database alone does not guarantee any of the rules below.
--
-- Run all:  pnpm sql:check          (exits 1 if any @check returns rows)
-- Run one:  sqlite3 data/ai-qa.sqlite < sql/checks.sql


-- ============================================================================================
-- Projects and secrets
-- ============================================================================================

-- @check project_url_not_http: every project base_url starts with http:// or https://
SELECT id, base_url
FROM projects
WHERE base_url NOT LIKE 'http://%' AND base_url NOT LIKE 'https://%';

-- @check project_url_has_credentials: no user:pass@ in the host part of a base_url (credentials belong in secrets)
WITH hostpart AS (
  SELECT id, base_url,
         substr(base_url, instr(base_url, '://') + 3) AS rest
  FROM projects
)
SELECT id, base_url
FROM hostpart
WHERE instr(CASE WHEN instr(rest, '/') > 0 THEN substr(rest, 1, instr(rest, '/') - 1) ELSE rest END, '@') > 0;

-- @check secret_columns_outside_value_enc: value_enc is the only column anywhere that may hold a secret
SELECT m.name AS table_name, c.name AS column_name
FROM sqlite_master m
JOIN pragma_table_info(m.name) c
WHERE m.type = 'table'
  AND (c.name LIKE '%password%' OR c.name LIKE '%token%' OR c.name LIKE '%secret%' OR c.name LIKE '%api_key%')
  AND c.name <> 'value_enc';

-- @check secret_looks_plaintext: value_enc is base64 of iv(12)+tag(16)+ciphertext, so ≥ 40 base64 characters and no '@' or spaces
-- (selects lengths only, never the stored value)
SELECT id, kind, length(value_enc) AS stored_length
FROM secrets
WHERE length(value_enc) < 40
   OR value_enc GLOB '*[^A-Za-z0-9+/=]*';

-- @check secret_kind_unknown: secret kinds are loginEmail, loginPassword or basic
SELECT id, kind FROM secrets WHERE kind NOT IN ('loginEmail', 'loginPassword', 'basic');

-- @check login_half_stored: a project stores both loginEmail and loginPassword, or neither
SELECT project_id,
       SUM(kind = 'loginEmail') AS emails,
       SUM(kind = 'loginPassword') AS passwords
FROM secrets
WHERE kind IN ('loginEmail', 'loginPassword')
GROUP BY project_id
HAVING emails <> 1 OR passwords <> 1;


-- ============================================================================================
-- Orphans (every child row points at an existing parent)
-- ============================================================================================

-- @check orphan_secrets: every secret belongs to a project
SELECT s.id FROM secrets s LEFT JOIN projects p ON p.id = s.project_id WHERE p.id IS NULL;

-- @check orphan_test_cases: every test case belongs to a plan
SELECT c.id, c.case_key FROM test_cases c LEFT JOIN test_plans tp ON tp.id = c.plan_id WHERE tp.id IS NULL;

-- @check orphan_runs: every run belongs to a project and a plan
SELECT ru.id FROM runs ru
LEFT JOIN projects p ON p.id = ru.project_id
LEFT JOIN test_plans tp ON tp.id = ru.plan_id
WHERE p.id IS NULL OR tp.id IS NULL;

-- @check orphan_results: every result belongs to a run
SELECT r.id FROM results r
LEFT JOIN runs ru ON ru.id = r.run_id
WHERE ru.id IS NULL;

-- @check orphan_results_case: every result belongs to a test case
SELECT r.id FROM results r
LEFT JOIN test_cases c ON c.id = r.case_id
WHERE c.id IS NULL;

-- @check orphan_evidence: every evidence row belongs to a result
SELECT e.id FROM evidence e
LEFT JOIN results r ON r.id = e.result_id
WHERE r.id IS NULL;

-- @check orphan_bugs: every bug belongs to a project, and its result (when set) exists
SELECT b.id FROM bugs b
LEFT JOIN projects p ON p.id = b.project_id
LEFT JOIN results r ON r.id = b.result_id
WHERE p.id IS NULL OR (b.result_id IS NOT NULL AND r.id IS NULL);

-- @check sqlite_foreign_key_check: SQLite's own foreign-key audit finds nothing
SELECT * FROM pragma_foreign_key_check;


-- ============================================================================================
-- Allowed values (Drizzle enums are not enforced by SQLite)
-- ============================================================================================

-- @check run_status_invalid: run status is one of queued, running, passed, failed, cancelled
SELECT id, status FROM runs WHERE status NOT IN ('queued', 'running', 'passed', 'failed', 'cancelled');

-- @check result_status_invalid: result status is one of passed, failed, blocked, skipped, error
SELECT id, status FROM results WHERE status NOT IN ('passed', 'failed', 'blocked', 'skipped', 'error');

-- @check severity_invalid: severities are low, medium, high or critical (test cases and bugs)
SELECT 'test_cases' AS tbl, id, severity FROM test_cases WHERE severity NOT IN ('low', 'medium', 'high', 'critical')
UNION ALL
SELECT 'bugs', id, severity FROM bugs WHERE severity NOT IN ('low', 'medium', 'high', 'critical');

-- @check classification_invalid: classifications are product_bug, test_bug, env, flake or unknown
SELECT 'results' AS tbl, id, classification FROM results
WHERE classification IS NOT NULL AND classification NOT IN ('product_bug', 'test_bug', 'env', 'flake', 'unknown')
UNION ALL
SELECT 'bugs', id, classification FROM bugs
WHERE classification NOT IN ('product_bug', 'test_bug', 'env', 'flake', 'unknown');

-- @check job_status_invalid: job type and status are known values
SELECT id, type, status FROM jobs
WHERE type NOT IN ('ping', 'discover', 'plan', 'run', 'analyze', 'retest')
   OR status NOT IN ('queued', 'running', 'done', 'failed');


-- ============================================================================================
-- Business rules
-- ============================================================================================

-- @check bug_not_product_bug: bugs are only filed for product_bug failures ("a failed step is not automatically a bug")
SELECT id, classification FROM bugs
WHERE classification IS NOT NULL
  AND classification != 'product_bug';

-- @check bug_pushed_without_key: status 'pushed' if and only if a Jira key is stored
SELECT id, status, jira_key FROM bugs
WHERE (status = 'pushed') <> (jira_key IS NOT NULL);

-- @check jira_key_duplicated: one Jira issue per bug
SELECT jira_key, COUNT(*) AS bugs FROM bugs
WHERE jira_key IS NOT NULL
GROUP BY jira_key
HAVING COUNT(*) > 1;

-- @check open_bug_duplicated_per_case: at most one open bug per test case (the analyzer's dedupe rule)
SELECT r.case_id, COUNT(*) AS open_bugs
FROM bugs b
JOIN results r ON r.id = b.result_id
WHERE b.status = 'open'
GROUP BY r.case_id
HAVING COUNT(*) > 1;

-- @check run_finished_before_start: finished_at is never before started_at
SELECT id, started_at, finished_at FROM runs
WHERE finished_at IS NOT NULL AND started_at IS NOT NULL
  AND finished_at < started_at;

-- @check run_finished_still_running_case: a finished run shows no "running case"
SELECT id, status, current_case_key FROM runs
WHERE status IN ('passed', 'failed', 'cancelled') AND current_case_key IS NOT NULL;

-- @check run_passed_with_failures: a run marked passed has no non-passing result
SELECT ru.id, SUM(r.status <> 'passed') AS not_passed
FROM runs ru
JOIN results r ON r.run_id = ru.id
WHERE ru.status = 'passed'
GROUP BY ru.id
HAVING not_passed > 0;

-- @check failure_without_reason: every failed, blocked or error result says why
SELECT id, status FROM results
WHERE status IN ('failed', 'blocked', 'error') AND (error_text IS NULL OR trim(error_text) = '');

-- @check duration_negative: durations are never negative
SELECT id, duration_ms FROM results WHERE duration_ms < 0;

-- @check case_key_duplicated: case keys (TC-001…) are unique within a plan
SELECT plan_id, case_key, COUNT(*) AS copies FROM test_cases
GROUP BY plan_id, case_key
HAVING COUNT(*) > 1;

-- @check evidence_path_escapes: evidence paths stay inside the run folder (no absolute paths, no '..')
SELECT id, path FROM evidence
WHERE path LIKE '/%' OR path LIKE '%..%' OR path LIKE '%\%' ESCAPE '|';

-- @check finished_job_without_timestamp: done/failed jobs have finished_at; failed jobs say why
SELECT id, type, status FROM jobs
WHERE (status IN ('done', 'failed') AND finished_at IS NULL)
   OR (status = 'failed' AND (error_text IS NULL OR trim(error_text) = ''));


-- ============================================================================================
-- Reports (counts a recruiter can read)
-- ============================================================================================

-- @report results_by_status: how many results per status
SELECT status, COUNT(*) AS results FROM results GROUP BY status ORDER BY results DESC;

-- @report open_bugs: bugs still open
SELECT COUNT(*) AS open_bugs FROM bugs WHERE status = 'open';

-- @report bugs_by_status_and_severity: bug pipeline at a glance
SELECT status, severity, COUNT(*) AS bugs FROM bugs GROUP BY status, severity ORDER BY status, severity;

-- @report failure_triage: how failures were classified (the tool's "is it really a bug?" answer)
SELECT COALESCE(classification, '(not analyzed)') AS classification, COUNT(*) AS failures
FROM results
WHERE status <> 'passed'
GROUP BY classification
ORDER BY failures DESC;

-- @report pass_rate_per_project: finished runs, results and pass rate per project
SELECT p.name AS project,
       COUNT(DISTINCT ru.id) AS runs,
       COUNT(r.id) AS results,
       ROUND(100.0 * SUM(r.status = 'passed') / NULLIF(COUNT(r.id), 0), 1) AS pass_rate_pct
FROM projects p
LEFT JOIN runs ru ON ru.project_id = p.id AND ru.status IN ('passed', 'failed')
LEFT JOIN results r ON r.run_id = ru.id
GROUP BY p.id
ORDER BY runs DESC;
