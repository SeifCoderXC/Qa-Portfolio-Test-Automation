"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { primaryButton, secondaryButton } from "./ui";

export function BugActions({
  bugId,
  jiraKey,
  jiraUrl,
  jiraReady,
  canRetest,
}: {
  bugId: string;
  jiraKey: string | null;
  jiraUrl: string | null;
  jiraReady: boolean;
  canRetest: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function retest() {
    setBusy("retest");
    setMsg(null);
    const res = await fetch(`/api/bugs/${bugId}/retest`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (res.ok) router.push(`/runs/${data.runId}`);
    else setMsg(data.error);
  }

  async function pushToJira() {
    setBusy("jira");
    setMsg(null);
    const res = await fetch(`/api/bugs/${bugId}/jira`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (res.ok || res.status === 409) router.refresh();
    else setMsg(data.error);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className={secondaryButton} disabled={!canRetest || busy !== null} onClick={retest}>
        {busy === "retest" ? "Queuing…" : "Retest"}
      </button>
      {jiraKey ? (
        <a className={secondaryButton} href={jiraUrl ?? "#"} target="_blank" rel="noreferrer">
          Open {jiraKey}
        </a>
      ) : jiraReady ? (
        <button className={primaryButton} disabled={busy !== null} onClick={pushToJira}>
          {busy === "jira" ? "Creating…" : "Create Jira issue"}
        </button>
      ) : (
        <a
          className={secondaryButton}
          href={`/api/bugs/${bugId}/json`}
          download
          title="Set JIRA_* in .env to push issues"
        >
          Jira not configured · download bug.json
        </a>
      )}
      {jiraReady && !jiraKey && (
        <a className="text-sm text-muted hover:underline" href={`/api/bugs/${bugId}/json`} download>
          bug.json
        </a>
      )}
      {msg && (
        <p role="alert" className="text-sm text-rose-600">
          {msg}
        </p>
      )}
    </div>
  );
}
