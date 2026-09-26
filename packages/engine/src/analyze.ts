import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Severity } from "./types";

export type FailureClass = "product_bug" | "test_bug" | "env" | "flake" | "unknown";
export const DEFAULT_ANALYZE_MODEL = "claude-sonnet-5";

export type FailureInput = {
  caseKey: string;
  title: string;
  /** Why the case exists (e.g. a requirement or standard); tells a real rule from an invented one. */
  objective?: string;
  steps: string[];
  expected: string;
  severity: Severity;
  status: "failed" | "blocked" | "error";
  errorText: string;
  consoleTail: string[];
  serverErrors: string[];
  /** url, title and visible text of the page when the case stopped. */
  pageExcerpt?: string;
};

export type Classification = {
  class: FailureClass;
  title: string;
  analysis: string;
  severity: Severity;
  source: string;
};

const short = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Offline rules, in priority order. A failed step is not automatically a bug. */
export function heuristicClassify(f: FailureInput): Classification {
  const e = f.errorText;
  const base = { severity: f.severity, source: "heuristic" };

  if (/net::ERR_/.test(e))
    return {
      ...base,
      class: "env",
      title: `${f.caseKey}: site unreachable`,
      analysis: `The browser could not reach the page (${short(e.match(/net::ERR_\w+/)?.[0] ?? e)}). Check the URL, VPN, DNS or that the environment is up before treating this as a product defect.`,
      severity: "low",
    };

  if (/(?:page\.goto|navigation).*Timeout|Timeout.*navigating to/i.test(e))
    return {
      ...base,
      class: "env",
      title: `${f.caseKey}: page load timed out`,
      analysis: `The page did not finish loading in time (${short(e, 160)}). Usually a slow network or an overloaded server; retest before filing. If it repeats on a healthy network, it is a performance defect.`,
      severity: "low",
    };

  if (f.serverErrors.length || /server errors: HTTP 5\d\d/.test(e))
    return {
      ...base,
      class: "product_bug",
      title: `${f.caseKey}: server error during "${short(f.title, 60)}"`,
      analysis: `The application answered with an HTTP 5xx: ${short(f.serverErrors[0] ?? e, 200)}. A 5xx is a server-side failure regardless of test wording.`,
      severity: f.severity === "low" ? "medium" : f.severity,
    };

  if (f.status === "blocked")
    return {
      ...base,
      class: "test_bug",
      title: `${f.caseKey}: step could not be executed`,
      analysis: `The runner could not bind a step to the page: ${short(e, 200)}. The test refers to an element or wording the page does not have; update the test case (or the element was renamed).`,
      severity: "low",
    };

  if (/Timeout/i.test(e) && /locator|waiting for/i.test(e)) {
    const flaky = /detached|not stable|intercepts pointer events|element is not visible/i.test(e);
    return {
      ...base,
      class: flaky ? "flake" : "test_bug",
      title: `${f.caseKey}: timed out on an element`,
      analysis: flaky
        ? `The element existed but was unstable (moving, covered or re-rendered): ${short(e, 200)}. Retest before filing.`
        : `The action timed out waiting for an element: ${short(e, 200)}. Most likely a selector that no longer matches.`,
      severity: "low",
    };
  }

  if (/^expected (text|title|url|result)/.test(e))
    return {
      ...base,
      class: "product_bug",
      title: `${f.caseKey}: ${short(f.title, 60)} - expectation not met`,
      analysis: `The page did not show what the case expects. ${short(e, 200)}. Expected: ${short(f.expected.replace(/\.+$/, ""), 200)}. Confirm the requirement: if the expectation is right, this is a product defect.`,
    };

  if (/^console errors:/.test(e))
    return {
      ...base,
      class: "product_bug",
      title: `${f.caseKey}: JavaScript errors on page`,
      analysis: `The page logged errors: ${short(f.consoleTail.join(" | "), 300)}.`,
      severity: f.severity,
    };

  return {
    ...base,
    class: "unknown",
    title: `${f.caseKey}: ${short(f.title, 60)} failed`,
    analysis: `Unclassified failure: ${short(e, 300)}.`,
  };
}

const ClassificationSchema = z.object({
  class: z.enum(["product_bug", "test_bug", "env", "flake", "unknown"]),
  title: z.string(),
  analysis: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

const SYSTEM = `You are a senior QA lead triaging one failed automated UI test.
Classify the failure:
- product_bug: the application misbehaves (wrong content, server error, broken flow).
- test_bug: the test itself is wrong (selector/wording that does not exist, bad expectation, impossible step).
- env: the environment failed (DNS, network, site down, certificates).
- flake: timing or instability; likely passes on retry.
- unknown: not enough evidence.
A failed step is not automatically a product bug. Prefer test_bug when the expectation looks invented or the page never had that element.
finalPage is what the browser showed when the case stopped; compare it with the expectation.
case.objective states why the case exists. If it cites a requirement or standard the page violates, that is a product_bug even when the page never had the expected element.
title: a Jira-style summary under 90 characters. analysis: 2-4 sentences citing the evidence. severity: low, medium, high or critical.`;

export async function aiClassify(
  f: FailureInput,
  model = process.env.ANALYZE_MODEL || DEFAULT_ANALYZE_MODEL,
): Promise<Classification> {
  const client = new Anthropic();
  const evidence = {
    case: {
      key: f.caseKey,
      title: f.title,
      objective: f.objective ?? "",
      steps: f.steps,
      expected: f.expected,
      severity: f.severity,
    },
    result: { status: f.status, errorText: f.errorText.slice(0, 2000) },
    consoleTail: f.consoleTail.slice(-20),
    serverErrors: f.serverErrors.slice(0, 10),
    finalPage: f.pageExcerpt?.slice(0, 3000) ?? null,
    heuristicGuess: heuristicClassify(f).class,
  };
  const res = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
    messages: [{ role: "user", content: JSON.stringify(evidence) }],
  });
  if (res.stop_reason === "refusal") throw new Error("model refused to classify");
  if (!res.parsed_output) throw new Error(`no classification (stop_reason ${res.stop_reason})`);
  return {
    ...res.parsed_output,
    title: short(res.parsed_output.title, 120),
    source: `ai:${model}`,
  };
}
