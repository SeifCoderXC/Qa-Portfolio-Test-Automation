export async function notConfigured(): Promise<boolean> {
  return !process.env.JIRA_BASE_URL || !process.env.JIRA_API_TOKEN;
}
