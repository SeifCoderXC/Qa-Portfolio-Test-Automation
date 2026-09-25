import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Walk up from cwd to the directory holding pnpm-workspace.yaml. */
export function repoRoot(from = process.cwd()): string {
  let dir = resolve(from);
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`pnpm-workspace.yaml not found above ${from}`);
    dir = parent;
  }
  return dir;
}

/** DATABASE_PATH overrides; default is <repo>/data/ai-qa.sqlite. */
export function dbPath(): string {
  return process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH)
    : join(repoRoot(), "data", "ai-qa.sqlite");
}

export function migrationsDir(): string {
  return join(repoRoot(), "packages", "db", "drizzle");
}

/** Root for screenshots, videos and logs: <repo>/data/evidence. */
export function evidenceDir(): string {
  return join(dirname(dbPath()), "evidence");
}
