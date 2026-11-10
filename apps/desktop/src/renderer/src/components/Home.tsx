import { useEffect, useState } from "react";
import type { OverlayTextSize, PackSummary, Settings, UserInfo } from "../../../shared/types";
import { listMicrophones } from "../live/audio";
import { ErrorNote, Spinner, Wordmark } from "./ui";

const SENSITIVITY = ["Only close matches", "Fewer cards", "Balanced", "More cards", "As many as possible"];

const MEETING_TYPES: Record<string, string> = {
  investor: "Investor",
  sales: "Sales",
  client: "Client",
  partner: "Partner",
  interview: "Interview",
  presentation: "Presentation",
  viva: "Viva",
  negotiation: "Negotiation",
  other: "Other",
};

const TEXT_SIZES: { id: OverlayTextSize; label: string }[] = [
  { id: "s", label: "Small" },
  { id: "m", label: "Medium" },
  { id: "l", label: "Large" },
];

export function Home({
  user,
  settings,
  requestedPackId,
  onSettings,
  onStart,
  onSignOut,
}: {
  user: UserInfo;
  settings: Settings;
  /** The website asked to start this pack; select it and go to the start step. */
  requestedPackId: string | null;
  onSettings: (patch: Partial<Settings>) => void;
  onStart: (pack: PackSummary) => void;
  onSignOut: () => void;
}) {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);

  async function refresh() {
    setError(null);
    setPacks(null);
    const result = await window.link.api.listPacks();
    if (result.ok) {
      setPacks(result.data);
      setSelected((s) => (s && result.data.some((p) => p.id === s) ? s : (result.data[0]?.id ?? null)));
    } else {
      setError(result.error);
      setPacks([]);
    }
  }

  useEffect(() => {
    void refresh();
    void listMicrophones()
      .then(setMics)
      .catch(() => setMics([]));
  }, []);

  // "Start live call" on the website: once packs are loaded, pick that pack and start.
  useEffect(() => {
    if (!requestedPackId || !packs) return;
    const requested = packs.find((p) => p.id === requestedPackId);
    if (requested) {
      setSelected(requested.id);
      onStart(requested);
    } else if (packs.length > 0) {
      setError("That pack was not found in this account. Refresh, or check you are signed in to the same account.");
    }
  }, [requestedPackId, packs, onStart]);

  const pack = packs?.find((p) => p.id === selected) ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <Wordmark />
        <div className="flex min-w-0 items-center gap-1 text-sm text-muted">
          <span className="truncate" title={user.email}>
            {user.email}
          </span>
          <button type="button" className="btn-quiet" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-7 overflow-y-auto px-5 pt-2 pb-6">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-bold">Pack</h2>
            <div className="flex gap-3 text-sm text-muted">
              <button type="button" className="hover:text-text" onClick={() => window.link.control.openWebsite("/packs")}>
                Edit on website
              </button>
              <button type="button" className="hover:text-text" onClick={() => void refresh()}>
                Refresh
              </button>
            </div>
          </div>

          {packs === null ? (
            <p className="flex items-center gap-2 py-3 text-sm text-muted">
              <Spinner /> Loading your packs
            </p>
          ) : packs.length === 0 && !error ? (
            <div className="rounded-md border border-dashed border-line-strong px-4 py-4 text-sm text-text-2">
              You have no packs yet. Create one on the{" "}
              <button
                type="button"
                onClick={() => window.link.control.openWebsite("/packs/new")}
                className="font-semibold text-text underline underline-offset-2"
              >
                Link website
              </button>
              , add your material and approve some cues. Then press Refresh.
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto rounded-md border border-line" role="radiogroup" aria-label="Pack">
              {packs.map((p) => {
                const active = selected === p.id;
                return (
                  <li key={p.id} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelected(p.id)}
                      className={`grid w-full grid-cols-[14px_1fr] items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-raised" : "hover:bg-surface"
                      }`}
                    >
                      <span
                        className={`mt-1 h-3.5 w-3.5 rounded-full border-[1.5px] ${active ? "border-text bg-text shadow-[inset_0_0_0_2.5px_var(--color-raised)]" : "border-faint"}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold">{p.title}</span>
                        <span className="block truncate text-sm text-muted">
                          {MEETING_TYPES[p.meeting_type] ?? p.meeting_type}
                          {p.counterpart ? ` · ${p.counterpart}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <div className="mt-2">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
        </section>

        <section className="space-y-5">
          <h2 className="text-base font-bold">Call setup</h2>

          <div>
            <span className="field-label">Where is the call</span>
            <div className="seg">
              {(
                [
                  { id: "laptop", title: "On this computer", hint: "Zoom, Meet, Teams, WhatsApp, Phone Link" },
                  { id: "room", title: "Phone on speaker", hint: "The mic hears both of you" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-active={settings.mode === m.id}
                  onClick={() => onSettings({ mode: m.id })}
                  className="seg-item"
                >
                  <span className="block font-semibold">{m.title}</span>
                  <span className="block text-xs text-muted">{m.hint}</span>
                </button>
              ))}
            </div>
            {settings.mode === "laptop" && (
              <p className="mt-1.5 text-xs text-muted">Wear headphones so your mic does not pick up the other side.</p>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="mic">
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
            <div className="mb-1 flex items-baseline justify-between">
              <label className="field-label mb-0" htmlFor="sensitivity">
                How often cards appear
              </label>
              <span className="text-sm text-muted">{SENSITIVITY[settings.sensitivity - 1]}</span>
            </div>
            <input
              id="sensitivity"
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.sensitivity}
              onChange={(e) => onSettings({ sensitivity: Number(e.target.value) })}
              className="w-full accent-[#ededea]"
            />
          </div>

          <div>
            <span className="field-label">Answer text size</span>
            <div className="seg">
              {TEXT_SIZES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-active={settings.overlayTextSize === t.id}
                  onClick={() => onSettings({ overlayTextSize: t.id })}
                  className="seg-item text-center"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 text-base">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#ededea]"
              checked={!settings.skipConsentReminder}
              onChange={(e) => onSettings({ skipConsentReminder: !e.target.checked })}
            />
            <span>
              Consent reminder before each call
              <span className="block text-sm text-muted">A prompt to tell the other side you are using Link.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-base">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#ededea]"
              checked={settings.summarize}
              onChange={(e) => onSettings({ summarize: e.target.checked })}
            />
            <span>
              Summary after the call
              <span className="block text-sm text-muted">The transcript is sent once to write it, then thrown away.</span>
            </span>
          </label>
        </section>

        <section className="text-sm text-muted">
          <button type="button" className="hover:text-text" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
            {advanced ? "Hide" : "Show"} server settings
          </button>
          {advanced && (
            <div className="mt-2">
              <label className="field-label" htmlFor="server">
                Link server
              </label>
              <div className="flex gap-2">
                <input id="server" className="field" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
                <button
                  type="button"
                  className="btn-line h-auto"
                  onClick={() => {
                    onSettings({ serverUrl });
                    setTimeout(() => void refresh(), 100);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-line px-5 pt-4 pb-5">
        <button type="button" disabled={!pack} className="btn h-11 w-full" onClick={() => pack && onStart(pack)}>
          {pack ? "Start call" : "Choose a pack to start"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          Tell the people on the call you are using an AI note assistant.
        </p>
      </footer>
    </div>
  );
}