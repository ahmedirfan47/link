import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import type { CueRow, PackRow } from "@/lib/rows";
import { PocketClient, type PocketCue } from "./pocket-client";

export const metadata: Metadata = { title: "Pocket", robots: { index: false } };

/**
 * The pocket window: a small, always-on-top view of one pack's approved cues,
 * opened from the pack page with "Pocket". Search by typing or by listening.
 */
export default async function PocketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const [{ data: packData }, { data: cueData }] = await Promise.all([
    supabase.from("packs").select("id, title, language").eq("id", id).maybeSingle(),
    supabase
      .from("cues")
      .select("id, direction, kind, prompt, variants, bullets, keywords, priority")
      .eq("pack_id", id)
      .eq("approved", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (!packData) notFound();
  const pack = packData as Pick<PackRow, "id" | "title" | "language">;
  const cues = (cueData ?? []) as Pick<
    CueRow,
    "id" | "direction" | "kind" | "prompt" | "variants" | "bullets" | "keywords" | "priority"
  >[];

  return <PocketClient packId={pack.id} title={pack.title} language={pack.language} cues={cues as PocketCue[]} />;
}
