import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/page";
import { clockTime, dayLabel, duration } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import type { SessionRow } from "@/lib/rows";

export const metadata: Metadata = { title: "Calls" };

type CallListRow = SessionRow & { packs: { title: string } | null };

export default async function CallsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("sessions")
    .select("*, packs(title)")
    .order("started_at", { ascending: false })
    .limit(100);
  const calls = (data ?? []) as CallListRow[];

  const ids = calls.map((c) => c.id);
  const { data: eventData } = ids.length
    ? await supabase.from("session_events").select("session_id, type").in("session_id", ids)
    : { data: [] };
  const stats = new Map<string, { cues: number; unprepared: number }>();
  for (const e of (eventData ?? []) as { session_id: string; type: string }[]) {
    const s = stats.get(e.session_id) ?? { cues: 0, unprepared: 0 };
    if (e.type === "cue_shown") s.cues += 1;
    if (e.type === "unmatched_question") s.unprepared += 1;
    stats.set(e.session_id, s);
  }

  // Group by day, newest first.
  const groups: { day: string; calls: CallListRow[] }[] = [];
  for (const c of calls) {
    const day = dayLabel(c.started_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.calls.push(c);
    else groups.push({ day, calls: [c] });
  }

  return (
    <Page>
      <PageHeader title="Calls" meta="Every live call you ran with the desktop app, with what came up and what to fix." />

      {calls.length === 0 ? (
        <div className="max-w-[520px] border-t border-line pt-8">
          <h2 className="text-lg font-bold">No calls yet</h2>
          <p className="mt-2 text-base text-muted">
            Live calls run in the Link desktop app. Pick a pack there, press Start, and the call shows up here when you
            end it, with a summary and the questions you were not ready for.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="mb-1 text-sm font-semibold text-muted">{g.day}</h2>
              <ul className="divide-y divide-line border-y border-line">
                {g.calls.map((c) => {
                  const s = stats.get(c.id) ?? { cues: 0, unprepared: 0 };
                  const length = c.ended_at
                    ? duration(new Date(c.ended_at).getTime() - new Date(c.started_at).getTime())
                    : "Not ended";
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/calls/${c.id}`}
                        className="-mx-3 grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-x-4 rounded-md px-3 py-3 transition-colors hover:bg-canvas"
                      >
                        <span className="font-mono text-xs text-muted">{clockTime(c.started_at)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{c.title || c.packs?.title || "Untitled call"}</p>
                          <p className="truncate text-sm text-muted">
                            {length}
                            {s.cues > 0 ? ` · ${s.cues} cue${s.cues === 1 ? "" : "s"} shown` : ""}
                            {s.unprepared > 0 ? ` · ${s.unprepared} not prepared` : ""}
                          </p>
                        </div>
                        {c.summary ? (
                          <span className="text-xs text-muted">Summary</span>
                        ) : (
                          <span className="text-xs text-faint">No summary</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}