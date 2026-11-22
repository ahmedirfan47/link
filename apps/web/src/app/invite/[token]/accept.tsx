"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6">
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvite(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Accepting…" : "Accept invite"}
      </button>
    </div>
  );
}
