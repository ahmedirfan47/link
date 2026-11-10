import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** Header for public pages: landing, download, privacy, terms. */
export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  return (
    <header className="mx-auto flex w-full max-w-[1080px] items-center gap-6 px-6 py-5">
      <Link href="/" className="text-lg font-bold tracking-tight">
        Link
      </Link>
      <nav className="ml-auto flex items-center gap-1 text-sm">
        <Link href="/download" className="btn-quiet">
          Download
        </Link>
        {signedIn ? (
          <Link href="/packs" className="btn">
            Open your packs
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn-quiet">
              Sign in
            </Link>
            <Link href="/login?mode=signup" className="btn">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 flex w-full max-w-[1080px] flex-wrap gap-x-6 gap-y-2 border-t border-line px-6 py-6 text-sm text-muted">
      <span>Link</span>
      <Link href="/download" className="hover:text-ink">
        Download
      </Link>
      <Link href="/privacy" className="hover:text-ink">
        Privacy
      </Link>
      <Link href="/terms" className="hover:text-ink">
        Terms
      </Link>
    </footer>
  );
}