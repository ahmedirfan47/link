import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "Privacy" };

const CONTACT = process.env.NEXT_PUBLIC_LINK_CONTACT_EMAIL || "privacy@example.com";

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="10 November 2026">
      <p>
        This explains what Link stores, what it sends to other services, and what you can do about it. Link is run
        from Lahore, Pakistan. For privacy questions or requests, email{" "}
        <a href={`mailto:${CONTACT}`} className="font-semibold text-ink underline underline-offset-2">
          {CONTACT}
        </a>
        .
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your account: email address and a hashed password (handled by Supabase Auth).</li>
        <li>Your packs: titles, goals, the sources you add (files, links, notes, chat imports) and the text taken from them, cues and your answers.</li>
        <li>Your calls: start and end time, the events during the call (which cue was shown, questions you were not ready for, drafted answers), and the summary if you asked for one.</li>
        <li>Daily usage counters, so each account stays within fair limits.</li>
        <li>Personal connector tokens, stored only as a one-way hash.</li>
      </ul>

      <h2>What we do not store</h2>
      <ul>
        <li>Call audio. It is never recorded or uploaded to Link.</li>
        <li>Full call transcripts. The desktop app keeps the transcript in memory during the call. If you ask for a summary, it is sent once to write the summary and then discarded.</li>
      </ul>

      <h2>Services that process your data</h2>
      <ul>
        <li>Supabase: database, file storage and sign-in.</li>
        <li>Vercel: hosts the website and its server functions.</li>
        <li>Anthropic (Claude): writes cues, checks rehearsal answers, drafts live answers and writes call summaries. Anthropic does not train its models on this data under its commercial terms.</li>
        <li>AssemblyAI: turns call audio into text in real time. Audio is streamed directly from your computer.</li>
        <li>Firecrawl: fetches web pages and shared chat links you import, when used.</li>
        <li>PostHog: product analytics and error reports on the website (pages visited, clicks, errors). It does not receive your pack content.</li>
        <li>Resend: sends account emails such as sign-up confirmation and password reset.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Download everything Link holds about you from Settings, as a JSON file.</li>
        <li>Delete any source, cue, pack or call at any time.</li>
        <li>Delete your account from Settings. This permanently removes your packs, files, calls and account.</li>
        <li>Turn off call summaries in the desktop app, so no transcript ever leaves your computer.</li>
      </ul>

      <h2>Recording and consent</h2>
      <p>
        Link transcribes the people you speak with. Laws on this differ by country and state, and some require
        everyone on a call to agree. You are responsible for telling the people on your calls that you are using an
        AI note assistant and getting their consent where it is required.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, we will tell you by email before it takes effect.</p>
    </ProsePage>
  );
}