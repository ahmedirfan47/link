import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmButton } from "@/components/form-status";
import { RehearseIcon, TrashIcon } from "@/components/icons";
import { Page, PageHeader } from "@/components/page";
import { plural } from "@/lib/format";
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
import { GenerateButton } from "./generate-panel";
import { SourcesPanel } from "./sources-panel";
import { StartCallButton } from "./start-call-button";

// Pack generation runs inside a Server Action on this page and can take a few minutes.
export const maxDuration = 300;

const LANGUAGE_LABELS: Record<string, string> = { en: "English", "ur-en": "Urdu and English", "ar-en": "Arabic and English" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Pack" };
  const { supabase } = await requireUser();
  const { data } = await supabase.from("packs").select("title").eq("id", id).maybeSingle();
  return { title: (data?.title as string | undefined) ?? "Pack" };
}

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase, userId } = await requireUser();
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
  const approved = cues.filter((c) => c.approved).length;
  const rehearsable = cues.filter((c) => c.approved && c.direction === "incoming" && c.kind === "question").length;
  const firstRun = sources.length === 0 && cues.length === 0;

  const meta = [
    MEETING_TYPE_LABELS[pack.meeting_type],
    pack.counterpart,
    LANGUAGE_LABELS[pack.language] ?? pack.language,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Page wide>
      <PageHeader
        back={{ href: "/packs", label: "Packs" }}
        title={pack.title}
        meta={
          <>
            <p>{meta}</p>
            {pack.goal && <p className="mt-1 text-ink-2">Goal: {pack.goal}</p>}
          </>
        }
        actions={
          !firstRun && (
            <>
              {rehearsable > 0 ? (
                <Link href={`/packs/${pack.id}/rehearse`} className="btn-line">
                  <RehearseIcon className="h-3.5 w-3.5" />
                  Rehearse
                </Link>
              ) : (
                <span className="btn-line pointer-events-none text-faint" aria-disabled="true">
                  <RehearseIcon className="h-3.5 w-3.5" />
                  Rehearse
                </span>
              )}
              {cues.length > 0 && (
                <GenerateButton
                  packId={pack.id}
                  hasSources={sources.length > 0}
                  hasCues
                  generating={pack.status === "generating"}
                  quiet
                />
              )}
              {cues.length > 0 && <StartCallButton packId={pack.id} disabled={approved === 0} />}
            </>
          )
        }
      >
        {cues.length > 0 && (
          <p className="mt-4 text-sm text-ink-2">
            {approved} of {plural(cues.length, "cue")} approved for live use
            {gaps.length > 0 ? ` · ${plural(gaps.length, "question")} only you can answer` : ""}
          </p>
        )}
      </PageHeader>

      {pack.status === "generating" && (
        <p className="mb-8 rounded-md bg-marker-soft px-3 py-2 text-sm text-ink">
          Link is reading your sources and writing cues. This takes one to three minutes; the page updates when it is
          done.
        </p>
      )}

      {firstRun ? (
        <div className="max-w-[640px]">
          <h2 className="text-lg font-bold">Add what you already have</h2>
          <p className="mt-1 mb-5 text-base text-muted">
            Your deck, a one-pager, notes from earlier calls, your website, or a shared ChatGPT or Claude chat where
            you worked on this. The more specific, the better the cues.
          </p>
          <SourcesPanel packId={pack.id} userId={userId} sources={sources} layout="main" />
          <form action={deletePack.bind(null, pack.id)} className="mt-12 border-t border-line pt-4">
            <ConfirmButton message="Delete this empty pack?" pendingText="Deleting…" className="btn-danger -ml-2">
              <TrashIcon className="h-3.5 w-3.5" />
              Delete pack
            </ConfirmButton>
          </form>
        </div>
      ) : (
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-10">
            {gaps.length > 0 && <GapsPanel packId={pack.id} gaps={gaps} />}
            {cues.length > 0 ? (
              <CueList packId={pack.id} cues={cues} />
            ) : (
              <div className="border-t border-line pt-6">
                <h2 className="text-lg font-bold">Ready to write your cues</h2>
                <p className="mt-1 text-base text-muted">
                  Link will read {plural(sources.length, "source")} and write the questions you are likely to get,
                  short answers, the numbers to have ready, and the points you want to make.
                </p>
                <div className="mt-5">
                  <GenerateButton
                    packId={pack.id}
                    hasSources={sources.length > 0}
                    hasCues={false}
                    generating={pack.status === "generating"}
                    large
                  />
                </div>
              </div>
            )}
          </div>
          <aside className="space-y-10 lg:border-l lg:border-line lg:pl-8">
            <SourcesPanel packId={pack.id} userId={userId} sources={sources} layout="side" />
            <form action={deletePack.bind(null, pack.id)} className="border-t border-line pt-4">
              <ConfirmButton
                message="Delete this pack, its sources and all its cues? Past calls stay in your history."
                pendingText="Deleting…"
                className="btn-danger -ml-2"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete pack
              </ConfirmButton>
            </form>
          </aside>
        </div>
      )}
    </Page>
  );
}