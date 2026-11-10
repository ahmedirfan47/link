import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { DESKTOP_SCHEME, installerUrl, releasesPage } from "@/lib/releases";

export const metadata: Metadata = { title: "Download" };

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1080px] px-6 pt-10">
        <h1 className="text-3xl font-bold tracking-tight">Link for Windows</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-ink-2">
          The desktop app runs your live calls: it listens, finds the right cue and shows it on top of your call
          window. Your packs, cues and call history stay on the website, under the same account.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href={installerUrl()} className="btn btn-lg">
            Download for Windows
          </a>
          <a href={`${DESKTOP_SCHEME}://open`} className="btn-line h-10 px-4 text-base">
            Already installed? Open Link
          </a>
        </div>
        <p className="mt-3 text-sm text-muted">
          Windows 10 or 11, 64-bit. The app updates itself.{" "}
          <a href={releasesPage()} className="underline underline-offset-2 hover:text-ink">
            All versions
          </a>
        </p>

        <div className="mt-14 grid gap-10 border-t border-line pt-8 md:grid-cols-2">
          <section>
            <h2 className="text-lg font-bold">Installing</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-base text-ink-2">
              <li>Run Link-Setup.exe.</li>
              <li>
                Windows may show “Windows protected your PC” because the app is new. Click <b>More info</b>, then{" "}
                <b>Run anyway</b>.
              </li>
              <li>
                Open Link and choose <b>Sign in with your browser</b>. You will be signed in with your website account.
              </li>
            </ol>
          </section>
          <section>
            <h2 className="text-lg font-bold">Starting a call</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-base text-ink-2">
              <li>
                Open a pack on the{" "}
                <Link href="/packs" className="font-semibold text-ink underline underline-offset-2">
                  website
                </Link>{" "}
                and click <b>Start live call</b>, or pick the pack in the app.
              </li>
              <li>Choose where the call is: on this computer, or on your phone on speaker.</li>
              <li>Wear headphones for calls on this computer, so your mic only hears you.</li>
            </ol>
          </section>
        </div>

        <p className="mt-10 text-sm text-muted">A Mac version is not available yet.</p>
      </main>
      <SiteFooter />
    </div>
  );
}