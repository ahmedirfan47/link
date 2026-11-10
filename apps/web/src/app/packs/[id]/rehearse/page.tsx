import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/supabase/server";
import type { PackRow } from "@/lib/rows";
import { RehearseClient, type RehearsalCue } from "./rehearse-client";

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
    <>
      <Header />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <Link href={`/packs/${pack.id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
            ← {pack.title}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rehearse</h1>
          <p className="text-sm text-zinc-500">
            Answer each question as you would on the call. Link compares your answer with your cue and tells
            you what you missed.
          </p>
        </div>
        {cues.length === 0 ? (
          <p className="card text-sm text-zinc-600">
            No approved questions yet. Approve some cues on the pack page first.
          </p>
        ) : (
          <RehearseClient packId={pack.id} language={pack.language} cues={cues} />
        )}
      </main>
    </>
  );
}