import type { Metadata } from "next";
import Link from "next/link";
import { OverlayPreview } from "@/components/overlay-preview";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error, next, mode } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Link href="/" className="self-start text-lg font-bold tracking-tight">
          Link
        </Link>
        <div className="my-auto w-full max-w-[360px] py-12">
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            Walk into the call with your answers already written.
          </h1>
          <p className="mt-3 text-base text-muted">
            Link turns your deck and notes into short cues, then shows the right one when the question comes up.
          </p>
          <div className="mt-8">
            <LoginForm
              initialError={typeof error === "string" ? error : undefined}
              next={safeNext(next)}
              initialMode={mode === "signup" ? "signup" : "signin"}
            />
          </div>
        </div>
        <p className="text-xs text-faint">
          Your call audio stays on your computer.{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-muted">
            Privacy
          </Link>
        </p>
      </div>

      <div className="hidden items-center justify-center bg-[#1b1b1a] p-12 lg:flex">
        <OverlayPreview />
      </div>
    </main>
  );
}