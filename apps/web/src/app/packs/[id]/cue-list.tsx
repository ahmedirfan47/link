"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import type { ActionState, CueRow } from "@/lib/rows";
import { approveAll, deleteCue, saveCue, setCueApproved } from "./actions";

type Filter = "incoming" | "outgoing" | "number" | "review" | "all";

const PRIORITY: Record<number, string> = { 1: "very likely", 2: "likely", 3: "possible" };

const KIND_OPTIONS: { value: CueRow["kind"]; label: string }[] = [
  { value: "question", label: "Question" },
  { value: "topic", label: "Topic" },
  { value: "number", label: "Number" },
  { value: "checklist", label: "Checklist item" },
];

function matches(c: CueRow, f: Filter): boolean {
  if (f === "incoming") return c.direction === "incoming" && c.kind !== "number";
  if (f === "outgoing") return c.direction === "outgoing" && c.kind !== "number";
  if (f === "number") return c.kind === "number";
  if (f === "review") return !c.approved;
  return true;
}

function CueForm({ packId, cue, onDone }: { packId: string; cue: CueRow | null; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveCue(packId, cue?.id ?? null, prev, formData);
    if (!result.error) onDone();
    return result;
  }, {});

  return (
    <form action={action} className="space-y-4 rounded-lg bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label">Who brings it up</label>
          <select name="direction" defaultValue={cue?.direction ?? "incoming"} className="field">
            <option value="incoming">They do</option>
            <option value="outgoing">You do</option>
          </select>
        </div>
        <div>
          <label className="field-label">Type</label>
          <select name="kind" defaultValue={cue?.kind ?? "question"} className="field">
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">How likely</label>
          <select name="priority" defaultValue={String(cue?.priority ?? 2)} className="field">
            <option value="1">Very likely</option>
            <option value="2">Likely</option>
            <option value="3">Possible</option>
          </select>
        </div>
      </div>
      <div>
        <label className="field-label">The question or topic</label>
        <input name="prompt" required maxLength={300} defaultValue={cue?.prompt ?? ""} className="field" />
      </div>
      <div>
        <label className="field-label">Your cue</label>
        <textarea name="bullets" rows={3} defaultValue={cue?.bullets.join("\n") ?? ""} className="field" />
        <p className="hint">One short line each, three at most. Write what you would glance at, not full sentences.</p>
      </div>
      <div>
        <label className="field-label">Other ways they might say it</label>
        <textarea name="variants" rows={3} defaultValue={cue?.variants.join("\n") ?? ""} className="field" />
        <p className="hint">One per line. These help Link recognise the question when it is phrased differently.</p>
      </div>
      <div>
        <label className="field-label">Trigger words</label>
        <input name="keywords" defaultValue={cue?.keywords.join(", ") ?? ""} className="field" />
        <p className="hint">Comma separated. Hearing one of these brings the cue up straight away.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="approved" defaultChecked={cue?.approved ?? true} className="h-4 w-4 accent-ink" />
        Use on live calls
      </label>
      <StateMessage state={state} />
      <div className="flex gap-1">
        <SubmitButton>{cue ? "Save cue" : "Add cue"}</SubmitButton>
        <button type="button" className="btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ApproveToggle({ packId, cue }: { packId: string; cue: CueRow }) {
  return (
    <form action={setCueApproved.bind(null, packId, cue.id, !cue.approved)}>
      <button
        type="submit"
        aria-label={cue.approved ? "Stop using this cue live" : "Approve this cue for live use"}
        title={cue.approved ? "Approved for live use" : "Approve"}
        className={`mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-sm border transition-colors ${
          cue.approved ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-transparent hover:border-ink hover:text-faint"
        }`}
      >
        <CheckIcon className="h-3 w-3" />
      </button>
    </form>
  );
}

function CueRowView({ packId, cue }: { packId: string; cue: CueRow }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-3">
        <CueForm packId={packId} cue={cue} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const label =
    cue.kind === "number"
      ? "Number"
      : cue.kind === "checklist"
        ? "Before you hang up"
        : cue.direction === "outgoing"
          ? cue.kind === "question"
            ? "You ask"
            : "You raise"
          : null;

  return (
    <li className="group grid grid-cols-[18px_minmax(0,1fr)_auto] gap-x-3 py-4">
      <ApproveToggle packId={packId} cue={cue} />
      <div className="min-w-0">
        <p className="text-sm text-muted">
          {label && <span className="mr-1.5 font-semibold text-ink-2">{label}</span>}
          {cue.prompt}
          {!cue.approved && <span className="mark ml-2 text-2xs font-semibold text-ink">Needs review</span>}
        </p>
        {cue.bullets.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {cue.bullets.map((b, i) => (
              <li key={i} className="flex gap-2.5 text-base leading-snug font-semibold">
                <span className="mt-[0.6em] h-1 w-1 shrink-0 bg-ink-2" aria-hidden />
                <span className={cue.kind === "number" ? "mark" : undefined}>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-faint">No answer yet. Edit to add one.</p>
        )}
        {cue.variants.length > 0 && (
          <p className="mt-2 truncate text-xs text-faint" title={cue.variants.join("\n")}>
            Also: {cue.variants.slice(0, 2).join(" / ")}
            {cue.variants.length > 2 ? ` +${cue.variants.length - 2}` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-2xs text-faint">{PRIORITY[cue.priority] ?? ""}</span>
        <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" className="btn-quiet h-7 px-1.5" onClick={() => setEditing(true)}>
            <PencilIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Edit</span>
          </button>
          <form action={deleteCue.bind(null, packId, cue.id)}>
            <SubmitButton className="btn-quiet h-7 px-1.5 hover:text-tally" pendingText="…">
              <TrashIcon className="h-3.5 w-3.5" />
              <span className="sr-only">Delete</span>
            </SubmitButton>
          </form>
        </div>
      </div>
    </li>
  );
}

export function CueList({ packId, cues }: { packId: string; cues: CueRow[] }) {
  const reviewCount = cues.filter((c) => !c.approved).length;
  const [filter, setFilter] = useState<Filter>(reviewCount > 0 ? "review" : "incoming");
  const [adding, setAdding] = useState(false);

  const tabs: { id: Filter; label: string }[] = [
    { id: "incoming", label: "They ask" },
    { id: "outgoing", label: "You raise" },
    { id: "number", label: "Numbers" },
    { id: "review", label: "Needs review" },
    { id: "all", label: "All" },
  ];
  const visible = useMemo(() => cues.filter((c) => matches(c, filter)), [cues, filter]);

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="seg overflow-x-auto">
          {tabs.map((t) => {
            const n = cues.filter((c) => matches(c, t.id)).length;
            if (t.id === "review" && n === 0) return null;
            return (
              <button
                key={t.id}
                type="button"
                data-active={filter === t.id}
                onClick={() => setFilter(t.id)}
                className="seg-item"
              >
                {t.label}
                <span className="font-mono text-2xs text-faint">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          {reviewCount > 0 && (
            <form action={approveAll.bind(null, packId)}>
              <SubmitButton className="btn-quiet" pendingText="Approving…">
                <CheckIcon className="h-3.5 w-3.5" />
                Approve all {reviewCount}
              </SubmitButton>
            </form>
          )}
          <button type="button" className="btn-line" onClick={() => setAdding((v) => !v)}>
            <PlusIcon className="h-3.5 w-3.5" />
            Add cue
          </button>
        </div>
      </div>

      {adding && (
        <div className="py-3">
          <CueForm packId={packId} cue={null} onDone={() => setAdding(false)} />
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-8 text-sm text-muted">
          {filter === "review" ? "Everything here is approved." : "Nothing here yet."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((c) => (
            <CueRowView key={c.id} packId={packId} cue={c} />
          ))}
        </ul>
      )}
    </section>
  );
}