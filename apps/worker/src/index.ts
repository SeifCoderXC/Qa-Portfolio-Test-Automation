import { failOrphans } from "./queue";
import { drain } from "./worker";

const POLL_MS = 2000;
const drainOnly = process.argv.includes("--drain");

let stopping = false;
let wake: (() => void) | undefined;

process.on("SIGINT", () => {
  if (stopping) process.exit(130); // second Ctrl+C: stop now
  stopping = true;
  console.log("SIGINT: finishing current job, then exiting (Ctrl+C again to force)");
  wake?.();
});

const orphans = failOrphans();
if (orphans) console.log(`marked ${orphans} orphaned running job(s) as failed`);

if (drainOnly) {
  const n = await drain();
  console.log(`drained ${n} job(s)`);
} else {
  console.log(`worker idle, polling every ${POLL_MS / 1000}s`);
  while (!stopping) {
    await drain();
    if (stopping) break;
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, POLL_MS);
    });
  }
  console.log("worker stopped");
}
