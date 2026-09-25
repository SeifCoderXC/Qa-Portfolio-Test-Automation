# ai-qa

An AI QA engineer that tests a web app, proves failures with evidence, and can open a Jira issue.

Status: skeleton + SQLite schema (slices 01–02). No product logic yet.

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

## Layout

```
apps/web               Next.js 15 App Router + Tailwind dashboard
apps/worker            @ai-qa/worker, long-running Node process
packages/engine        @ai-qa/engine, discover/plan/run/analyze (later)
packages/db            @ai-qa/db, SQLite + Drizzle schema, getDb()
packages/integrations  @ai-qa/integrations, Jira adapter (later)
```
