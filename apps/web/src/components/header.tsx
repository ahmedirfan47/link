import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/packs" className="text-lg font-semibold tracking-tight">
          Link
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn-ghost">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}