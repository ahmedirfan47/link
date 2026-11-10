import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { Page, PageHeader } from "@/components/page";
import { ago, plural } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
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

export default async function PacksPage() {
  const { supabase } = await requireUser();
  const [packsRes, cuesRes] = await Promise.all([
    supabase.from("packs").select("*").neq("status", "archived").order("updated_at", { ascending: false }),
    supabase.from("cues").select("pack_id, approved"),
  ]);
  const packs = (packsRes.data ?? []) as PackRow[];

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
    </Page>
  );
}