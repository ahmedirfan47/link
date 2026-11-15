import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { requireUser } from "@/lib/supabase/server";
import { MEETING_TYPE_LABELS, type PackRow } from "@/lib/rows";
import { MockClient, type MockQuestion } from "./mock-client";

export const metadata: Metadata = { title: "Mock call" };

const ROLE: Record<string, string> = {
  investor: "Investor",
  interview: "Interviewer",
  sales: "Buyer",
  client: "Client",
  partner: "Partner",
  negotiation: "Negotiator",
  viva: "Examiner",
  presentation: "Audience",
};

/**
 * A spoken mock conversation: a tough counterpart (an investor for a pitch
 * pack, a hiring manager for an interview pack) asks the hardest questions out
 * loud, listens to the answer, scores it and presses with a follow-up.
 */
export default async function MockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const { data: packData } = await supabase.from("packs").select("*").eq("id", id).maybeSingle();
  if (!packData) notFound();
  const pack = packData as PackRow;

  const { data } = await supabase
    .from("cues")
    .select("id, prompt, bullets, priority, useful_count")
    .eq("pack_id", id)
    .eq("approved", true)
    .eq("direction", "incoming")
    .eq("kind", "question")
    .order("priority", { ascending: true });
  const questions = (data ?? []).map((c) => ({
    id: c.id as string,
    prompt: c.prompt as string,
    bullets: (c.bullets as string[]) ?? [],
    priority: c.priority as number,
  })) as MockQuestion[];
  const role = ROLE[pack.meeting_type] ?? "Counterpart";

  return (
    <Page>
      <PageHeader
        back={{ href: `/packs/${pack.id}`, label: pack.title }}
        title={`Mock ${MEETING_TYPE_LABELS[pack.meeting_type].toLowerCase()}`}
        meta={`A tough ${role.toLowerCase()} asks your hardest questions out loud, scores each answer and presses with a follow-up. Answer by voice, as you would on the call.`}
      />
      {questions.length === 0 ? (
        <p className="text-base text-muted">
          There are no approved questions in this pack yet.{" "}
          <Link href={`/packs/${pack.id}`} className="font-semibold text-ink underline underline-offset-2">
            Approve some cards
          </Link>{" "}
          first.
        </p>
      ) : (
        <MockClient packId={pack.id} language={pack.language} role={role} questions={questions} />
      )}
    </Page>
  );
}
