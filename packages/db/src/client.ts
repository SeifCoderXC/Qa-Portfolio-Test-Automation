import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { dbPath } from "./paths";

export type Db = BetterSQLite3Database<typeof schema>;

let db: Db | undefined;

export function getDb(): Db {
  if (db) return db;
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  db = drizzle(sqlite, { schema });
  return db;
}
