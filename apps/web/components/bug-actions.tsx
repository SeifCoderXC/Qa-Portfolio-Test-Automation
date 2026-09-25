"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { primaryButton, secondaryButton } from "./ui";

export function BugActions({
  bugId,
  jiraKey,
  jiraReady,
  canRetest,
}: {
  bugId: string;
  jiraKey: string | null;
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className={secondaryButton} disabled={!canRetest || busy !== null} onClick={retest}>
        {busy === "retest" ? "Queuing…" : "Retest"}
      </button>
      <button
        className={primaryButton}
        disabled={!jiraReady || Boolean(jiraKey) || busy !== null}
        title={jiraReady ? undefined : "Set JIRA_* in .env"}
      >
        {jiraKey ? `Jira ${jiraKey}` : jiraReady ? "Create Jira issue" : "Jira not configured"}
      </button>
      {msg && <p className="text-sm text-rose-600">{msg}</p>}
    </div>
  );
}
