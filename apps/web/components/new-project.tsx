"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { primaryButton } from "./ui";

type ApiError = { error: string; details?: Record<string, string> };

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export function NewProjectForm() {
  const router = useRouter();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await res.json();
      if (!res.ok) return setErr(data);
      form.reset();
      setCreatedId(data.id);
      router.push(`/plans?p=${data.id}`);
      router.refresh();
    } catch {
      setErr({ error: "network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="grid grid-cols-1 gap-1.5 text-sm">
        Name
        <input name="name" required className={input} placeholder="Staging app" />
      </label>
      <label className="grid grid-cols-1 gap-1.5 text-sm">
        URL
        <input
          name="baseUrl"
          type="url"
          required
          placeholder="https://example.com"
          className={input}
        />
      </label>
      <label className="grid grid-cols-1 gap-1.5 text-sm">
        Login email <span className="text-xs text-muted">optional</span>
        <input name="loginEmail" type="email" autoComplete="off" className={input} />
      </label>
      <label className="grid grid-cols-1 gap-1.5 text-sm">
        Login password <span className="text-xs text-muted">optional, stored encrypted</span>
        <input name="loginPassword" type="password" autoComplete="new-password" className={input} />
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Creating…" : "Create project"}
        </button>
        {createdId && (
          <p className="text-sm text-muted" data-testid="project-id">
            Created project <code>{createdId}</code>
          </p>
        )}
      </div>
      {err && (
        <div className="text-sm text-rose-600 sm:col-span-2" role="alert">
          <p>{err.error}</p>
          {err.details && (
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(err.details).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
