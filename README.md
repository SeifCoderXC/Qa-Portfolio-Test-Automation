# ai-qa

An AI QA engineer that tests a web app, proves failures with evidence, and can open a Jira issue.

Status: skeleton, SQLite schema, project API (slices 01–03).

## Requirements

- Node 22+
- pnpm (no npm, no yarn)

## Setup

```bash
cp .env.example .env   # set APP_SECRET to any long random string
pnpm install
pnpm db:migrate        # creates data/ai-qa.sqlite
pnpm db:seed           # inserts project "Demo" (https://example.com)
```

After editing `packages/db/src/schema.ts`, run `pnpm db:generate` then `pnpm db:migrate`.

## Run

```bash
pnpm dev      # Next.js dashboard on http://localhost:3000
pnpm worker   # background worker (currently prints "worker idle")
pnpm lint     # lint all packages
```

## API

```
POST /api/projects           {name, baseUrl, loginEmail?, loginPassword?}  -> 201 project
GET  /api/projects                                                          -> project[]
GET  /api/projects/:id                                                      -> project + secretKinds
POST /api/projects/:id/jobs  {type: "discover"}                             -> 201 queued job
```

`baseUrl` must be http(s) without embedded credentials. Login email and password go
together; both are stored AES-GCM encrypted with `APP_SECRET` and never returned.
The web app reads the repo-root `.env`.

## Layout

```
apps/web               Next.js 15 App Router + Tailwind dashboard
apps/worker            @ai-qa/worker, long-running Node process
packages/engine        @ai-qa/engine, discover/plan/run/analyze (later)
packages/db            @ai-qa/db, SQLite + Drizzle schema, getDb()
packages/integrations  @ai-qa/integrations, Jira adapter (later)
```
