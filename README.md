# AI QA

An AI QA engineer that tests a web app, proves failures with evidence, and can open a Jira issue.

Give it a URL. It crawls the app, writes test cases, runs them in Chromium, records screenshots,
video and logs for every failure, decides whether each failure is a product bug, a broken test,
the environment or a flake, and files the real bugs. It is not "an AI that writes Playwright files".

## Try it in 10 minutes

Requirements: Node 22+, pnpm, Google Chrome or Playwright's Chromium. No API key needed.

```bash
git clone <this repo> ai-qa && cd ai-qa
pnpm install
cp .env.example .env          # optional: add ANTHROPIC_API_KEY, JIRA_*, APP_SECRET
pnpm browser:install          # Playwright Chromium (skip if Google Chrome is installed)
pnpm demo                     # example.com: discover -> plan -> run -> analyze
pnpm dev                      # dashboard: http://localhost:3000
```

In a second terminal, keep the worker running so buttons in the dashboard do something:

```bash
pnpm worker
```

`pnpm demo` works offline: it plans with heuristics and classifies failures with rules. Against
example.com the 8 cases normally all pass. To see failures, evidence and bugs, run it against your
own staging app (`DEMO_URL=https://staging.example pnpm demo`) or add a project in the dashboard.

Then in the dashboard:

1. **Overview**: tests, passed, failed, recent results, open bugs.
2. **Plans**: add your own app (URL, optional login), _Discover app_, _Generate plan_, tick the
   cases to keep, _Run_.
3. **Run**: cases flip live ("Worker is running case TC-004"); failures show a screenshot,
   video, console and network logs, and the classification.
4. **Bug**: analysis, evidence, _Retest_, _Create Jira issue_ (or _download bug.json_ without Jira).
5. **Assistant**: "why did it fail?", "retest checkout", "retest failed".

## Architecture

Two processes share one SQLite file. The Next.js app (`apps/web`) is the dashboard and a small
REST API; it never launches a browser. It only writes rows into a `jobs` table. A long-running
Node worker (`apps/worker`) polls that table every 2 seconds, locks one job with a guarded
`UPDATE`, and runs it with `packages/engine`, where Playwright is the hands (crawl, execute
steps, collect evidence) and Claude is the brain (write test cases, triage failures). Engine
functions are pure: inputs in, data out. The worker persists results. Failures are triaged by
offline rules first, and by Claude when a key is set, and only `product_bug` becomes a bug row.
Pushing to Jira is always a user click (`packages/integrations`). Playwright needs a real
long-running process, so the worker must not be a serverless function. The dashboard can be.

```
apps/web                Next.js 15 dashboard + API routes      (no Playwright)
apps/worker             job loop: discover | plan | run | analyze | retest
packages/engine         crawler, step runner, planners, classifier (Playwright + Claude)
packages/db             Drizzle schema, migrations, getDb(), secret encryption
packages/integrations   Jira Cloud REST v3 adapter (ADF, wiki fallback)
data/                   ai-qa.sqlite + evidence/{runId}/{caseKey}/…  (gitignored)
```

Test steps are plain sentences in a tiny grammar (`go to "/login"`, `click "Sign in"`,
`type "{{loginEmail}}" into "Email"`, `expect text "Welcome"`). The planner writes them, the
runner executes them, and a step that cannot be bound to the page marks the case **blocked**,
not failed. The runner waits up to 5 s for client-rendered elements before calling one missing.

Two built-in accessibility checks run on every page with a form:

- `expect form fields have labels`: every field needs a real label (`<label>`, `aria-label`,
  `aria-labelledby`); a placeholder is not a label (WCAG 2.2 SC 1.3.1, 3.3.2).
- `expect login fields have autocomplete`: email/password fields must declare `email`,
  `current-password` or `new-password` (WCAG 2.2 SC 1.3.5; password managers).

### Safety when testing a live app

- Planners write only negative cases for sign-up, contact and reset forms.
- Any case that submits a form (`click "Create account"`, `press "Enter"` after typing, …) is
  flagged **submits a form**. _Approve all safe_ skips it, and a run with nothing approved never
  includes it. A person must tick it after checking it cannot create real accounts, emails or orders.
- Cases that check nothing are dropped. Hand-written cases (_Add test case_ on the Plans page)
  are validated against the step grammar and must contain a check.

### Jira workflow

Bugs are filed as QA reports: environment, preconditions, steps to reproduce, expected and
actual result, severity (label) and a suggested priority, with the screenshot, page text, logs and
video attached. The Jira project uses a QA defect workflow:

```
Open → Confirmed → In Progress → Ready for Retest → Closed      (+ Reopened, Rejected)
```

_Retest_ on a bug page reports back to Jira: a pass while **Ready for Retest** moves the issue to
**Closed**, a failure while **Ready for Retest** or **Closed** moves it to **Reopened**, and anything
else only adds a comment. People triage; AI QA verifies.

## Dashboard tests (Playwright Test)

Separate from `pnpm demo`: `pnpm demo` makes the **worker** test someone else's app, while this
suite tests **AI QA's own dashboard** with Playwright Test.

```bash
pnpm test:e2e       # starts the dashboard if needed, runs tests/e2e, writes playwright-report/
pnpm test:e2e:ui    # Playwright UI mode
npx playwright show-report   # or open playwright-report/index.html
```

- `playwright.config.ts`: Chromium only, `baseURL` http://127.0.0.1:3000, list + HTML reporters,
  and a `webServer` that migrates and starts the dashboard, or reuses one that is already running.
- The suite uses its own database (`data/e2e/`), so it never touches your projects.
- Page objects live in `tests/e2e/pages/` (`HomePage`, `PlansPage`: locators only). `fixtures.ts`
  gives each test a fresh project, so tests are deterministic.
- Specs: `smoke` (title, nav, banner, localhost-only), `projects` (create from the form, URL
  validation), `plans` (empty state, disabled actions), `bugs` (empty state, API 404/400).

## API tests and Postman

The REST API (see [docs/api.md](docs/api.md)) is tested two ways:

- **Playwright `request`**: `pnpm test:api` runs `tests/api/*.spec.ts` with no browser: status
  codes, validation errors, 404/409, and a check that a stored password is never returned.
- **Postman**: in Postman choose _Import_, select `postman/ai-qa.postman_collection.json` and
  `postman/local.postman_environment.json`, pick the **AI QA local** environment, start the
  dashboard (`pnpm dev`) and run the collection in order. Each request has test scripts
  (`pm.response.code` plus one JSON field). The collection contains no secrets; `canaryPassword`
  is a fake value used to prove the API never echoes passwords. Headless:
  `npx newman run postman/ai-qa.postman_collection.json -e postman/local.postman_environment.json`.

Both suites run against the test server's own database and never call Claude or Jira.

## Configuration

All in the repo-root `.env` (see `.env.example`):

| Variable                                                            | Effect                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                                 | AI planning (Haiku), failure triage (Sonnet), assistant (Haiku). Without it everything falls back to heuristics. |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | Enables _Create Jira issue_.                                                                                     |
| `APP_SECRET`                                                        | Key for encrypting stored login credentials. Required to save a login.                                           |
| `PLAN_MODEL`, `ANALYZE_MODEL`, `ASSISTANT_MODEL`                    | Model overrides.                                                                                                 |
| `PLAYWRIGHT_CHANNEL=chrome`                                         | Use installed Google Chrome. This is also the automatic fallback.                                                |

Credentials are stored AES-256-GCM encrypted, are never returned by the API, never logged, and
never sent to Claude. Steps refer to them as `{{loginEmail}}` / `{{loginPassword}}`.

## Commands

| Command                                | What it does                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm worker`             | Dashboard on :3000 / job worker                                               |
| `pnpm demo`                            | Migrate, seed example.com, discover, plan, run, analyze                       |
| `pnpm test`                            | Engine unit tests (step grammar, planner, classifier)                         |
| `pnpm test:e2e`                        | Playwright Test suite for the dashboard (HTML report in `playwright-report/`) |
| `pnpm test:api`                        | API tests with Playwright `request` (no browser)                              |
| `pnpm lint` / `pnpm typecheck`         | ESLint / TypeScript across the workspace                                      |
| `pnpm db:migrate` / `pnpm db:generate` | Apply / create Drizzle migrations                                             |
| `pnpm enqueue <type> '<json>'`         | Queue a job by hand, e.g. `pnpm enqueue ping`                                 |

## What this MVP is, honestly

It does: crawl same-origin pages (25 pages, depth 3) with an optional form login, plan 8–25 cases,
run them in Chromium with a fresh context per case, keep screenshots and video on failure, capture
console and HTTP 5xx, triage failures into product bug, test bug, env, flake or unknown, dedupe
open bugs per case, retest, push to Jira, and answer questions about the last run.

It does not:

- run SQL against your database or check data correctness;
- open GitHub pull requests or fix code;
- test Safari, Firefox or mobile devices (Chromium only);
- "self-heal" arbitrary UI changes. A step that no longer matches is reported as blocked;
- handle SSO, MFA or CAPTCHA logins (plain email + password forms only);
- manage users, permissions or billing. There is no auth wall: the dashboard binds to 127.0.0.1 and refuses any other Host;
- replace a test-management tool.

The step grammar is deliberately small. Anything the planner writes outside it is dropped before
the plan is saved, so a plan never contains steps the runner cannot execute.
