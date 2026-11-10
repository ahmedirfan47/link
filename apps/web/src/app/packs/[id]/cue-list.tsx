"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import type { ActionState, CueRow } from "@/lib/rows";
import { approveAll, deleteCue, saveCue } from "./actions";

type Filter = "all" | "incoming" | "outgoing" | "number" | "pending";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "incoming", label: "They ask" },
  { id: "outgoing", label: "You say / ask" },
  { id: "number", label: "Numbers" },
  { id: "pending", label: "Not approved" },
];

const KIND_LABELS: Record<CueRow["kind"], string> = {
  question: "Question",
  topic: "Topic",
  number: "Number",
  checklist: "Checklist",
};

function CueForm({
  packId,
  cue,
  onDone,
}: {
  packId: string;
  cue: CueRow | null;
  onDone?: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await saveCue(packId, cue?.id ?? null, prev, formData);
      if (!result.error) onDone?.();
      return result;
    },
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Direction</label>
          <select name="direction" defaultValue={cue?.direction ?? "incoming"} className="input">
            <option value="incoming">They ask / say</option>
            <option value="outgoing">You ask / say</option>
          </select>
        </div>
        <div>
          <label className="label">Kind</label>
          <select name="kind" defaultValue={cue?.kind ?? "question"} className="input">
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select name="priority" defaultValue={String(cue?.priority ?? 2)} className="input">
            <option value="1">1 – very likely</option>
            <option value="2">2 – likely</option>
            <option value="3">3 – possible</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Prompt</label>
        <input name="prompt" required maxLength={300} defaultValue={cue?.prompt ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Answer cue (one bullet per line, max 3)</label>
        <textarea name="bullets" rows={3} defaultValue={cue?.bullets.join("\n") ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Other ways it may be said (one per line)</label>
        <textarea name="variants" rows={4} defaultValue={cue?.variants.join("\n") ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Trigger keywords (comma separated)</label>
        <input name="keywords" defaultValue={cue?.keywords.join(", ") ?? ""} className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="approved" defaultChecked={cue?.approved ?? true} />
        Approved for live use
      </label>
      <StateMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton>{cue ? "Save" : "Add cue"}</SubmitButton>
        {onDone && (
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function CueCard({ packId, cue }: { packId: string; cue: CueRow }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-lg border border-zinc-300 p-3">
        <CueForm packId={packId} cue={cue} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={`rounded-lg border p-3 ${cue.approved ? "border-zinc-200" : "border-amber-300 bg-amber-50/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="badge">{cue.direction === "incoming" ? "They" : "You"}</span>
            <span className="badge">{KIND_LABELS[cue.kind]}</span>
            <span className="badge">P{cue.priority}</span>
            {!cue.approved && <span className="badge bg-amber-100 text-amber-800">Not approved</span>}
          </div>
          <p className="font-medium">{cue.prompt}</p>
          {cue.bullets.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-zinc-700">
              {cue.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {cue.variants.length > 0 && (
            <p className="text-xs text-zinc-500">Also: {cue.variants.slice(0, 3).join(" · ")}{cue.variants.length > 3 ? " …" : ""}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
          <form action={deleteCue.bind(null, packId, cue.id)}>
            <SubmitButton className="btn-danger" pendingText="…">
              Delete
            </SubmitButton>
          </form>
        </div>
      </div>
    </li>
  );
}

export function CueList({ packId, cues }: { packId: string; cues: CueRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  const visible = useMemo(
    () =>
      cues.filter((c) => {
        if (filter === "incoming" || filter === "outgoing") return c.direction === filter;
        if (filter === "number") return c.kind === "number";
        if (filter === "pending") return !c.approved;
        return true;
      }),
    [cues, filter],
  );
  const pendingCount = cues.filter((c) => !c.approved).length;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">4. Review cues</h2>
          <p className="text-sm text-zinc-500">
            {cues.length} cues · {pendingCount} not approved. Only approved cues are used live and in rehearsal.
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <form action={approveAll.bind(null, packId)}>
              <SubmitButton className="btn-ghost" pendingText="Approving…">
                Approve all
              </SubmitButton>
            </form>
          )}
          <button type="button" className="btn" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Add cue"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="rounded-lg border border-zinc-300 p-3">
          <CueForm packId={packId} cue={null} onDone={() => setAdding(false)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={filter === f.id ? "btn" : "btn-ghost"}>
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No cues here yet.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((c) => (
            <CueCard key={c.id} packId={packId} cue={c} />
          ))}
        </ul>
      )}
    </section>
  );
}