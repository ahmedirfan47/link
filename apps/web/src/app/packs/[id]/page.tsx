import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmButton } from "@/components/form-status";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/supabase/server";
import {
  MEETING_TYPE_LABELS,
  type CueRow,
  type GapRow,
  type PackRow,
  type SourceRow,
  type SourceSummary,
} from "@/lib/rows";
import { deletePack } from "../actions";
import { CueList } from "./cue-list";
import { GapsPanel } from "./gaps-panel";
import { GeneratePanel } from "./generate-panel";
import { SourcesPanel } from "./sources-panel";

// Pack generation runs inside a Server Action on this page and can take a few minutes.
export const maxDuration = 300;

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const { data: packData } = await supabase.from("packs").select("*").eq("id", id).maybeSingle();
  if (!packData) notFound();
  const pack = packData as PackRow;

  const [sourcesRes, cuesRes, gapsRes] = await Promise.all([
    supabase.from("sources").select("*").eq("pack_id", id).order("created_at", { ascending: true }),
    supabase
      .from("cues")
      .select("*")
      .eq("pack_id", id)
      .order("direction", { ascending: true })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("gap_questions")
      .select("*")
      .eq("pack_id", id)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
  ]);

  const sources: SourceSummary[] = ((sourcesRes.data ?? []) as SourceRow[]).map(
    ({ content_text, ...rest }) => ({ ...rest, chars: content_text?.length ?? 0 }),
  );
  const cues = (cuesRes.data ?? []) as CueRow[];
  const gaps = (gapsRes.data ?? []) as GapRow[];
  const approvedIncoming = cues.filter((c) => c.approved && c.direction === "incoming" && c.kind === "question").length;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/packs" className="text-sm text-zinc-500 hover:text-zinc-900">
              ← All packs
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{pack.title}</h1>
            <p className="text-sm text-zinc-500">
              {MEETING_TYPE_LABELS[pack.meeting_type]}
              {pack.counterpart ? ` · ${pack.counterpart}` : ""}
            </p>
            {pack.goal && <p className="mt-1 text-sm text-zinc-700">Goal: {pack.goal}</p>}
          </div>
          <div className="flex gap-2">
            {approvedIncoming > 0 ? (
              <Link href={`/packs/${pack.id}/rehearse`} className="btn">
                Rehearse ({approvedIncoming})
              </Link>
            ) : (
              <span className="btn pointer-events-none opacity-50">Rehearse</span>
            )}
            <form action={deletePack.bind(null, pack.id)}>
              <ConfirmButton message="Delete this pack, its sources and all its cues?" pendingText="Deleting…">
                Delete pack
              </ConfirmButton>
            </form>
          </div>
        </div>

        {pack.status === "generating" && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Cues are being generated. Refresh in a minute if this page does not update.
          </p>
        )}

        <SourcesPanel packId={pack.id} sources={sources} />
        <GeneratePanel packId={pack.id} hasSources={sources.length > 0} hasCues={cues.length > 0} />
        <GapsPanel packId={pack.id} gaps={gaps} />
        <CueList packId={pack.id} cues={cues} />
      </main>
    </>
  );
}