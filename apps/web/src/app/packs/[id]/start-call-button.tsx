"use client";

import Link from "next/link";
import { useState } from "react";
import { PlayIcon } from "@/components/icons";
import { DESKTOP_SCHEME } from "@/lib/releases";

/** Opens the desktop app straight into this pack. Shows a download hint if nothing seems to happen. */
export function StartCallButton({ packId, disabled }: { packId: string; disabled: boolean }) {
  const [hint, setHint] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="btn"
        disabled={disabled}
        title={disabled ? "Approve at least one cue first" : "Opens the Link desktop app"}
        onClick={() => {
          setHint(false);
          window.location.href = `${DESKTOP_SCHEME}://start?pack=${packId}`;
          window.setTimeout(() => setHint(true), 1500);
        }}
      >
        <PlayIcon className="h-3.5 w-3.5" />
        Start live call
      </button>
      {hint && (
        <p className="absolute top-10 right-0 z-10 w-64 rounded-md bg-ink px-3 py-2 text-xs text-white shadow-lg">
          Nothing opened? Live calls need the desktop app.{" "}
          <Link href="/download" className="font-semibold underline underline-offset-2">
            Download it
          </Link>
          .
        </p>
      )}
    </div>
  );
}