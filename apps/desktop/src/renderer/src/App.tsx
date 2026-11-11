import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DeepLink, Notice, PackSummary, Settings, UserInfo } from "../../shared/types";
import { ConsentPanel } from "./components/ConsentPanel";
import { Home } from "./components/Home";
import { LivePanel } from "./components/LivePanel";
import { SignIn } from "./components/SignIn";
import { SummaryPanel } from "./components/SummaryPanel";
import { Spinner } from "./components/ui";
import { LiveSession, emptySnapshot, type LiveSnapshot } from "./live/session";

export function App() {
  const [user, setUser] = useState<UserInfo | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [snap, setSnap] = useState<LiveSnapshot>(emptySnapshot());
  const [consentFor, setConsentFor] = useState<PackSummary | null>(null);
  /** Pack the website asked us to start (link-app://start?pack=...). */
  const [requestedPack, setRequestedPack] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);

  const applyLink = useCallback((link: DeepLink | null) => {
    if (link?.type === "start") setRequestedPack(link.packId);
  }, []);

  useEffect(() => {
    void window.link.auth.getUser().then(setUser);
    void window.link.settings.get().then(setSettings);
    void window.link.control.takePendingDeepLink().then(applyLink);

    const offDismiss = window.link.control.onDismiss((id) => sessionRef.current?.dismiss(id));
    const offHotkey = window.link.control.onHotkey((name) => {
      if (name === "clearCards") sessionRef.current?.clearCards();
    });
    // The event only signals that a link is waiting; taking it avoids handling it twice.
    const offLink = window.link.control.onDeepLink(() => {
      void window.link.control.takePendingDeepLink().then(applyLink);
    });
    const offAuth = window.link.control.onAuth((event) => {
      if ("user" in event) {
        setAuthError(null);
        setUser(event.user);
      } else {
        setAuthError(event.error);
      }
    });
    const offNotice = window.link.control.onNotice(setNotice);
    return () => {
      offNotice();
      offDismiss();
      offHotkey();
      offLink();
      offAuth();
    };
  }, [applyLink]);

  async function updateSettings(patch: Partial<Settings>) {
    setSettings(await window.link.settings.set(patch));
  }

  function begin(pack: PackSummary, current: Settings) {
    setConsentFor(null);
    const session = new LiveSession();
    sessionRef.current = session;
    session.onChange(setSnap);
    void session.start(pack.id, current);
  }

  function requestStart(pack: PackSummary) {
    if (!settings) return;
    setRequestedPack(null);
    if (settings.skipConsentReminder) begin(pack, settings);
    else setConsentFor(pack);
  }

  function backHome() {
    sessionRef.current?.reset();
    sessionRef.current = null;
    setSnap(emptySnapshot());
    window.link.overlay.hide();
  }

  const banner = notice && (
    <div
      role="status"
      className={`flex items-start gap-2 border-b px-4 py-2.5 text-sm ${
        notice.kind === "error"
          ? "border-tally/40 bg-tally/10 text-[#ffb3b5]"
          : notice.kind === "done"
            ? "border-go/40 bg-go/10 text-text"
            : "border-line bg-raised text-text"
      }`}
    >
      {notice.kind === "working" && <Spinner className="mt-0.5" />}
      <p className="flex-1">{notice.text}</p>
      {notice.kind !== "working" && (
        <button type="button" className="text-text-2 hover:text-text" onClick={() => setNotice(null)}>
          Close
        </button>
      )}
    </div>
  );

  /** Keeps the screen at full height with the banner above it. */
  function withBanner(content: ReactNode) {
    if (!banner) return content;
    return (
      <div className="flex h-full flex-col">
        {banner}
        <div className="min-h-0 flex-1">{content}</div>
      </div>
    );
  }

  if (user === undefined || !settings) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return withBanner(<SignIn onSignedIn={setUser} serverUrl={settings.serverUrl} authError={authError} />);
  }

  if (snap.phase === "ended") return <SummaryPanel snap={snap} serverUrl={settings.serverUrl} onDone={backHome} />;

  if (snap.phase !== "idle") {
    return (
      <LivePanel
        snap={snap}
        mode={settings.mode}
        onStop={() => void sessionRef.current?.stop()}
        onBack={backHome}
      />
    );
  }

  if (consentFor) {
    return (
      <ConsentPanel
        pack={consentFor}
        onCancel={() => setConsentFor(null)}
        onStart={(skip) => {
          const next = skip ? { ...settings, skipConsentReminder: true } : settings;
          if (skip) void updateSettings({ skipConsentReminder: true });
          begin(consentFor, next);
        }}
      />
    );
  }

  return withBanner(
    <Home
      user={user}
      settings={settings}
      requestedPackId={requestedPack}
      onSettings={(patch) => void updateSettings(patch)}
      onStart={requestStart}
      onSignOut={() => {
        void window.link.auth.signOut().then(() => setUser(null));
      }}
    />,
  );
}