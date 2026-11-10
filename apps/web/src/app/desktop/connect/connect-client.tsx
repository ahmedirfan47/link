"use client";

import { useState, useTransition } from "react";
import { createHandoff } from "./actions";

export function ConnectClient({ challenge, email }: { challenge: string; email: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function connect() {
    setError(null);
    start(async () => {
      const result = await createHandoff(challenge);
      if (result.error || !result.url) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      window.location.href = result.url;
      setDone(true);
    });
  }

  if (done) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Back to the app</h1>
        <p className="mt-2 text-base text-muted">
          If your browser asked to open Link, allow it. The app is now signed in as {email}. You can close this tab.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Sign in to the desktop app</h1>
      <p className="mt-2 text-base text-muted">
        The Link app on this computer will be signed in as <span className="font-semibold text-ink">{email}</span>.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-lg mt-6" onClick={connect} disabled={pending || !challenge}>
        {pending ? "Connecting…" : "Continue to the app"}
      </button>
      <p className="mt-4 text-xs text-muted">Only continue if you just clicked “Sign in with your browser” in the Link app.</p>
    </div>
  );
}