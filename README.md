# ai-qa

An AI QA engineer that tests a web app, proves failures with evidence, and can open a Jira issue.

Status: repo skeleton only (slice 01). No product logic yet.

## Requirements

- Node 22+
- pnpm (no npm, no yarn)

## Setup

```bash
cp .env.example .env
pnpm install
```

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
packages/db            @ai-qa/db, SQLite access (later)
packages/integrations  @ai-qa/integrations, Jira adapter (later)
```
