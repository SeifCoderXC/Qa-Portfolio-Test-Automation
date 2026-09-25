"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Card, primaryButton } from "./ui";

type Msg = { role: "user" | "assistant"; content: string; runId?: string };
const MAX_TURNS = 10;
const SUGGESTIONS = ["Why did it fail?", "Summarize the last run", "retest failed"];

export function AssistantChat({
  projectId,
  projectName,
  hasAi,
}: {
  projectId: string;
  projectName: string;
  hasAi: boolean;
}) {
  const [history, setHistory] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...history, { role: "user" as const, content }].slice(-MAX_TURNS * 2);
    setHistory(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      setHistory([
        ...next,
        {
          role: "assistant",
          content: res.ok ? data.reply : `Error: ${data.error}`,
          runId: data.runId,
        },
      ]);
    } catch {
      setHistory([...next, { role: "assistant", content: "Error: network" }]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Assistant</h1>
        <p className="text-sm text-muted">
          Ask about the last run of {projectName}.{" "}
          {hasAi
            ? "Answers come from stored results and bug analyses."
            : "Offline: answers are the raw last-run numbers."}
        </p>
      </div>

      <Card className="grid grid-cols-1 gap-4">
        {history.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3" aria-live="polite">
            {history.map((m, i) => (
              <li key={i} className={m.role === "user" ? "justify-self-end" : "justify-self-start"}>
                <div
                  className={`max-w-prose rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-accent text-white" : "bg-bg"
                  }`}
                >
                  {m.content}
                  {m.runId && (
                    <Link
                      href={`/runs/${m.runId}`}
                      className="mt-1 block font-medium text-accent hover:underline"
                    >
                      Watch the run →
                    </Link>
                  )}
                </div>
              </li>
            ))}
            {busy && <li className="text-sm text-muted">Thinking…</li>}
          </ul>
        )}

        <form onSubmit={onSubmit} className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={2}
            placeholder='Ask "why did it fail?" or type "retest checkout"'
            aria-label="Message"
            className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" disabled={busy || !draft.trim()} className={primaryButton}>
            Send
          </button>
        </form>
      </Card>
    </div>
  );
}
