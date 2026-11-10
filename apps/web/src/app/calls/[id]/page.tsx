import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmButton } from "@/components/form-status";
import { ArrowRightIcon, TrashIcon } from "@/components/icons";
import { Page, PageHeader, Section } from "@/components/page";
import { clockTime, dayLabel, duration, plural, stopwatch } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { parseSummary, type SessionEventRow, type SessionRow } from "@/lib/rows";
import { deleteCall } from "../actions";

export const metadata: Metadata = { title: "Call" };

type CallRow = SessionRow & { packs: { id: string; title: string } | null };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** What each event means to the person who was on the call. */
function describe(e: SessionEventRow): { label: string; text: string; bullets?: string[]; strong?: boolean } | null {
  switch (e.type) {
    case "cue_shown":
      return { label: "Cue shown", text: str(e.payload.prompt) };
    case "hesitation":
      return { label: "Word finder", text: str(e.payload.prompt) };
    case "unmatched_question":
      return { label: "Not prepared", text: str(e.payload.question), strong: true };
    case "fallback_cue":
      return { label: "Drafted live", text: str(e.payload.question), bullets: strs(e.payload.bullets) };
    case "checklist_done":
      return { label: "Covered", text: str(e.payload.prompt) };
    default:
      return null;
  }
}

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const { data } = await supabase.from("sessions").select("*, packs(id, title)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const call = data as CallRow;

  const { data: eventData } = await supabase
    .from("session_events")
    .select("*")
    .eq("session_id", id)
    .order("t_ms", { ascending: true });
  const events = (eventData ?? []) as SessionEventRow[];

  const summary = parseSummary(call.summary);
  const timeline = events.map((e) => ({ e, d: describe(e) })).filter((x) => x.d !== null);
  const unprepared = events.filter((e) => e.type === "unmatched_question").map((e) => str(e.payload.question));
  const shown = events.filter((e) => e.type === "cue_shown").length;
  const lengthMs = call.ended_at ? new Date(call.ended_at).getTime() - new Date(call.started_at).getTime() : null;

  return (
    <Page>
      <PageHeader
        back={{ href: "/calls", label: "Calls" }}
        title={call.title || call.packs?.title || "Untitled call"}
        meta={
          <p>
            {dayLabel(call.started_at)} at {clockTime(call.started_at)}
            {lengthMs !== null ? ` · ${duration(lengthMs)}` : " · did not end cleanly"}
            {call.packs && (
              <>
                {" · "}
                <Link href={`/packs/${call.packs.id}`} className="text-ink-2 underline underline-offset-2 hover:text-ink">
                  {call.packs.title}
                </Link>
              </>
            )}
          </p>
        }
      >
        <p className="mt-4 text-sm text-ink-2">
          {plural(shown, "cue")} shown · {unprepared.length} not prepared ·{" "}
          {events.filter((e) => e.type === "hesitation").length} word finder
        </p>
      </PageHeader>

      <div className="space-y-12">
        {summary ? (
          <Section title="Summary">
            <p className="max-w-[68ch] text-base leading-relaxed whitespace-pre-line text-ink-2">{summary.overview}</p>
            {(summary.followUps.length > 0 || summary.practice.length > 0) && (
              <div className="mt-6 grid gap-8 sm:grid-cols-2">
                {summary.followUps.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted">Follow up</h3>
                    <ul className="space-y-1.5">
                      {summary.followUps.map((f, i) => (
                        <li key={i} className="flex gap-2.5 text-base">
                          <span className="mt-[0.6em] h-1 w-1 shrink-0 bg-ink-2" aria-hidden />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.practice.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted">Rehearse before next time</h3>
                    <ul className="space-y-1.5">
                      {summary.practice.map((p, i) => (
                        <li key={i} className="flex gap-2.5 text-base">
                          <span className="mt-[0.6em] h-1 w-1 shrink-0 bg-ink-2" aria-hidden />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>
        ) : (
          <p className="text-base text-muted">
            No summary for this call. Turn on “Summary after the call” in the desktop app to get one next time.
          </p>
        )}

        {unprepared.length > 0 && (
          <Section
            title="Questions you were not ready for"
            description={
              call.packs
                ? "They were added to the pack as cues that need an answer from you."
                : "The pack for this call was deleted, so they were not saved anywhere."
            }
            actions={
              call.packs && (
                <Link href={`/packs/${call.packs.id}`} className="btn-line">
                  Answer them
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              )
            }
          >
            <ul className="space-y-2">
              {unprepared.map((q, i) => (
                <li key={i} className="text-base font-semibold">
                  <span className="mark">{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="During the call">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted">Nothing was recorded for this call.</p>
          ) : (
            <ol className="divide-y divide-line">
              {timeline.map(({ e, d }) => (
                <li key={e.id} className="grid grid-cols-[56px_110px_minmax(0,1fr)] gap-x-3 py-2.5 text-sm">
                  <span className="font-mono text-xs text-muted">{stopwatch(e.t_ms)}</span>
                  <span className={d!.strong ? "font-semibold text-ink" : "text-muted"}>{d!.label}</span>
                  <div className="min-w-0">
                    <p className={d!.strong ? "font-semibold" : "text-ink-2"}>{d!.text || "(no text)"}</p>
                    {d!.bullets && d!.bullets.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted">{d!.bullets.join(" / ")}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <form action={deleteCall.bind(null, call.id)} className="border-t border-line pt-4">
          <ConfirmButton message="Delete this call from your history?" pendingText="Deleting…" className="btn-danger -ml-2">
            <TrashIcon className="h-3.5 w-3.5" />
            Delete call
          </ConfirmButton>
        </form>
      </div>
    </Page>
  );
}