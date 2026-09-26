"use client";

import { useEffect, useState } from "react";

const KEY = "aiqa-demo-banner-dismissed";

/** Shown on every page; dismissing lasts for this browser session only. */
export function DemoBanner() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(KEY) === "1");
    } catch {
      // storage blocked: keep the banner visible
    }
  }, []);

  if (hidden) return null;
  return (
    <div
      role="note"
      className="border-b border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2 text-sm sm:px-6">
        <p className="flex-1">
          Local demo. No login. Do not point this at apps or passwords you do not own. Bound to
          localhost.
        </p>
        <button
          type="button"
          className="shrink-0 underline-offset-2 hover:underline"
          onClick={() => {
            try {
              sessionStorage.setItem(KEY, "1");
            } catch {
              // ignore
            }
            setHidden(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
