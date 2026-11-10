"use client";

import { useMemo, useState, useTransition } from "react";
import { StateMessage } from "@/components/form-status";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { ActionState } from "@/lib/rows";
import { discardChatExport, importChats, scanChatExport, type ExportListing } from "./actions";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PICK = 10;

type Chat = NonNullable<ExportListing["chats"]>[number];

/**
 * Import chats from a full ChatGPT or Claude data export: upload the zip, pick
 * the conversations that matter for this pack, and they become sources.
 */
export function ChatImport({ packId, userId }: { packId: string; userId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  const [path, setPath] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats).slice(0, 200);
  }, [chats, query]);

  function upload(file: File) {
    if (file.size > MAX_BYTES) return setState({ error: "Exports must be 50 MB or smaller. Unzip it and upload conversations.json instead." });
    setState({});
    start(async () => {
      try {
        setStep("Uploading the export…");
        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const storagePath = `${userId}/${packId}/import-${Date.now()}-${safeName}`;
        const { error } = await createBrowserSupabase()
          .storage.from("sources")
          .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
        if (error) return setState({ error: `Upload failed: ${error.message}` });
        setStep("Reading your chats…");
        const listing = await scanChatExport(packId, storagePath);
        if (listing.error || !listing.chats) {
          await discardChatExport(packId, storagePath);
          return setState({ error: listing.error ?? "No chats found." });
        }
        setPath(storagePath);
        setChats(listing.chats);
      } finally {
        setStep(null);
      }
    });
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PICK) next.add(id);
      return next;
    });
  }

  function reset() {
    if (path) void discardChatExport(packId, path);
    setPath(null);
    setChats([]);
    setPicked(new Set());
    setQuery("");
  }

  function submit() {
    if (!path) return;
    start(async () => {
      const result = await importChats(packId, path, [...picked]);
      setState(result);
      if (!result.error) {
        setPath(null);
        setChats([]);
        setPicked(new Set());
      }
    });
  }

  if (!path) {
    return (
      <div className="space-y-2">
        <label
          className={`flex cursor-pointer flex-col items-start gap-1 rounded-md border border-dashed border-line-strong px-3 py-4 transition-colors hover:border-ink-2 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <span className="text-sm font-semibold">{step ?? "Upload your ChatGPT or Claude export"}</span>
          <span className="text-xs text-muted">
            The .zip from Settings → Data controls → Export (ChatGPT) or Settings → Privacy → Export data (Claude). You
            pick which chats to add next.
          </span>
          <input
            type="file"
            accept=".zip,.json"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
        <StateMessage state={state} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${chats.length} chats`}
        className="field"
      />
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {visible.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-2.5 px-2.5 py-2 hover:bg-canvas">
              <input
                type="checkbox"
                checked={picked.has(c.id)}
                onChange={() => toggle(c.id)}
                disabled={!picked.has(c.id) && picked.size >= MAX_PICK}
                className="mt-1 h-3.5 w-3.5 accent-ink"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.title}</span>
                <span className="block text-xs text-muted">
                  {c.source === "chatgpt" ? "ChatGPT" : "Claude"} · {c.messages} messages ·{" "}
                  {new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </span>
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="px-2.5 py-3 text-sm text-muted">No chats match.</li>}
      </ul>
      <p className="text-xs text-muted">
        {picked.size} of {MAX_PICK} picked. The export file is deleted after import.
      </p>
      <StateMessage state={state} />
      <div className="flex gap-1">
        <button type="button" className="btn-line" disabled={pending || picked.size === 0} onClick={submit}>
          {pending ? "Adding…" : `Add ${picked.size || ""} chat${picked.size === 1 ? "" : "s"}`}
        </button>
        <button type="button" className="btn-quiet" disabled={pending} onClick={reset}>
          Cancel
        </button>
      </div>
    </div>
  );
}