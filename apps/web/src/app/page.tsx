import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OverlayPreview } from "@/components/overlay-preview";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { absolute: "Link · Your answers, on screen, when the question comes up" },
};

const STEPS = [
  {
    title: "Give it what you already have",
    text: "Your deck, a one-pager, notes from the last call, your website, or a ChatGPT or Claude chat where you prepared. Link reads it all.",
  },
  {
    title: "Review the questions it expects",
    text: "Link writes the questions you are likely to get, a two or three line answer for each, the numbers to have ready, and asks you about anything your material does not cover.",
  },
  {
    title: "Rehearse out loud",
    text: "Answer each question by voice. Link checks your answer against your cue and tells you what you left out.",
  },
  {
    title: "Take the call",
    text: "The desktop app listens to the call. When a question you prepared for comes up, its cue appears in a small window on top of everything else. If you stall mid-sentence, it shows the point you were reaching for.",
  },
  {
    title: "Get better after every call",
    text: "Questions you were not ready for are added to the pack for next time, with a short summary of the call and what to follow up on.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await searchParams;
  // Supabase sends confirmation links to the Site URL with ?code= when no redirect is set.
  if (typeof code === "string" && code.length > 0) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />

      <main>
        <section className="mx-auto grid w-full max-w-[1080px] items-center gap-12 px-6 pt-10 pb-20 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <h1 className="max-w-[16ch] text-[44px] leading-[1.05] font-bold tracking-tight text-balance sm:text-[56px]">
              Your answers, on screen, when the question comes up.
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
              For investor pitches, sales calls, interviews and anything else where you need the right words on the
              spot. Prepare once from your own material, and Link shows a short cue the moment you are asked.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/login?mode=signup" className="btn btn-lg">
                Create a free account
              </Link>
              <Link href="/download" className="btn-line h-10 px-4 text-base">
                Download for Windows
              </Link>
            </div>
          </div>
          <div className="rounded-xl bg-[#1b1b1a] p-6 sm:p-8">
            <OverlayPreview />
          </div>
        </section>

        <section className="border-y border-line bg-canvas">
          <div className="mx-auto grid w-full max-w-[1080px] gap-10 px-6 py-16 lg:grid-cols-[280px_minmax(0,1fr)]">
            <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
            <ol className="divide-y divide-line border-y border-line">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[40px_220px_minmax(0,1fr)]">
                  <span className="font-mono text-sm text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-bold">{s.title}</h3>
                  <p className="text-base text-ink-2">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-[1080px] gap-10 px-6 py-16 lg:grid-cols-[280px_minmax(0,1fr)]">
          <h2 className="text-2xl font-bold tracking-tight">What stays private</h2>
          <div className="max-w-[62ch] space-y-4 text-base text-ink-2">
            <p>
              Call audio is never recorded or uploaded to Link. It goes from your computer straight to the
              transcription service and is not stored there.
            </p>
            <p>
              Matching your cues to what is being said happens on your computer. The full transcript only leaves your
              computer if you ask for a summary, and it is thrown away once the summary is written.
            </p>
            <p>
              Link is meant to be used openly. Tell the people you are speaking with that you are using an AI note
              assistant.{" "}
              <Link href="/privacy" className="font-semibold text-ink underline underline-offset-2">
                Read the privacy policy
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}