import { useEffect, useState } from "react";
import type { PackSummary, Settings, UserInfo } from "../../../shared/types";
import { listMicrophones } from "../live/audio";
import { ErrorNote, Logo, Spinner } from "./ui";

const SENSITIVITY_LABELS = ["Strict", "Careful", "Balanced", "Eager", "Loose"];

export function Home({
  user,
  settings,
  onSettings,
  onStart,
  onSignOut,
}: {
  user: UserInfo;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onStart: (pack: PackSummary) => void;
  onSignOut: () => void;
}) {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  const [showServer, setShowServer] = useState(false);
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);

  async function refresh() {
    setError(null);
    setPacks(null);
    const result = await window.link.api.listPacks();
    if (result.ok) {
      setPacks(result.data);
      setSelected((s) => s ?? result.data[0]?.id ?? null);
    } else {
      setError(result.error);
      setPacks([]);
    }
  }

  useEffect(() => {
    void refresh();
    void listMicrophones().then(setMics).catch(() => setMics([]));
  }, []);

  const pack = packs?.find((p) => p.id === selected) ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
        <Logo />
        <div className="flex items-center gap-2 text-xs text-ink-300">
          <span className="max-w-40 truncate">{user.email}</span>
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-5">
        <section className="panel space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Choose a pack</h2>
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
          {packs === null ? (
            <div className="flex items-center gap-2 text-sm text-ink-300">
              <Spinner /> Loading packs…
            </div>
          ) : packs.length === 0 && !error ? (
            <p className="text-sm text-ink-300">No packs yet. Create one in the Link dashboard, generate cues and approve them.</p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {packs.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      selected === p.id ? "border-accent bg-accent/10" : "border-ink-700 bg-ink-800 hover:border-ink-500"
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-xs text-ink-500">
                      {p.meeting_type}
                      {p.counterpart ? ` · ${p.counterpart}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
        </section>

        <section className="panel space-y-4">
          <div>
            <span className="label">Where is the call?</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "laptop", title: "On this laptop", hint: "Zoom, Meet, Teams, WhatsApp, Phone Link" },
                  { id: "room", title: "Phone on speaker", hint: "One mic hears both sides" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSettings({ mode: m.id })}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    settings.mode === m.id ? "border-accent bg-accent/10" : "border-ink-700 bg-ink-800 hover:border-ink-500"
                  }`}
                >
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-[11px] leading-snug text-ink-500">{m.hint}</p>
                </button>
              ))}
            </div>
            {settings.mode === "laptop" && (
              <p className="mt-2 text-[11px] text-ink-500">Use headphones so your mic does not pick up the other side.</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="mic">
              Microphone
            </label>
            <select
              id="mic"
              className="field"
              value={settings.micDeviceId ?? ""}
              onChange={(e) => onSettings({ micDeviceId: e.target.value || null })}
            >
              <option value="">System default</option>
              {mics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label mb-0">How often cards appear</span>
              <span className="text-xs text-ink-300">{SENSITIVITY_LABELS[settings.sensitivity - 1]}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.sensitivity}
              onChange={(e) => onSettings({ sensitivity: Number(e.target.value) })}
              className="w-full accent-[#7c9cff]"
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-[#7c9cff]"
              checked={settings.summarize}
              onChange={(e) => onSettings({ summarize: e.target.checked })}
            />
            <span>
              Summary after the call
              <span className="block text-xs text-ink-500">The transcript is sent once to write it, then discarded.</span>
            </span>
          </label>
        </section>

        <section className="space-y-2 text-xs text-ink-500">
          <button type="button" className="hover:text-ink-300" onClick={() => setShowServer((v) => !v)}>
            Server: {settings.serverUrl} {showServer ? "▴" : "▾"}
          </button>
          {showServer && (
            <div className="flex gap-2">
              <input className="field" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  onSettings({ serverUrl });
                  setTimeout(() => void refresh(), 100);
                }}
              >
                Save
              </button>
            </div>
          )}
          <p>Ask everyone on the call if they are comfortable with you using an AI note assistant.</p>
        </section>
      </main>

      <footer className="border-t border-ink-800 p-5">
        <button type="button" disabled={!pack} className="btn-primary w-full py-3 text-base" onClick={() => pack && onStart(pack)}>
          {pack ? `Start live · ${pack.title}` : "Choose a pack to start"}
        </button>
      </footer>
    </div>
  );
}