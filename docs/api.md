# AI QA REST API

Local only: `http://127.0.0.1:3000` (requests with any other `Host` get **403**). JSON in, JSON out.
Errors look like `{ "error": "…", "details": { "<field>": "<message>" } }`.

Tested two ways: `tests/api/*.spec.ts` (Playwright `request`, `pnpm test:api`) and
`postman/ai-qa.postman_collection.json` (import into Postman, or run with Newman).

## Projects

| Method | Route                    | Body                                                  | Responses                                                                                                               |
| ------ | ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/projects`          | none                                                  | 200 `Project[]`                                                                                                         |
| POST   | `/api/projects`          | `{ name, baseUrl, loginEmail?, loginPassword? }`      | 201 project + `hasLogin` · 400 validation (`baseUrl` must be http(s) without `user:pass@`; email and password together) |
| GET    | `/api/projects/:id`      | none                                                  | 200 project + `secretKinds` (never secret values) · 404                                                                 |
| GET    | `/api/projects/:id/jobs` | none                                                  | 200 recent jobs for the project                                                                                         |
| POST   | `/api/projects/:id/jobs` | `{ type: "discover" \| "plan" \| "run", heuristic? }` | 201 queued job (`run` also returns `runId`) · 400 unknown type · 404 project · 409 `run` without a plan                 |

## Test cases

| Method | Route                             | Body                                                                   | Responses                                                                      |
| ------ | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/api/projects/:id/cases`         | none                                                                   | 200 `{ plan, cases }` of the latest plan · 404 no plan yet                     |
| POST   | `/api/projects/:id/cases`         | `{ title, steps[], objective?, preconditions?, expected?, severity? }` | 201 hand-written case · 400 step not in the grammar, or no check · 404 no plan |
| POST   | `/api/projects/:id/cases/approve` | `{ ids: string[] \| "all", approved? }`                                | 200 updated cases (`"all"` skips cases that submit forms) · 400 · 404          |

## Runs, bugs, evidence

| Method | Route                          | Body | Responses                                                                                                      |
| ------ | ------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/runs/:id`                | none | 200 run, results, evidence, bug links · 404                                                                    |
| GET    | `/api/bugs?projectId=&status=` | none | 200 `Bug[]` · 400 unknown status                                                                               |
| GET    | `/api/bugs/:id`                | none | 200 bug with case, result, evidence, latest retest · 404                                                       |
| GET    | `/api/bugs/:id/json`           | none | 200 `bug-TC-xxx.json` download                                                                                 |
| POST   | `/api/bugs/:id/retest`         | none | 201 retest job + `runId` (syncs Jira when the bug was pushed) · 404 · 409                                      |
| POST   | `/api/bugs/:id/jira`           | none | 201 `{ key, url, attached }` · 400 Jira not configured (+ download link) · 409 already pushed · 502 Jira error |
| GET    | `/api/evidence/:id`            | none | 200 file (png, webm, json, txt) · 404                                                                          |

## Assistant

| Method | Route            | Body                                                                                       | Responses                                                       |
| ------ | ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| POST   | `/api/assistant` | `{ projectId?, messages: [{ role, content }] }` (last message from the user, max 10 turns) | 200 `{ reply, source, jobId?, runId? }` · 400 · 502 model error |
