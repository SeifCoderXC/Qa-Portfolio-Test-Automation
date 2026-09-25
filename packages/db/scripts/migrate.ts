import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../src/client";
import { dbPath, migrationsDir } from "../src/paths";

migrate(getDb(), { migrationsFolder: migrationsDir() });
console.log(`migrated ${dbPath()}`);
