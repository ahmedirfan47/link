import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { loadPackForViewer } from "@/lib/pack-access";
import type { CueRow } from "@/lib/rows";
import { PocketClient, type PocketCue } from "./pocket-client";

export const metadata: Metadata = { title: "Pocket", robots: { index: false } };

/**
 * The pocket window: a small, always-on-top view of one pack's approved cues,
 * opened from the pack page with "Pocket". Search by typing or by listening.
 * Teammates a pack was shared with get the same window, read-only.
 */
export default async function PocketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const access = await loadPackForViewer(id);
  if (!access) notFound();

  const { data: cueData } = await access.db
    .from("cues")
    .select("id, direction, kind, prompt, variants, bullets, keywords, priority, useful_count")
    .eq("pack_id", id)
    .eq("approved", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  const cues = (cueData ?? []) as Pick<
    CueRow,
    "id" | "direction" | "kind" | "prompt" | "variants" | "bullets" | "keywords" | "priority" | "useful_count"
  >[];

  return (
    <PocketClient
      packId={access.pack.id}
      title={access.pack.title}
      language={access.pack.language}
      canEdit={access.role === "owner"}
      cues={cues.map((c) => ({ ...c, useful: c.useful_count })) as PocketCue[]}
    />
  );
}
