import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { loadPackForViewer } from "@/lib/pack-access";
import { pocketCards } from "@/lib/pocket";
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

  const cues = await pocketCards(access);

  return (
    <PocketClient
      packId={access.pack.id}
      title={access.pack.title}
      language={access.pack.language}
      canEdit={access.role === "owner"}
      cues={cues as PocketCue[]}
    />
  );
}
