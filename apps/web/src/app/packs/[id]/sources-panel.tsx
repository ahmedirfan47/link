"use client";

import { useActionState, useState } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import { SOURCE_KIND_LABELS, type ActionState, type SourceSummary } from "@/lib/rows";
import { addFile, addLink, addNote, deleteSource } from "./actions";

type Tab = "file" | "link" | "note";

export function SourcesPanel({ packId, sources }: { packId: string; sources: SourceSummary[] }) {
  const [tab, setTab] = useState<Tab>("file");
  const [fileState, fileAction] = useActionState<ActionState, FormData>(addFile.bind(null, packId), {});
  const [linkState, linkAction] = useActionState<ActionState, FormData>(addLink.bind(null, packId), {});
  const [noteState, noteAction] = useActionState<ActionState, FormData>(addNote.bind(null, packId), {});

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">1. Sources</h2>
        <p className="text-sm text-zinc-500">
          Your deck, one-pager, notes, website, or a shared ChatGPT/Claude chat. Link builds the cues from these.
        </p>
      </div>

      {sources.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.title || s.uri || "Untitled"}</p>
                <p className="text-xs text-zinc-500">
                  {SOURCE_KIND_LABELS[s.kind]} · {s.chars.toLocaleString()} characters
                  {s.status === "failed" && s.error ? ` · ${s.error}` : ""}
                </p>
              </div>
              <form action={deleteSource.bind(null, packId, s.id)}>
                <SubmitButton className="btn-danger" pendingText="…">
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {(["file", "link", "note"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={tab === t ? "btn" : "btn-ghost"}>
            {t === "file" ? "Upload file" : t === "link" ? "Add link" : "Write note"}
          </button>
        ))}
      </div>

      {tab === "file" && (
        <form action={fileAction} className="space-y-3">
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-white"
          />
          <p className="text-xs text-zinc-500">PDF, DOCX, TXT, MD, CSV or JSON, up to 10 MB.</p>
          <StateMessage state={fileState} />
          <SubmitButton pendingText="Reading file…">Add file</SubmitButton>
        </form>
      )}

      {tab === "link" && (
        <form action={linkAction} className="space-y-3">
          <input name="url" type="url" required placeholder="https://… or a chatgpt.com/share/… link" className="input" />
          <StateMessage state={linkState} />
          <SubmitButton pendingText="Importing…">Import link</SubmitButton>
        </form>
      )}

      {tab === "note" && (
        <form action={noteAction} className="space-y-3">
          <input name="title" placeholder="Title (optional)" maxLength={300} className="input" />
          <textarea
            name="text"
            required
            rows={6}
            placeholder="Paste anything: key numbers, your pitch, answers you have given before, a chat transcript…"
            className="input"
          />
          <StateMessage state={noteState} />
          <SubmitButton pendingText="Saving…">Add note</SubmitButton>
        </form>
      )}
    </section>
  );
}