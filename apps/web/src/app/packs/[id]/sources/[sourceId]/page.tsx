import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AskIcon } from "@/components/icons";
import { Page, PageHeader } from "@/components/page";
import { requireUser } from "@/lib/supabase/server";
import { SOURCE_KIND_LABELS, type PackRow, type SourceRow } from "@/lib/rows";

export const metadata: Metadata = { title: "Chat" };

const ASSISTANT: Partial<Record<SourceRow["kind"], string>> = {
  chatgpt_share: "ChatGPT",
  claude_share: "Claude",
};

function assistantName(source: SourceRow): string {
  const named = ASSISTANT[source.kind];
  if (named) return named;
  if (source.title.startsWith("ChatGPT")) return "ChatGPT";
  if (source.title.startsWith("Claude")) return "Claude";
  return "Assistant";
}

/** Shows a shared or imported chat turn by turn, as it was written. */
export default async function ChatSourcePage({ params }: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(sourceId).success) notFound();

  const { supabase } = await requireUser();
  const [{ data: packData }, { data: sourceData }] = await Promise.all([
    supabase.from("packs").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("sources").select("*").eq("id", sourceId).eq("pack_id", id).maybeSingle(),
  ]);
  if (!packData || !sourceData) notFound();
  const pack = packData as Pick<PackRow, "id" | "title">;
  const source = sourceData as SourceRow;
  const messages = source.messages ?? [];
  const name = assistantName(source);

  return (
    <Page>
      <PageHeader
        back={{ href: `/packs/${pack.id}`, label: pack.title }}
        title={source.title || "Chat"}
        meta={
          <p>
            {SOURCE_KIND_LABELS[source.kind]} · {messages.length} messages
            {source.uri && (
              <>
                {" · "}
                <a href={source.uri} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Open original
                </a>
              </>
            )}
          </p>
        }
        actions={
          <Link href={`/packs/${pack.id}/ask?source=${source.id}`} className="btn">
            <AskIcon className="h-3.5 w-3.5" />
            Ask about this chat
          </Link>
        }
      />

      {messages.length === 0 ? (
        <p className="text-base text-muted">This source has no chat messages to show.</p>
      ) : (
        <ol className="space-y-6">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-lg bg-sunken px-4 py-3"
                    : "max-w-full border-l-2 border-line-strong pl-4"
                }
              >
                <p className="mb-1 font-mono text-xs text-muted">{m.role === "user" ? "You" : name}</p>
                <div className="text-base leading-relaxed whitespace-pre-wrap break-words">{m.text}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
}