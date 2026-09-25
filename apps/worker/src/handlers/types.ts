import type { Job } from "../queue";

/** Return a warning to keep the job "done" but record a problem (e.g. login failed). */
export type HandlerResult = void | { warning?: string };
export type Handler = (job: Job) => Promise<HandlerResult>;
