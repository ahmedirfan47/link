"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LocalTime } from "@/components/local-time";
import { createPackFromEvent } from "./actions";

export interface UpcomingMeeting {
  uid: string;
  title: string;
  start: string;
  people: string;
  packId: string | null;
}

function CreateButton({ uid }: { uid: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        className="btn-line h-7 px-2 text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await createPackFromEvent(uid);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Creating…" : "Create pack"}
      </button>
      {error && <span className="text-2xs text-tally">{error}</span>}
    </span>
  );
}

/** Upcoming meetings from the linked calendar, each one a click away from a pack. */
export function UpcomingMeetings({ meetings, error }: { meetings: UpcomingMeeting[]; error: string | null }) {
  return (
    <section className="mb-10" aria-labelledby="upcoming-heading">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="upcoming-heading" className="text-base font-bold">
          Upcoming meetings
        </h2>
        <Link href="/settings#calendar" className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          Calendar settings
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-tally">{error}</p>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-muted">No meetings in the next ten days.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {meetings.map((m) => (
            <li key={m.uid} className="flex items-center gap-4 py-2.5">
              <span className="w-[120px] shrink-0 text-xs text-muted tabular-nums">
                <LocalTime iso={m.start} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.title || "Untitled meeting"}</span>
                {m.people && <span className="block truncate text-xs text-muted">{m.people}</span>}
              </span>
              {m.packId ? (
                <Link href={`/packs/${m.packId}`} className="btn-quiet h-7 px-2 text-xs">
                  Open pack
                </Link>
              ) : (
                <CreateButton uid={m.uid} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
