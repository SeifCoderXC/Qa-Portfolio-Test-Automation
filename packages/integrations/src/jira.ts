/**
 * Jira Cloud REST v3 adapter. User-triggered only; never called by the analyzer.
 * Tokens come from env and are never logged or returned.
 */

export type JiraConfig = { baseUrl: string; email: string; apiToken: string; projectKey: string };

export type BugForJira = {
  title: string;
  severity: string;
  classification: string;
  analysis: string;
  baseUrl: string;
  caseKey?: string;
  caseTitle?: string;
  steps?: string[];
  expected?: string;
  errorText?: string;
  evidence?: string[];
};

export type CreatedIssue = { key: string; url: string; format: "adf" | "wiki" };

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

// --- Atlassian Document Format ------------------------------------------------

type AdfNode = Record<string, unknown>;
const text = (t: string, marks?: AdfNode[]): AdfNode => ({
  type: "text",
  text: t,
  ...(marks && { marks }),
});
const para = (...content: AdfNode[]): AdfNode => ({ type: "paragraph", content });
const heading = (t: string): AdfNode => ({
  type: "heading",
  attrs: { level: 3 },
  content: [text(t)],
});
const list = (type: "bulletList" | "orderedList", items: string[]): AdfNode => ({
  type,
  content: items.map((i) => ({ type: "listItem", content: [para(text(i))] })),
});
const code = (t: string): AdfNode => ({ type: "codeBlock", content: [text(t)] });

export function toAdf(bug: BugForJira): AdfNode {
  const content: AdfNode[] = [heading("Analysis"), para(text(bug.analysis || "(none)"))];
  content.push(
    para(
      text("Classification: ", [{ type: "strong" }]),
      text(bug.classification),
      text("   Severity: ", [{ type: "strong" }]),
      text(bug.severity),
      text("   App: ", [{ type: "strong" }]),
      text(bug.baseUrl, [{ type: "link", attrs: { href: bug.baseUrl } }]),
    ),
  );
  if (bug.steps?.length) {
    content.push(
      heading(
        `Steps${bug.caseKey ? ` (${bug.caseKey}${bug.caseTitle ? ` · ${bug.caseTitle}` : ""})` : ""}`,
      ),
    );
    content.push(list("orderedList", bug.steps));
  }
  if (bug.expected) content.push(heading("Expected"), para(text(bug.expected)));
  if (bug.errorText) content.push(heading("Actual"), code(bug.errorText));
  if (bug.evidence?.length)
    content.push(heading("Evidence (local paths)"), list("bulletList", bug.evidence));
  content.push(para(text("Filed by AI QA.", [{ type: "em" }])));
  return { type: "doc", version: 1, content };
}

/** Jira wiki markup, for the v2 fallback. */
export function toWiki(bug: BugForJira): string {
  const out = [
    `h3. Analysis`,
    bug.analysis || "(none)",
    ``,
    `*Classification:* ${bug.classification}  *Severity:* ${bug.severity}  *App:* ${bug.baseUrl}`,
  ];
  if (bug.steps?.length)
    out.push(
      ``,
      `h3. Steps${bug.caseKey ? ` (${bug.caseKey})` : ""}`,
      ...bug.steps.map((s) => `# ${s}`),
    );
  if (bug.expected) out.push(``, `h3. Expected`, bug.expected);
  if (bug.errorText) out.push(``, `h3. Actual`, `{noformat}${bug.errorText}{noformat}`);
  if (bug.evidence?.length)
    out.push(``, `h3. Evidence (local paths)`, ...bug.evidence.map((e) => `* ${e}`));
  out.push(``, `_Filed by AI QA._`);
  return out.join("\n");
}

export function issueFields(
  bug: BugForJira,
  cfg: JiraConfig,
  format: "adf" | "wiki",
  withLabels = true,
) {
  return {
    fields: {
      project: { key: cfg.projectKey },
      issuetype: { name: "Bug" },
      summary: bug.title.replace(/\s+/g, " ").slice(0, 250), // Jira limit 255
      description: format === "adf" ? toAdf(bug) : toWiki(bug),
      ...(withLabels && { labels: ["ai-qa", `severity-${bug.severity}`] }),
    },
  };
}

type Fetch = typeof fetch;

async function post(cfg: JiraConfig, apiVersion: 2 | 3, body: unknown, fetchImpl: Fetch) {
  const res = await fetchImpl(`${cfg.baseUrl}/rest/api/${apiVersion}/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    key?: string;
    errors?: Record<string, string>;
    errorMessages?: string[];
  };
  return { res, data };
}

const describe = (data: { errors?: Record<string, string>; errorMessages?: string[] }) =>
  [
    ...(data.errorMessages ?? []),
    ...Object.entries(data.errors ?? {}).map(([k, v]) => `${k}: ${v}`),
  ].join("; ");

/**
 * Create a Bug. Prefers ADF (v3); if Jira rejects the description, retries with wiki markup (v2).
 * If the labels field is not on the create screen, retries without labels.
 */
export async function createIssue(
  bug: BugForJira,
  cfg = jiraConfig(),
  fetchImpl: Fetch = fetch,
): Promise<CreatedIssue> {
  if (!cfg) throw new JiraError("Jira not configured");
  let withLabels = true;
  for (const [apiVersion, format] of [
    [3, "adf"],
    [2, "wiki"],
  ] as const) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { res, data } = await post(
        cfg,
        apiVersion,
        issueFields(bug, cfg, format, withLabels),
        fetchImpl,
      );
      if (res.ok && data.key)
        return { key: data.key, url: `${cfg.baseUrl}/browse/${data.key}`, format };
      if (res.status === 401 || res.status === 403)
        throw new JiraError(`Jira rejected the credentials (HTTP ${res.status})`, res.status);
      if (res.status !== 400)
        throw new JiraError(
          `Jira HTTP ${res.status}: ${describe(data) || res.statusText}`,
          res.status,
        );
      if (withLabels && data.errors?.labels) {
        withLabels = false;
        continue;
      }
      if (data.errors?.description) break; // try the next format
      throw new JiraError(`Jira refused the issue: ${describe(data)}`, 400);
    }
  }
  throw new JiraError("Jira rejected the description in both ADF and wiki format", 400);
}
