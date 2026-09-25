const KEYS = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY"] as const;

export function jiraConfigured(): boolean {
  return KEYS.every((k) => Boolean(process.env[k]));
}
