"use client";

import { useState, type FormEvent } from "react";

type Created = { id: string; name: string; baseUrl: string; hasLogin: boolean };
type ApiError = { error: string; details?: Record<string, string> };

export default function Home() {
  const [created, setCreated] = useState<Created | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setErr(null);
    setCreated(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await res.json();
      if (res.ok) {
        setCreated(data);
        form.reset();
      } else {
        setErr(data);
      }
    } catch {
      setErr({ error: "network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-semibold">AI QA</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col">
          Name
          <input name="name" required className="border p-1" />
        </label>
        <label className="flex flex-col">
          URL
          <input
            name="baseUrl"
            type="url"
            required
            placeholder="https://example.com"
            className="border p-1"
          />
        </label>
        <fieldset className="flex flex-col gap-3 border p-3">
          <legend>Login (optional)</legend>
          <label className="flex flex-col">
            Email
            <input name="loginEmail" type="email" autoComplete="off" className="border p-1" />
          </label>
          <label className="flex flex-col">
            Password
            <input
              name="loginPassword"
              type="password"
              autoComplete="new-password"
              className="border p-1"
            />
          </label>
        </fieldset>
        <button type="submit" disabled={busy} className="border p-2 disabled:opacity-50">
          {busy ? "Creating…" : "Submit"}
        </button>
      </form>

      {created && (
        <p className="mt-6" data-testid="project-id">
          Created project <code>{created.id}</code>
          {created.hasLogin && " (credentials stored encrypted)"}
        </p>
      )}
      {err && (
        <div className="mt-6 text-red-700" role="alert">
          <p>{err.error}</p>
          {err.details && (
            <ul>
              {Object.entries(err.details).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
