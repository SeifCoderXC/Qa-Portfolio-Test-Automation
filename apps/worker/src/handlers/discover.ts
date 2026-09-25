import { join } from "node:path";
import { appMaps, evidenceDir, getDb } from "@ai-qa/db";
import { discover as crawl } from "@ai-qa/engine";
import { loadCredentials, loadProject } from "../project";
import type { Handler } from "./types";

export const discover: Handler = async (job) => {
  const project = loadProject((job.payloadJson as { projectId?: unknown }).projectId);
  const result = await crawl({
    baseUrl: project.baseUrl,
    credentials: loadCredentials(project.id),
    screenshotPath: join(evidenceDir(), project.id, "discover.png"),
    log: (m) => console.log(`  discover: ${m}`),
  });

  getDb().insert(appMaps).values({ projectId: project.id, json: result.map }).run();
  console.log(`  discover: saved map with ${result.map.pages.length} page(s)`);

  const warnings = [result.loginError, ...result.errors.slice(0, 5)].filter(Boolean);
  return warnings.length ? { warning: warnings.join("; ") } : undefined;
};
