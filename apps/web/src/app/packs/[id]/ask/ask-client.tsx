"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SendIcon, TrashIcon } from "@/components/icons";
import { clearAsk } from "./actions";

export interface AskSource {
  id: string;
  label: string;
  kind: string;
  isChat: boolean;
}

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Summarise what was decided in this material.",
  "What numbers should I have ready?",
  "What hard questions could the other side ask?",
];

/** Renders the small amount of Markdown Grok uses: paragraphs, bullets and **bold**. */
function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
    );
  return (
    <div className="space-y-3 text-base leading-relaxed break-words">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        const heading = /^#{1,4}\s+(.*)$/.exec(block);
        if (heading && lines.length === 1) {
          return (
            <p key={i} className="font-bold">
              {inline(heading[1]!)}
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}

export function AskClient({
  packId,
  sources,
  initialSource,
  initialMessages,
}: {
  packId: string;
  sources: AskSource[];
  initialSource: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [scope, setScope] = useState(initialSource);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, startClear] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setBusy(true);
    setQuestion("");
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`/api/packs/${packId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sourceId: scope || undefined }),
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status}).`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setMessages((m) => {
          const next = m.slice();
          const last = next[next.length - 1]!;
          next[next.length - 1] = { ...last, content: last.content + value };
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // Drop the empty answer bubble; keep the question so it can be retried.
      setMessages((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)));
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  }

  const scoped = sources.find((s) => s.id === scope);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ask-scope" className="text-sm text-muted">
          Ask about
        </label>
        <select
          id="ask-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="field w-auto max-w-full py-1 text-sm"
          disabled={busy}
        >
          <option value="">All sources in this pack ({sources.length})</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label.slice(0, 80)} · {s.kind}
            </option>
          ))}
        </select>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn-quiet ml-auto"
            disabled={busy || clearing}
            onClick={() => {
              if (!window.confirm("Clear this conversation?")) return;
              startClear(async () => {
                await clearAsk(packId);
                setMessages([]);
              });
            }}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {clearing ? "Clearing…" : "Clear"}
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="border-t border-line pt-6">
          <p className="text-base text-muted">
            {scoped
              ? `Ask anything about “${scoped.label.slice(0, 80)}”.`
              : "Ask anything about the chats and documents in this pack."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="btn-line" onClick={() => void ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="space-y-6 border-t border-line pt-6" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-lg bg-sunken px-4 py-2.5 text-base whitespace-pre-wrap">{m.content}</p>
              ) : m.content ? (
                <div className="border-l-2 border-marker pl-4">
                  <Prose text={m.content} />
                </div>
              ) : (
                <p className="border-l-2 border-marker pl-4 text-sm text-muted">Reading your sources…</p>
              )}
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />

      {error && (
        <p role="alert" className="rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally">
          {error}
        </p>
      )}

      <form
        className="sticky bottom-4 flex items-end gap-2 rounded-lg border border-line-strong bg-surface p-2 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <textarea
          id="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Ask a question. Enter to send, Shift+Enter for a new line."
          className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none"
          disabled={busy}
        />
        <button type="submit" className="btn" disabled={busy || !question.trim()}>
          <SendIcon className="h-3.5 w-3.5" />
          {busy ? "Answering…" : "Ask"}
        </button>
      </form>
    </div>
  );
}