# SQL integrity checks

`checks.sql` is hand-written SQL (SQLite) that audits AI QA's own database, `data/ai-qa.sqlite`.
The app writes through Drizzle; these queries are the independent oracle that checks what it wrote.

## Why they are needed

- Drizzle `enum` lists (statuses, severities, classifications) are enforced only in TypeScript. The
  migrations contain **no CHECK constraints**, so SQLite would accept any string.
- SQLite enforces foreign keys only when a connection enables them, so orphans are possible.
- Some rules live only in application code: one open bug per case, "pushed" means a Jira key
  exists, secrets are stored encrypted.

## What is checked (31 checks + 5 reports)

| Area                 | Checks                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects and secrets | base_url is http(s); no `user:pass@` in the host; `value_enc` is the only secret-like column in the whole schema (via `pragma_table_info`); stored secrets look encrypted (base64, ≥ 40 chars; only lengths are selected, never values); known secret kinds; email and password stored together                                                          |
| Orphans              | secrets, test cases, runs, results (run and case), evidence and bugs all point at existing parents; plus SQLite's own `pragma_foreign_key_check`                                                                                                                                                                                                         |
| Allowed values       | run, result and job statuses, job types, severities, classifications                                                                                                                                                                                                                                                                                     |
| Business rules       | bugs only for `product_bug`; `pushed` ⇔ Jira key; no duplicate Jira keys; one open bug per case; `finished_at ≥ started_at`; finished runs show no running case; a passed run has no failing result; every failure says why; no negative durations; unique `TC-xxx` per plan; evidence paths cannot escape the run folder; finished jobs have timestamps |
| Reports              | results by status, open bugs, bugs by status and severity, failure triage (how many failures were really bugs), pass rate per project                                                                                                                                                                                                                    |

Each statement starts with a marker line, so humans and the runner read the same file:

```sql
-- @check orphan_results: every result belongs to a run
SELECT r.id FROM results r LEFT JOIN runs ru ON ru.id = r.run_id WHERE ru.id IS NULL;
```

`@check` statements must return **zero rows**; `@report` statements are informational.

## Run

```bash
pnpm sql:check                                        # data/ai-qa.sqlite, exits 1 on any failed check
DATABASE_PATH=data/e2e/ai-qa.sqlite pnpm sql:check    # any other database
sqlite3 data/ai-qa.sqlite < sql/checks.sql            # raw, with the sqlite3 CLI
```

The runner (`packages/db/scripts/integrity.ts`) opens the database **read-only** and never prints
secret values. Run `pnpm db:migrate` (and `pnpm demo` for data) first on a fresh machine.

## How the checks are tested

`packages/db/test/integrity.test.ts` (part of `pnpm test`) builds a fresh database from the real
migration files and fills it with valid data, where all 31 checks must return nothing. Then, for
each check, it plants one specific defect (an orphan, an invalid status, a plaintext secret, a
`../` path, …) and asserts that exactly that check fires. A check that has never been seen failing
proves nothing.
