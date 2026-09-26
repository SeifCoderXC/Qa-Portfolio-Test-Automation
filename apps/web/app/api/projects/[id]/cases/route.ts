import { getDb, testCases } from "@ai-qa/db";
import { hasAssertion, parseStep, writesData } from "@ai-qa/engine/pure";
import { error, json, readJson } from "@/lib/http";
import { casesOf, latestPlan } from "@/lib/plans";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

/** Cases of the project's latest plan. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = latestPlan(id);
  if (!plan) return error(404, "no plan yet");
  return json({ plan, cases: casesOf(plan.id) });
}

/**
 * Add a hand-written case to the latest plan, e.g. a requirement the planners cannot know.
 * Body: {title, objective?, preconditions?, steps: string[], expected?, severity?}
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await readJson(req);
  if (!read.ok) return error(400, "invalid JSON body");
  const b = (read.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const errors: Record<string, string> = {};
  const title = str(b.title);
  if (!title) errors.title = "required";
  const steps = Array.isArray(b.steps)
    ? b.steps
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!steps.length) errors.steps = "at least one step";
  else if (steps.length > 8) errors.steps = "at most 8 steps";
  else {
    const bad = steps.filter((s) => !parseStep(s));
    if (bad.length)
      errors.steps = `not in the step language: ${bad.map((s) => `"${s}"`).join(", ")}`;
  }
  const expected = str(b.expected);
  if (!errors.steps && !hasAssertion(steps, expected))
    errors.steps = 'add an "expect …" step or quoted text in Expected; a case must check something';
  const severity = (SEVERITIES as readonly string[]).includes(str(b.severity))
    ? (str(b.severity) as (typeof SEVERITIES)[number])
    : "medium";
  if (Object.keys(errors).length) return error(400, "validation failed", errors);

  const plan = latestPlan(id);
  if (!plan) return error(404, "no plan yet; generate one first");
  const next =
    casesOf(plan.id).reduce((n, c) => Math.max(n, Number(c.caseKey.replace(/\D/g, "")) || 0), 0) +
    1;
  const row = getDb()
    .insert(testCases)
    .values({
      planId: plan.id,
      caseKey: `TC-${String(next).padStart(3, "0")}`,
      title: title.endsWith("(manual)") ? title : `${title} (manual)`,
      objective: str(b.objective),
      preconditions: str(b.preconditions),
      stepsJson: steps,
      expected,
      severity,
      approved: false,
      risk: writesData(steps),
    })
    .returning()
    .get();
  return json(row, 201);
}
