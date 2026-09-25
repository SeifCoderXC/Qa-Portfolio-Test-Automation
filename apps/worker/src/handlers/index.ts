import type { JobType } from "@ai-qa/db";
import { analyze } from "./analyze";
import { discover } from "./discover";
import { ping } from "./ping";
import { plan } from "./plan";
import { retest } from "./retest";
import { run } from "./run";
import type { Handler } from "./types";

export const handlers: Record<JobType, Handler> = { ping, discover, plan, run, analyze, retest };
