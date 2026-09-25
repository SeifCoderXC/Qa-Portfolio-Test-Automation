import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { parseStep, STEP_GRAMMAR } from "./steps";
import type { AppMap, PlannedCase } from "./types";

export const MAX_MAP_CHARS = 20_000;
export const DEFAULT_PLAN_MODEL = "claude-haiku-4-5";

const SYSTEM = `You are a QA test designer. Given an application map, produce 8 to 25
test cases. Prefer smoke and negative auth/forms. JSON only:
[{key,title,objective,preconditions,steps[],expected,severity}]
No markdown. No extra keys.

Return the array as {"cases": [...]}. key is TC-001, TC-002, ...
severity is one of low, medium, high, critical.
Only use URLs, link texts, button texts, field labels and headings that appear in the map.
Put exact visible text you expect in double quotes inside "expected".
Never put real passwords in steps; use {{loginEmail}} and {{loginPassword}}.

${STEP_GRAMMAR}`;

const CaseSchema = z.object({
  key: z.string(),
  title: z.string(),
  objective: z.string(),
  preconditions: z.string(),
  steps: z.array(z.string()),
  expected: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
});
const PlanSchema = z.object({ cases: z.array(CaseSchema) });

export function truncateMap(map: AppMap): string {
  const json = JSON.stringify(map);
  return json.length <= MAX_MAP_CHARS ? json : json.slice(0, MAX_MAP_CHARS) + "…(truncated)";
}

export type AiPlanResult = { cases: PlannedCase[]; model: string; droppedSteps: number };

export async function aiPlan(
  map: AppMap,
  model = process.env.PLAN_MODEL || DEFAULT_PLAN_MODEL,
): Promise<AiPlanResult> {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Application map:\n${truncateMap(map)}` }],
    output_config: { format: zodOutputFormat(PlanSchema) },
  });
  if (res.stop_reason === "refusal") throw new Error("model refused to plan");
  if (res.stop_reason === "max_tokens") throw new Error("plan was cut off at max_tokens");
  const parsed = res.parsed_output;
  if (!parsed?.cases.length) throw new Error("model returned no cases");

  // Keep only steps the runner understands; drop cases left with none.
  let droppedSteps = 0;
  const cases = parsed.cases
    .slice(0, 25)
    .map((c, i) => {
      const steps = c.steps.slice(0, 8).filter((s) => parseStep(s) !== null);
      droppedSteps += Math.min(c.steps.length, 8) - steps.length;
      return { ...c, key: `TC-${String(i + 1).padStart(3, "0")}`, steps };
    })
    .filter((c) => c.steps.length > 0);
  if (!cases.length) throw new Error("no case had runnable steps");
  return { cases, model, droppedSteps };
}
