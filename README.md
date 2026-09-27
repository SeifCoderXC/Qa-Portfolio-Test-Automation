# AI QA

[![CI](https://github.com/SeifCoderXC/Qa-Portfolio-Test-Automation/actions/workflows/ci.yml/badge.svg)](https://github.com/SeifCoderXC/Qa-Portfolio-Test-Automation/actions/workflows/ci.yml)

Local AI-assisted QA console: discover a URL, generate cases, run Playwright, attach evidence,
optional Jira.

You give it a URL. It crawls same-origin pages, proposes test cases, and a person approves them.
It runs the approved cases in Chromium, keeps a screenshot, video, console and network log for
every failure, and sorts each failure into product bug, test bug, environment, flake or unknown.
Only product bugs become bug rows, and a person decides whether to file them in Jira. Without an
API key everything runs offline on heuristics and rules.

## Limits

- Chromium only: no Safari, Firefox or mobile devices.
- Crawls at most 25 pages, depth 3, same origin.
- Logins: plain email + password forms only. No SSO, MFA or CAPTCHA.
- Test steps use a small grammar. Steps outside it are dropped; a step that no longer matches the
  page marks the case **blocked**. There is no "self-healing".
- The AI classification can be wrong. Every failure keeps its evidence so a person can check it.
- No login wall: the dashboard binds to 127.0.0.1 and refuses any other Host. Do not expose it.
- Tested on one real app and example.com, by one person, over a few days.

## What it is not

- Not a hosted SaaS, and not multi-user (no accounts, permissions or billing).
- Not a replacement for a QA team or a test-management tool.
- Not autonomous: people approve cases, trigger runs and file bugs.
- It does not open pull requests, fix code, or check data in your database.

## Who it is for

- Coursework on test method: plans, cases, expected vs actual, severity, evidence, triage.
- A local prototype for trying AI-assisted planning and triage on your own staging app.

## Install and try it

Requirements: Node 22+, pnpm, Google Chrome or Playwright's Chromium. No API key needed.

```bash
git clone https://github.com/SeifCoderXC/Qa-Portfolio-Test-Automation.git ai-qa && cd ai-qa
pnpm install
cp .env.example .env          # optional, every value may stay empty
pnpm browser:install          # Playwright Chromium (skip if Google Chrome is installed)
pnpm demo                     # example.com: discover -> plan -> run -> analyze
pnpm dev                      # dashboard: http://localhost:3000
```

In a second terminal, keep the worker running so buttons in the dashboard do something:

```bash
pnpm worker
```

Tests:

```bash
pnpm test         # unit tests + SQL planted-defect tests
pnpm test:e2e     # Playwright Test suite for the dashboard
pnpm test:api     # API tests with Playwright request
pnpm sql:check    # SQL integrity checks on data/ai-qa.sqlite
```

Optional settings in `.env` (all empty in `.env.example`): `ANTHROPIC_API_KEY` for AI planning and
triage, `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` / `JIRA_PROJECT_KEY` for Jira, and
`APP_SECRET` to store a login for the app under test.

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
`UPDATE`, and runs it with `packages/engine`: Playwright crawls, executes steps and collects
evidence; Claude, when a key is set, writes test cases and triages failures. Engine
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

## SQL integrity checks

`sql/checks.sql` holds 31 hand-written SQLite checks (orphans, allowed values, business rules,
secrets stored encrypted) plus 5 reports. `pnpm sql:check` runs them read-only against
`data/ai-qa.sqlite` and exits 1 if any check returns rows. Each check is proven to fire by a
planted-defect test. See [sql/README.md](sql/README.md).

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main` (Ubuntu, Node 22, Chromium
only): install from the lockfile → lint → typecheck → unit tests → API tests → dashboard tests →
SQL checks → `pnpm demo` on example.com → SQL checks on the demo data. It uses **no secrets**: the
offline heuristics keep it green, and nothing can call Claude or Jira. On failure the Playwright
report is uploaded as an artifact.

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
| `pnpm sql:check`                       | Hand-written SQL integrity checks on the database (`sql/checks.sql`)          |
| `pnpm lint` / `pnpm typecheck`         | ESLint / TypeScript across the workspace                                      |
| `pnpm db:migrate` / `pnpm db:generate` | Apply / create Drizzle migrations                                             |
| `pnpm enqueue <type> '<json>'`         | Queue a job by hand, e.g. `pnpm enqueue ping`                                 |

## Scope

It crawls same-origin pages with an optional form login, plans 8–25 cases, runs them with a fresh
browser context per case, keeps screenshots and video on failure, captures console and HTTP 5xx,
triages failures, dedupes open bugs per case, retests, pushes to Jira on request, and answers
questions about the last run. See [Limits](#limits) at the top.

The step grammar is deliberately small. Anything the planner writes outside it is dropped before
the plan is saved, so a plan never contains steps the runner cannot execute.
