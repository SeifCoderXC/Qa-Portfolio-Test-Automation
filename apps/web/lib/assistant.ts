import Anthropic from "@anthropic-ai/sdk";
import { asc, eq, getDb, testCases } from "@ai-qa/db";
import { listBugs, recentRuns, runDetail } from "./queries";
import { enqueueRun } from "./runs";

export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-haiku-4-5";
export const MAX_TURNS = 10;

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AssistantReply = {
  reply: string;
  jobId?: string;
  runId?: string;
  source: "ai" | "offline" | "action";
};

const SYSTEM = `You are the assistant inside AI QA, a tool that tests web apps.
Answer only from the CONTEXT JSON (the last test run and the latest bugs). Never invent results.
Be brief: at most 120 words. Plain text only: the chat does not render markdown, so no asterisks, bold or headings.
When asked why something failed, quote the stored analysis and name the case key.
If the context does not contain the answer, say so.
You cannot run anything yourself; tell the user they can type "retest <case name or key>" or "retest failed".`;

/** Last run + last 5 bugs: the only context the model sees. */
export function buildContext(projectId: string) {
  const last = recentRuns(projectId, 1)[0];
  const detail = last ? runDetail(last.id) : undefined;
  const results = detail?.results ?? [];
  const count = (s: string) => results.filter((r) => r.status === s).length;
  return {
    lastRun: detail
      ? {
          id: detail.run.id,
          status: detail.run.status,
          startedAt: detail.run.startedAt,
          total: results.length,
          passed: count("passed"),
          failed: count("failed"),
          blocked: count("blocked"),
          error: count("error"),
          notPassed: results
            .filter((r) => r.status !== "passed")
            .map((r) => ({
              caseKey: r.caseKey,
              title: r.title,
              status: r.status,
              classification: r.classification,
              analysis: r.analysis,
              errorText: r.errorText?.slice(0, 300),
            })),
        }
      : null,
    bugs: listBugs(projectId)
      .slice(0, 5)
      .map((b) => ({
        title: b.title,
        severity: b.severity,
        classification: b.classification,
        status: b.status,
        jiraKey: b.jiraKey,
        analysis: (b.analysis ?? "").split("\n\nEvidence: ")[0],
      })),
  };
}

type Context = ReturnType<typeof buildContext>;

export function offlineSummary(ctx: Context): string {
  const r = ctx.lastRun;
  if (!r) return "No runs yet.";
  const openBugs = ctx.bugs.filter((b) => b.status === "open").length;
  return `Last run ${r.status}: ${r.passed} passed, ${r.failed} failed, ${r.blocked} blocked, ${r.error} error, of ${r.total}. Open bugs: ${openBugs}.`;
}

/** The one action the assistant can take. */
export function enqueueRetest(projectId: string, caseIds: string[], planId: string) {
  return enqueueRun(projectId, { type: "retest", caseIds, planId });
}

const FILLER = new Set([
  "the",
  "a",
  "an",
  "case",
  "cases",
  "test",
  "tests",
  "please",
  "again",
  "it",
  "that",
  "those",
  "this",
  "and",
  "for",
  "on",
  "of",
]);

/** "retest checkout" / "retest TC-004" / "retest failed". Returns null when the message is not a retest request. */
export function parseRetest(message: string): { query: string } | null {
  const m = message.match(/\bre-?(?:test|run)\b(.*)$/i);
  return m ? { query: m[1]!.trim() } : null;
}

const wantsFailed = (q: string) => !q || /\bfail|failures?\b|broken|red\b/.test(q.toLowerCase());

export function resolveCases(projectId: string, query: string) {
  const last = recentRuns(projectId, 1)[0];
  const detail = last ? runDetail(last.id) : undefined;
  if (!detail)
    return { planId: null, cases: [] as { id: string; caseKey: string; title: string }[] };
  const all = getDb()
    .select({ id: testCases.id, caseKey: testCases.caseKey, title: testCases.title })
    .from(testCases)
    .where(eq(testCases.planId, detail.run.planId))
    .orderBy(asc(testCases.caseKey))
    .all();

  const q = query.toLowerCase();
  if (wantsFailed(q)) {
    const failedKeys = new Set(
      detail.results.filter((r) => r.status !== "passed").map((r) => r.caseKey),
    );
    return { planId: detail.run.planId, cases: all.filter((c) => failedKeys.has(c.caseKey)) };
  }
  const keys = [...q.matchAll(/tc-?(\d{1,3})/g)].map((m) => `TC-${m[1]!.padStart(3, "0")}`);
  if (keys.length)
    return { planId: detail.run.planId, cases: all.filter((c) => keys.includes(c.caseKey)) };

  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !FILLER.has(w));
  return {
    planId: detail.run.planId,
    cases: words.length
      ? all.filter((c) => words.every((w) => c.title.toLowerCase().includes(w)))
      : [],
  };
}

export async function answer(projectId: string, history: ChatMessage[]): Promise<AssistantReply> {
  const last = history[history.length - 1]!;
  const retest = parseRetest(last.content);
  if (retest) {
    const { planId, cases } = resolveCases(projectId, retest.query);
    if (!planId) return { reply: "There is no run yet to retest from.", source: "action" };
    if (!cases.length)
      return {
        reply: wantsFailed(retest.query)
          ? "Nothing to retest: every case in the last run passed."
          : `No case matches "${retest.query}". Try a case key like TC-003, or "retest failed".`,
        source: "action",
      };
    const res = enqueueRetest(
      projectId,
      cases.map((c) => c.id),
      planId,
    );
    if (!res.ok) return { reply: res.error, source: "action" };
    return {
      reply: `Queued a retest of ${cases.map((c) => c.caseKey).join(", ")} (job ${res.job.id.slice(0, 8)}).`,
      jobId: res.job.id,
      runId: res.run.id,
      source: "action",
    };
  }

  const ctx = buildContext(projectId);
  if (!process.env.ANTHROPIC_API_KEY) return { reply: offlineSummary(ctx), source: "offline" };

  const client = new Anthropic();
  const res = await client.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: 1024,
    system: `${SYSTEM}\n\nCONTEXT:\n${JSON.stringify(ctx)}`,
    messages: history.slice(-(MAX_TURNS * 2 - 1)),
  });
  const text = res.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
  if (res.stop_reason === "refusal" || !text)
    return { reply: offlineSummary(ctx), source: "offline" };
  return { reply: text, source: "ai" };
}
