"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CallIcon, PackIcon, SettingsIcon } from "./icons";

const ITEMS = [
  { href: "/packs", label: "Packs", Icon: PackIcon },
  { href: "/calls", label: "Calls", Icon: CallIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 md:flex-col md:gap-0.5">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors ${
              active ? "bg-sunken font-semibold text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}