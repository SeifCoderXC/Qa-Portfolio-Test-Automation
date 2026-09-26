import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

export type SqlStatement = {
  kind: "check" | "report";
  name: string;
  description: string;
  sql: string;
};
export type SqlOutcome = SqlStatement & { rows: Record<string, unknown>[] };

const MARKER = /^--\s*@(check|report)\s+([\w-]+):\s*(.+)$/;

/** Split checks.sql on its `-- @check name: …` / `-- @report name: …` marker lines. */
export function parseChecks(text: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let cur: SqlStatement | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(MARKER);
    if (m) {
      if (cur) out.push(cur);
      cur = { kind: m[1] as SqlStatement["kind"], name: m[2]!, description: m[3]!.trim(), sql: "" };
    } else if (cur && !/^\s*--/.test(line)) {
      cur.sql += line + "\n";
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ ...s, sql: s.sql.trim().replace(/;\s*$/, "") }));
}

/** Run parsed statements on an open connection. Checks pass when they return no rows. */
export function runChecksOn(db: Database.Database, statements: SqlStatement[]): SqlOutcome[] {
  return statements.map((s) => ({
    ...s,
    rows: db.prepare(s.sql).all() as Record<string, unknown>[],
  }));
}

/** Open the database read-only and run every statement in checks.sql. */
export function runChecks(dbFile: string, checksFile: string): SqlOutcome[] {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    return runChecksOn(db, parseChecks(readFileSync(checksFile, "utf8")));
  } finally {
    db.close();
  }
}
