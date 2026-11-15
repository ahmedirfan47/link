import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { Page, PageHeader } from "@/components/page";
import { ago, plural } from "@/lib/format";
import { CalendarFeedError, upcomingMeetings } from "@/lib/calendar-feed";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { UpcomingMeetings, type UpcomingMeeting } from "./upcoming";
import { MEETING_TYPE_LABELS, type PackRow } from "@/lib/rows";

export const metadata: Metadata = { title: "Packs" };

function readiness(approved: number, review: number): { text: string; ready: boolean } {
  if (approved === 0 && review === 0) return { text: "No cues yet", ready: false };
  if (approved === 0) return { text: `${plural(review, "cue")} to review`, ready: false };
  return {
    text: review > 0 ? `${approved} ready · ${review} to review` : `${plural(approved, "cue")} ready`,
    ready: true,
  };
}

interface SharedPack {
  id: string;
  title: string;
  meeting_type: PackRow["meeting_type"];
  counterpart: string;
}

/** Packs teammates shared with this user. Rows come through RLS (own email only); titles through the admin client. */
async function sharedWithMe(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], email: string) {
  if (!email) return [] as SharedPack[];
  const { data: shares } = await supabase.from("pack_shares").select("pack_id").eq("email", email);
  const ids = [...new Set((shares ?? []).map((s) => s.pack_id as string))];
  if (ids.length === 0) return [] as SharedPack[];
  const { data } = await createAdminClient()
    .from("packs")
    .select("id, title, meeting_type, counterpart")
    .in("id", ids)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  return (data ?? []) as SharedPack[];
}

/** The linked calendar's next meetings, or null when no calendar is linked. */
async function meetingsFor(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  email: string,
  packs: PackRow[],
): Promise<{ meetings: UpcomingMeeting[]; error: string | null } | null> {
  const { data: feed } = await supabase.from("calendar_feeds").select("ics_url").maybeSingle();
  if (!feed) return null;
  try {
    const events = await upcomingMeetings(feed.ics_url as string, 10);
    const byUid = new Map(packs.filter((p) => p.calendar_uid).map((p) => [p.calendar_uid!, p.id]));
    return {
      error: null,
      meetings: events.slice(0, 8).map((e) => ({
        uid: e.uid,
        title: e.title,
        start: e.start.toISOString(),
        people: e.attendees
          .filter((a) => a.email.toLowerCase() !== email && !/resource\.calendar/i.test(a.email))
          .map((a) => a.name || a.email)
          .slice(0, 4)
          .join(", "),
        packId: byUid.get(e.uid) ?? null,
      })),
    };
  } catch (err) {
    return {
      meetings: [],
      error: err instanceof CalendarFeedError ? err.message : "Could not read your calendar right now.",
    };
  }
}

export default async function PacksPage() {
  const { supabase } = await requireUser();
  const { data: claims } = await supabase.auth.getClaims();
  const email = String(claims?.claims?.email ?? "").toLowerCase();
  const [packsRes, cuesRes, shared] = await Promise.all([
    supabase.from("packs").select("*").neq("status", "archived").order("updated_at", { ascending: false }),
    supabase.from("cues").select("pack_id, approved"),
    sharedWithMe(supabase, email).catch(() => [] as SharedPack[]),
  ]);
  const packs = (packsRes.data ?? []) as PackRow[];
  const calendar = await meetingsFor(supabase, email, packs);

  const counts = new Map<string, { approved: number; review: number }>();
  for (const c of (cuesRes.data ?? []) as { pack_id: string; approved: boolean }[]) {
    const entry = counts.get(c.pack_id) ?? { approved: 0, review: 0 };
    if (c.approved) entry.approved += 1;
    else entry.review += 1;
    counts.set(c.pack_id, entry);
  }

  return (
    <Page>
      <PageHeader
        title="Packs"
        meta="One pack per conversation: your material, the questions you will likely get, and your answers."
        actions={
          packs.length > 0 && (
            <Link href="/packs/new" className="btn">
              <PlusIcon className="h-3.5 w-3.5" />
              New pack
            </Link>
          )
        }
      />

      {calendar && <UpcomingMeetings meetings={calendar.meetings} error={calendar.error} />}

      {packs.length === 0 ? (
        <div className="max-w-[520px] border-t border-line pt-8">
          <h2 className="text-lg font-bold">Start with your next conversation</h2>
          <p className="mt-2 text-base text-muted">
            Pick a call you have coming up, a pitch, a sales call, an interview. Add your deck or notes, and Link
            writes the questions you are likely to get with short answers you can glance at.
          </p>
          <Link href="/packs/new" className="btn btn-lg mt-6">
            <PlusIcon className="h-4 w-4" />
            Create your first pack
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {packs.map((p) => {
            const c = counts.get(p.id) ?? { approved: 0, review: 0 };
            const r = readiness(c.approved, c.review);
            return (
              <li key={p.id}>
                <Link
                  href={`/packs/${p.id}`}
                  className="-mx-3 grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-0.5 rounded-md px-3 py-3.5 transition-colors hover:bg-canvas sm:grid-cols-[1fr_150px_120px]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.title}</p>
                    <p className="truncate text-sm text-muted">
                      {MEETING_TYPE_LABELS[p.meeting_type]}
                      {p.counterpart ? ` · ${p.counterpart}` : ""}
                    </p>
                  </div>
                  <p className={`hidden text-sm sm:block ${r.ready ? "text-ink-2" : "text-muted"}`}>
                    {p.status === "generating" ? "Writing cues…" : r.text}
                  </p>
                  <p className="text-right text-xs text-muted tabular-nums">{ago(p.updated_at)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {shared.length > 0 && (
        <section className="mt-12" aria-labelledby="shared-heading">
          <h2 id="shared-heading" className="mb-2 text-base font-bold">
            Shared with you
          </h2>
          <ul className="divide-y divide-line border-y border-line">
            {shared.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/shared/${p.id}`}
                  className="-mx-3 block rounded-md px-3 py-3 transition-colors hover:bg-canvas"
                >
                  <p className="truncate font-semibold">{p.title}</p>
                  <p className="truncate text-sm text-muted">
                    {MEETING_TYPE_LABELS[p.meeting_type]}
                    {p.counterpart ? ` · ${p.counterpart}` : ""} · read-only
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
