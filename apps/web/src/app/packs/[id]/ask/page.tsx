import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { requireUser } from "@/lib/supabase/server";
import { SOURCE_KIND_LABELS, type AskMessageRow, type PackRow, type SourceRow } from "@/lib/rows";
import { AskClient, type AskSource } from "./ask-client";

export const metadata: Metadata = { title: "Ask" };

/** How many earlier questions and answers the page shows. */
const SHOWN_MESSAGES = 60;

export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { id } = await params;
  const { source } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const { data: packData } = await supabase.from("packs").select("*").eq("id", id).maybeSingle();
  if (!packData) notFound();
  const pack = packData as PackRow;

  const [{ data: sourceRows }, { data: messageRows }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, title, kind, uri, messages")
      .eq("pack_id", id)
      .eq("status", "ready")
      .order("created_at", { ascending: true }),
    supabase
      .from("ask_messages")
      .select("*")
      .eq("pack_id", id)
      .order("created_at", { ascending: false })
      .limit(SHOWN_MESSAGES),
  ]);

  const sources: AskSource[] = ((sourceRows ?? []) as Pick<SourceRow, "id" | "title" | "kind" | "uri" | "messages">[]).map(
    (s) => ({
      id: s.id,
      label: s.title || s.uri || "Untitled",
      kind: SOURCE_KIND_LABELS[s.kind],
      isChat: (s.messages?.length ?? 0) > 0,
    }),
  );
  const history = ((messageRows ?? []) as AskMessageRow[]).reverse().map((m) => ({ role: m.role, content: m.content }));
  const initialSource = source && sources.some((s) => s.id === source) ? source : "";

  return (
    <Page>
      <PageHeader
        back={{ href: `/packs/${pack.id}`, label: pack.title }}
        title="Ask"
        meta="Question your shared chats and other sources. Answers come from Grok and cite the source they use."
      />
      {sources.length === 0 ? (
        <p className="text-base text-muted">Add a source to this pack first, such as a shared ChatGPT or Claude chat.</p>
      ) : (
        <AskClient packId={pack.id} sources={sources} initialSource={initialSource} initialMessages={history} />
      )}
    </Page>
  );
}