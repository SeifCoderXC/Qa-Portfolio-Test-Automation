/**
 * Jira Cloud REST v3 adapter. User-triggered only; never called by the analyzer.
 * Tokens come from env and are never logged or returned.
 *
 * Issues follow a standard QA bug report (environment, preconditions, steps to reproduce,
 * expected, actual, severity) and fit the QA defect workflow:
 *   Open → Confirmed → In Progress → Ready for Retest → Closed  (+ Reopened, Rejected)
 */
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

export type JiraConfig = { baseUrl: string; email: string; apiToken: string; projectKey: string };

export type Attachment = { path: string; contentType: string };

export type BugForJira = {
  title: string;
  severity: string;
  classification: string;
  analysis: string;
  baseUrl: string;
  caseKey?: string;
  caseTitle?: string;
  /** Why the case exists, e.g. a cited requirement or standard. */
  objective?: string;
  preconditions?: string;
  steps?: string[];
  expected?: string;
  errorText?: string;
  environment?: { browser: string; viewport: string; testedAt?: string; runId?: string };
  /** Evidence file names, listed in the report. */
  evidence?: string[];
};

export type CreatedIssue = {
  key: string;
  url: string;
  format: "adf" | "wiki";
  attached: string[];
  attachErrors: string[];
};

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const REQUIRED = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY"] as const;

export function jiraConfig(
  env: Record<string, string | undefined> = process.env,
): JiraConfig | null {
  if (REQUIRED.some((k) => !env[k])) return null;
  return {
    baseUrl: new URL(env.JIRA_BASE_URL!).origin, // tolerate a pasted board URL
    email: env.JIRA_EMAIL!,
    apiToken: env.JIRA_API_TOKEN!,
    projectKey: env.JIRA_PROJECT_KEY!,
  };
}

/** Severity is QA's impact rating; Priority is the initial suggestion the team can change. */
export const PRIORITY_FOR_SEVERITY: Record<string, string> = {
  critical: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// --- Human-readable steps ---------------------------------------------------------

const unq = (s: string) => s.replace(/^["“']|["”']$/g, "");

/** Turn runner steps (`click "Save"`) into reproduction steps a developer can follow. */
export function humanizeStep(step: string, baseUrl: string): string {
  const s = step.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(?:go to|open|navigate to|visit)\s+(.+)$/i))) {
    const target = unq(m[1]!);
    try {
      return `Open ${new URL(target, baseUrl).toString()}`;
    } catch {
      return `Open ${target}`;
    }
  }
  if ((m = s.match(/^click(?: on)?(?: the)?\s+(.+)$/i))) return `Click ${m[1]}`;
  if ((m = s.match(/^(?:type|enter|fill)\s+(".*?")\s+(?:into|in)\s+(?:the\s+)?(.+)$/i)))
    return `Type ${m[1]!.replace(/\{\{login(Email|Password)\}\}/g, "<test account $1>")} into the ${m[2]} field`;
  if ((m = s.match(/^select\s+(".*?")\s+(?:in|from)\s+(.+)$/i))) return `Select ${m[1]} in ${m[2]}`;
  if ((m = s.match(/^press\s+(.+)$/i))) return `Press ${unq(m[1]!)}`;
  if ((m = s.match(/^wait\s+(.+)$/i))) return `Wait ${m[1]}`;
  if ((m = s.match(/^expect text\s+(.+)$/i))) return `Check that ${m[1]} is visible`;
  if ((m = s.match(/^expect title contains\s+(.+)$/i)))
    return `Check that the page title contains ${m[1]}`;
  if ((m = s.match(/^expect url contains\s+(.+)$/i))) return `Check that the URL contains ${m[1]}`;
  if (/^expect no console errors$/i.test(s)) return "Check the browser console for errors";
  if (/^expect no server errors$/i.test(s)) return "Check the network tab for HTTP 5xx responses";
  if (/^expect form fields have labels$/i.test(s))
    return "Inspect each form field: it must have a real label (not only a placeholder)";
  if (/^expect login fields have autocomplete$/i.test(s))
    return "Inspect the email/password fields: they must have autocomplete attributes";
  return s;
}

// --- Atlassian Document Format ------------------------------------------------

type AdfNode = Record<string, unknown>;
const text = (t: string, marks?: AdfNode[]): AdfNode => ({
  type: "text",
  text: t,
  ...(marks && { marks }),
});
const strong = (t: string) => text(t, [{ type: "strong" }]);
const para = (...content: AdfNode[]): AdfNode => ({ type: "paragraph", content });
const heading = (t: string): AdfNode => ({
  type: "heading",
  attrs: { level: 3 },
  content: [text(t)],
});
const list = (type: "bulletList" | "orderedList", items: AdfNode[][]): AdfNode => ({
  type,
  content: items.map((i) => ({ type: "listItem", content: [para(...i)] })),
});
const code = (t: string): AdfNode => ({ type: "codeBlock", content: [text(t)] });

export function toAdf(bug: BugForJira): AdfNode {
  const env = bug.environment;
  const c: AdfNode[] = [];

  c.push(heading("Environment"));
  c.push(
    list("bulletList", [
      [strong("URL: "), text(bug.baseUrl, [{ type: "link", attrs: { href: bug.baseUrl } }])],
      ...(env
        ? [
            [strong("Browser: "), text(`${env.browser}, viewport ${env.viewport}`)],
            ...(env.testedAt ? [[strong("Tested: "), text(env.testedAt)]] : []),
            ...(env.runId ? [[strong("AI QA run: "), text(env.runId)]] : []),
          ]
        : []),
    ]),
  );

  if (bug.preconditions) c.push(heading("Preconditions"), para(text(bug.preconditions)));

  if (bug.steps?.length) {
    c.push(heading("Steps to Reproduce"));
    c.push(
      list(
        "orderedList",
        bug.steps.map((s) => [text(humanizeStep(s, bug.baseUrl))]),
      ),
    );
  }
  if (bug.expected) c.push(heading("Expected Result"), para(text(bug.expected)));
  if (bug.errorText) c.push(heading("Actual Result"), code(bug.errorText));

  c.push(heading("Severity"));
  c.push(
    para(
      strong("Severity: "),
      text(bug.severity),
      text("    "),
      strong("Classification: "),
      text(bug.classification),
    ),
  );
  if (bug.objective) c.push(heading("Requirement"), para(text(bug.objective)));
  c.push(heading("Analysis"), para(text(bug.analysis || "(none)")));

  if (bug.caseKey || bug.evidence?.length) {
    c.push(heading("Test reference"));
    c.push(
      list("bulletList", [
        ...(bug.caseKey
          ? [
              [
                strong("Test case: "),
                text(`${bug.caseKey}${bug.caseTitle ? ` · ${bug.caseTitle}` : ""}`),
              ],
            ]
          : []),
        ...(bug.evidence?.length
          ? [[strong("Evidence: "), text(`${bug.evidence.join(", ")} (attached)`)]]
          : []),
      ]),
    );
  }
  c.push(
    para(
      text("Filed by AI QA. Move to Ready for Retest when fixed; AI QA can verify it.", [
        { type: "em" },
      ]),
    ),
  );
  return { type: "doc", version: 1, content: c };
}

/** Jira wiki markup, for the v2 fallback. */
export function toWiki(bug: BugForJira): string {
  const env = bug.environment;
  const out = [`h3. Environment`, `* *URL:* ${bug.baseUrl}`];
  if (env) {
    out.push(`* *Browser:* ${env.browser}, viewport ${env.viewport}`);
    if (env.testedAt) out.push(`* *Tested:* ${env.testedAt}`);
    if (env.runId) out.push(`* *AI QA run:* ${env.runId}`);
  }
  if (bug.preconditions) out.push(``, `h3. Preconditions`, bug.preconditions);
  if (bug.steps?.length)
    out.push(
      ``,
      `h3. Steps to Reproduce`,
      ...bug.steps.map((s) => `# ${humanizeStep(s, bug.baseUrl)}`),
    );
  if (bug.expected) out.push(``, `h3. Expected Result`, bug.expected);
  if (bug.errorText) out.push(``, `h3. Actual Result`, `{noformat}${bug.errorText}{noformat}`);
  out.push(
    ``,
    `h3. Severity`,
    `*Severity:* ${bug.severity}    *Classification:* ${bug.classification}`,
  );
  if (bug.objective) out.push(``, `h3. Requirement`, bug.objective);
  out.push(``, `h3. Analysis`, bug.analysis || "(none)");
  if (bug.caseKey)
    out.push(``, `*Test case:* ${bug.caseKey}${bug.caseTitle ? ` · ${bug.caseTitle}` : ""}`);
  if (bug.evidence?.length) out.push(`*Evidence:* ${bug.evidence.join(", ")} (attached)`);
  out.push(``, `_Filed by AI QA._`);
  return out.join("\n");
}

export function issueFields(
  bug: BugForJira,
  cfg: JiraConfig,
  format: "adf" | "wiki",
  opts: { labels?: boolean; priority?: boolean } = {},
) {
  const { labels = true, priority = true } = opts;
  const prio = PRIORITY_FOR_SEVERITY[bug.severity];
  return {
    fields: {
      project: { key: cfg.projectKey },
      issuetype: { name: "Bug" },
      summary: bug.title.replace(/\s+/g, " ").slice(0, 250), // Jira limit 255
      description: format === "adf" ? toAdf(bug) : toWiki(bug),
      ...(labels && { labels: ["ai-qa", `severity-${bug.severity}`] }),
      ...(priority && prio && { priority: { name: prio } }),
    },
  };
}

// --- HTTP ---------------------------------------------------------------------

type Fetch = typeof fetch;
type JiraBody = { key?: string; errors?: Record<string, string>; errorMessages?: string[] };

const auth = (cfg: JiraConfig) =>
  `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64")}`;

async function call(
  cfg: JiraConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: Fetch = fetch,
) {
  const res = await fetchImpl(`${cfg.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: auth(cfg),
      Accept: "application/json",
      ...(init.body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  const data = (await res.json().catch(() => ({}))) as JiraBody & Record<string, unknown>;
  if (res.status === 401 || res.status === 403)
    throw new JiraError(`Jira rejected the credentials (HTTP ${res.status})`, res.status);
  return { res, data };
}

const describe = (data: JiraBody) =>
  [
    ...(data.errorMessages ?? []),
    ...Object.entries(data.errors ?? {}).map(([k, v]) => `${k}: ${v}`),
  ].join("; ");

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Upload files to an issue. Returns what was attached and what was skipped, never throws per file. */
export async function attachFiles(
  key: string,
  files: Attachment[],
  cfg = jiraConfig(),
  fetchImpl: Fetch = fetch,
): Promise<{ attached: string[]; errors: string[] }> {
  if (!cfg) throw new JiraError("Jira not configured");
  const attached: string[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const name = basename(f.path);
    try {
      if ((await stat(f.path)).size > MAX_ATTACHMENT_BYTES) {
        errors.push(`${name}: larger than 10 MB, not attached`);
        continue;
      }
      const form = new FormData();
      form.append("file", new Blob([await readFile(f.path)], { type: f.contentType }), name);
      const res = await fetchImpl(`${cfg.baseUrl}/rest/api/3/issue/${key}/attachments`, {
        method: "POST",
        headers: {
          Authorization: auth(cfg),
          Accept: "application/json",
          "X-Atlassian-Token": "no-check",
        },
        body: form,
      });
      if (res.ok) attached.push(name);
      else errors.push(`${name}: HTTP ${res.status}`);
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { attached, errors };
}

/**
 * Create a Bug. Prefers ADF (v3); if Jira rejects the description, retries with wiki markup (v2).
 * Fields that are not on the create screen (labels, priority) are dropped and retried.
 * Attachments are uploaded after creation.
 */
export async function createIssue(
  bug: BugForJira,
  cfg = jiraConfig(),
  opts: { attachments?: Attachment[]; fetchImpl?: Fetch } = {},
): Promise<CreatedIssue> {
  if (!cfg) throw new JiraError("Jira not configured");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const fieldOpts = { labels: true, priority: true };
  for (const [apiVersion, format] of [
    [3, "adf"],
    [2, "wiki"],
  ] as const) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { res, data } = await call(
        cfg,
        `/rest/api/${apiVersion}/issue`,
        { method: "POST", body: issueFields(bug, cfg, format, fieldOpts) },
        fetchImpl,
      );
      if (res.ok && data.key) {
        const { attached, errors } = opts.attachments?.length
          ? await attachFiles(data.key, opts.attachments, cfg, fetchImpl)
          : { attached: [], errors: [] };
        return {
          key: data.key,
          url: `${cfg.baseUrl}/browse/${data.key}`,
          format,
          attached,
          attachErrors: errors,
        };
      }
      if (res.status !== 400)
        throw new JiraError(
          `Jira HTTP ${res.status}: ${describe(data) || res.statusText}`,
          res.status,
        );
      if (fieldOpts.labels && data.errors?.labels) {
        fieldOpts.labels = false;
        continue;
      }
      if (fieldOpts.priority && data.errors?.priority) {
        fieldOpts.priority = false;
        continue;
      }
      if (data.errors?.description) break; // try the next format
      throw new JiraError(`Jira refused the issue: ${describe(data)}`, 400);
    }
  }
  throw new JiraError("Jira rejected the description in both ADF and wiki format", 400);
}

// --- Workflow ---------------------------------------------------------------------

export async function getIssueStatus(key: string, cfg = jiraConfig(), fetchImpl: Fetch = fetch) {
  if (!cfg) throw new JiraError("Jira not configured");
  const { res, data } = await call(cfg, `/rest/api/3/issue/${key}?fields=status`, {}, fetchImpl);
  if (!res.ok) throw new JiraError(`Jira HTTP ${res.status}: ${describe(data)}`, res.status);
  return (data as { fields: { status: { name: string } } }).fields.status.name;
}

export async function addComment(
  key: string,
  body: string,
  cfg = jiraConfig(),
  fetchImpl: Fetch = fetch,
) {
  if (!cfg) throw new JiraError("Jira not configured");
  const { res, data } = await call(
    cfg,
    `/rest/api/3/issue/${key}/comment`,
    { method: "POST", body: { body: { type: "doc", version: 1, content: [para(text(body))] } } },
    fetchImpl,
  );
  if (!res.ok) throw new JiraError(`Jira HTTP ${res.status}: ${describe(data)}`, res.status);
}

/** Move an issue to the status called `toStatus`, using whatever transition leads there. */
export async function transitionTo(
  key: string,
  toStatus: string,
  cfg = jiraConfig(),
  fetchImpl: Fetch = fetch,
) {
  if (!cfg) throw new JiraError("Jira not configured");
  const { data } = await call(cfg, `/rest/api/3/issue/${key}/transitions`, {}, fetchImpl);
  const t = (data as { transitions?: { id: string; to: { name: string } }[] }).transitions?.find(
    (x) => x.to.name.toLowerCase() === toStatus.toLowerCase(),
  );
  if (!t) return false;
  const { res, data: d2 } = await call(
    cfg,
    `/rest/api/3/issue/${key}/transitions`,
    { method: "POST", body: { transition: { id: t.id } } },
    fetchImpl,
  );
  if (!res.ok) throw new JiraError(`Jira HTTP ${res.status}: ${describe(d2)}`, res.status);
  return true;
}

export type RetestSync = {
  statusBefore: string;
  statusAfter: string;
  action: "closed" | "reopened" | "commented";
};

/**
 * Report an AI QA retest to Jira, respecting the QA workflow:
 * - passed while "Ready for Retest"  → Closed (verified)
 * - failed while "Ready for Retest" or "Closed" → Reopened
 * - anything else → comment only; people decide.
 */
export async function syncRetest(
  key: string,
  result: { passed: boolean; caseKey: string; runId: string; errorText?: string | null },
  cfg = jiraConfig(),
  fetchImpl: Fetch = fetch,
): Promise<RetestSync> {
  if (!cfg) throw new JiraError("Jira not configured");
  const before = await getIssueStatus(key, cfg, fetchImpl);
  const verdict = result.passed ? "PASSED" : "FAILED";
  const detail = result.passed
    ? ""
    : ` Actual: ${(result.errorText ?? "see run").replace(/\.?$/, ".")}`;
  let action: RetestSync["action"] = "commented";
  let target: string | null = null;
  if (result.passed && before === "Ready for Retest") target = "Closed";
  if (!result.passed && (before === "Ready for Retest" || before === "Closed")) target = "Reopened";

  const note = target
    ? ` Status ${before} → ${target}.`
    : result.passed
      ? ` Status left at ${before}: only "Ready for Retest" is closed automatically.`
      : ` Status left at ${before}.`;
  await addComment(
    key,
    `AI QA retest of ${result.caseKey} ${verdict} (run ${result.runId}).${detail}${note}`,
    cfg,
    fetchImpl,
  );
  if (target && (await transitionTo(key, target, cfg, fetchImpl)))
    action = target === "Closed" ? "closed" : "reopened";
  return { statusBefore: before, statusAfter: await getIssueStatus(key, cfg, fetchImpl), action };
}
