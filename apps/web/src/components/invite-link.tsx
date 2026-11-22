"use client";

import { useState, useTransition } from "react";

/** Shows a freshly created invite link once, with a copy button. */
export function InviteLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-line-strong bg-surface p-1.5">
      <input
        readOnly
        value={url}
        aria-label="Invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 bg-transparent px-1 font-mono text-xs text-ink-2 outline-none"
      />
      <button
        type="button"
        className="btn-line h-7 px-2 text-xs"
        onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** For an invite nobody has accepted yet: makes a new link (the old one stops working) and copies it. */
export function NewInviteLinkButton({ create }: { create: () => Promise<{ url?: string; error?: string }> }) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("Copy invite link");
  return (
    <button
      type="button"
      className="btn-quiet h-6 px-1 text-xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await create();
          if (!result.url) {
            setLabel(result.error ?? "Could not make a link");
            return;
          }
          try {
            await navigator.clipboard.writeText(result.url);
            setLabel("Link copied");
          } catch {
            window.prompt("Copy this invite link:", result.url);
          }
        })
      }
    >
      {pending ? "…" : label}
    </button>
  );
}
