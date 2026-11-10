"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import { CrossIcon, FileIcon, LinkIcon, NoteIcon } from "@/components/icons";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { SOURCE_KIND_LABELS, type ActionState, type SourceSummary } from "@/lib/rows";
import { addLink, addNote, addUploadedFile, deleteSource } from "./actions";

type Tab = "file" | "link" | "note";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.json";
const MAX_BYTES = 10 * 1024 * 1024;

function SourceIcon({ kind }: { kind: SourceSummary["kind"] }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0 text-muted";
  if (kind === "file") return <FileIcon className={cls} />;
  if (kind === "note") return <NoteIcon className={cls} />;
  return <LinkIcon className={cls} />;
}

function size(chars: number): string {
  if (chars < 1000) return `${chars} characters`;
  return `${Math.round(chars / 1000)}k characters`;
}

function FileUpload({ packId, userId }: { packId: string; userId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);

  function upload(file: File) {
    if (file.size === 0) return setState({ error: "That file is empty." });
    if (file.size > MAX_BYTES) return setState({ error: "Files must be 10 MB or smaller." });
    setState({});
    startTransition(async () => {
      try {
        setProgress(`Uploading ${file.name}…`);
        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
        const path = `${userId}/${packId}/${Date.now()}-${safeName}`;
        const supabase = createBrowserSupabase();
        const { error } = await supabase.storage
          .from("sources")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (error) {
          setState({ error: `Upload failed: ${error.message}` });
          return;
        }
        setProgress(`Reading ${file.name}…`);
        setState(await addUploadedFile(packId, path, file.name, file.type));
      } catch (err) {
        setState({ error: err instanceof Error ? err.message : "Upload failed." });
      } finally {
        setProgress(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-2">
      <label
        className={`flex cursor-pointer flex-col items-start gap-1 rounded-md border border-dashed border-line-strong px-3 py-4 transition-colors hover:border-ink-2 ${
          pending ? "pointer-events-none opacity-60" : ""
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
      >
        <span className="text-sm font-semibold">{progress ?? "Choose a file or drop it here"}</span>
        <span className="text-xs text-muted">PDF, Word, text, Markdown, CSV or JSON. Up to 10 MB.</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </label>
      <StateMessage state={state} />
    </div>
  );
}

export function SourcesPanel({
  packId,
  userId,
  sources,
  layout,
}: {
  packId: string;
  userId: string;
  sources: SourceSummary[];
  layout: "main" | "side";
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [linkState, linkAction] = useActionState<ActionState, FormData>(addLink.bind(null, packId), {});
  const [noteState, noteAction] = useActionState<ActionState, FormData>(addNote.bind(null, packId), {});

  return (
    <section>
      {layout === "side" && (
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold">Sources</h2>
          <span className="font-mono text-xs text-muted">{sources.length}</span>
        </div>
      )}

      {sources.length > 0 && (
        <ul className="mb-4 space-y-0.5">
          {sources.map((s) => (
            <li key={s.id} className="group -mx-2 flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-canvas">
              <SourceIcon kind={s.kind} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" title={s.title || s.uri || undefined}>
                  {s.title || s.uri || "Untitled"}
                </p>
                <p className={`truncate text-xs ${s.status === "failed" ? "text-tally" : "text-muted"}`}>
                  {s.status === "failed" && s.error ? s.error : `${SOURCE_KIND_LABELS[s.kind]} · ${size(s.chars)}`}
                </p>
              </div>
              <form action={deleteSource.bind(null, packId, s.id)}>
                <SubmitButton className="btn-quiet h-6 px-1 opacity-0 group-hover:opacity-100 focus:opacity-100" pendingText="…">
                  <CrossIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">Remove {s.title}</span>
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="seg mb-3 w-full">
        {(
          [
            { id: "file", label: "File" },
            { id: "link", label: "Link" },
            { id: "note", label: "Note" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
            className="seg-item flex-1 justify-center"
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "file" && <FileUpload packId={packId} userId={userId} />}

      {tab === "link" && (
        <form action={linkAction} className="space-y-2">
          <input name="url" type="url" required placeholder="https://" className="field" />
          <p className="hint">A web page, or a ChatGPT or Claude share link.</p>
          <StateMessage state={linkState} />
          <SubmitButton className="btn-line" pendingText="Importing…">
            Import
          </SubmitButton>
        </form>
      )}

      {tab === "note" && (
        <form action={noteAction} className="space-y-2">
          <input name="title" placeholder="Title (optional)" maxLength={300} className="field" />
          <textarea
            name="text"
            required
            rows={layout === "main" ? 8 : 5}
            placeholder="Key numbers, your pitch, answers you have given before, a chat transcript…"
            className="field"
          />
          <StateMessage state={noteState} />
          <SubmitButton className="btn-line" pendingText="Saving…">
            Add note
          </SubmitButton>
        </form>
      )}
    </section>
  );
}