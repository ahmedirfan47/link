import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <p className="text-lg font-bold tracking-tight">Link</p>
        <div className="my-auto w-full max-w-[360px] py-12">
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            Walk into the call with your answers already written.
          </h1>
          <p className="mt-3 text-base text-muted">
            Link turns your deck and notes into short cues, then shows the right one when the question comes up.
          </p>
          <div className="mt-8">
            <LoginForm initialError={typeof error === "string" ? error : undefined} />
          </div>
        </div>
        <p className="text-xs text-faint">Your call audio stays on your computer.</p>
      </div>

      {/* What the overlay actually looks like on a call. */}
      <div className="hidden items-center justify-center bg-[#1b1b1a] p-12 lg:flex">
        <div className="w-full max-w-[420px] space-y-3">
          <div className="flex items-center gap-2 px-1 text-xs text-[#8a8a85]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5bbf7a]" />
            Seed round, Northgate Capital
            <span className="ml-auto font-mono">18:42</span>
          </div>
          <article className="rounded-lg border border-[#2e2e2c] bg-[#121211] p-5 text-[#ededea]">
            <div className="mb-3 flex items-center justify-between text-xs text-[#8a8a85]">
              <span>Answer</span>
              <span className="font-mono">94% match</span>
            </div>
            <p className="mb-3 text-sm text-[#a9a9a4]">What does it cost you to acquire a customer right now?</p>
            <ul className="space-y-2 text-[22px] leading-[1.25] font-semibold">
              <li>
                <span className="text-[#ffe14d]">$38</span> blended, down from $61 in March
              </li>
              <li>Paid is 30% of new users</li>
              <li>Pays back in under 5 months</li>
            </ul>
          </article>
          <div className="rounded-lg border border-[#2e2e2c] bg-[#121211]/70 px-5 py-3 text-sm text-[#8a8a85]">
            How big is the team today?
          </div>
        </div>
      </div>
    </main>
  );
}