// pnpm sql:check: run sql/checks.sql against the database; exit 1 if any @check returns rows.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runChecks } from "../src/integrity";
import { dbPath, repoRoot } from "../src/paths";

const file = dbPath();
if (!existsSync(file)) {
  console.error(`no database at ${file}; run \`pnpm db:migrate\` (and \`pnpm demo\`) first`);
  process.exit(2);
}

const outcomes = runChecks(file, join(repoRoot(), "sql", "checks.sql"));
const checks = outcomes.filter((o) => o.kind === "check");
const failed = checks.filter((o) => o.rows.length > 0);

console.log(`database: ${file}\n`);
for (const c of checks) {
  console.log(`${c.rows.length ? "✗" : "✓"} ${c.name.padEnd(36)} ${c.description}`);
  // Rows are ids, statuses, lengths and names only; checks.sql never selects secret values.
  for (const row of c.rows.slice(0, 5)) console.log(`    ${JSON.stringify(row)}`);
  if (c.rows.length > 5) console.log(`    … ${c.rows.length - 5} more`);
}
for (const r of outcomes.filter((o) => o.kind === "report")) {
  console.log(`\n${r.name}: ${r.description}`);
  console.table(r.rows);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
