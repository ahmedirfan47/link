import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { requireUser } from "@/lib/supabase/server";
import type { PackRow } from "@/lib/rows";
import { RehearseClient, type RehearsalCue } from "./rehearse-client";

export const metadata: Metadata = { title: "Rehearse" };

export default async function RehearsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const { data: packData } = await supabase.from("packs").select("*").eq("id", id).maybeSingle();
  if (!packData) notFound();
  const pack = packData as PackRow;

  const { data } = await supabase
    .from("cues")
    .select("id, prompt, bullets, priority")
    .eq("pack_id", id)
    .eq("approved", true)
    .eq("direction", "incoming")
    .eq("kind", "question");
  const cues = (data ?? []) as RehearsalCue[];

  return (
    <Page>
      <PageHeader
        back={{ href: `/packs/${pack.id}`, label: pack.title }}
        title="Rehearse"
        meta="Answer each question out loud, the way you would on the call. Link checks your answer against your cue."
      />
      {cues.length === 0 ? (
        <p className="text-base text-muted">
          There are no approved questions in this pack yet.{" "}
          <Link href={`/packs/${pack.id}`} className="font-semibold text-ink underline underline-offset-2">
            Approve some cues
          </Link>{" "}
          first.
        </p>
      ) : (
        <RehearseClient packId={pack.id} language={pack.language} cues={cues} />
      )}
    </Page>
  );
}