// Usage: pnpm enqueue <type> ['{"json":"payload"}']
import { JOB_TYPES, type JobType } from "@ai-qa/db";
import { enqueue } from "../src/queue";

const [type, payload = "{}"] = process.argv.slice(2);
if (!JOB_TYPES.includes(type as JobType)) {
  console.error(`usage: pnpm enqueue <${JOB_TYPES.join("|")}> [json payload]`);
  process.exit(1);
}
const job = enqueue(type as JobType, JSON.parse(payload));
console.log(`queued ${job.type} job ${job.id}`);
