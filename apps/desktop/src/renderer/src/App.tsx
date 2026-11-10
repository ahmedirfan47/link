import { useEffect, useRef, useState } from "react";
import type { PackSummary, Settings, UserInfo } from "../../shared/types";
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
  const sessionRef = useRef<LiveSession | null>(null);

  useEffect(() => {
    void window.link.auth.getUser().then(setUser);
    void window.link.settings.get().then(setSettings);

    const offDismiss = window.link.control.onDismiss((id) => sessionRef.current?.dismiss(id));
    const offHotkey = window.link.control.onHotkey((name) => {
      if (name === "clearCards") sessionRef.current?.clearCards();
    });
    return () => {
      offDismiss();
      offHotkey();
    };
  }, []);

  async function updateSettings(patch: Partial<Settings>) {
    setSettings(await window.link.settings.set(patch));
  }

  function start(pack: PackSummary) {
    if (!settings) return;
    const session = new LiveSession();
    sessionRef.current = session;
    session.onChange(setSnap);
    void session.start(pack.id, settings);
  }

  function backHome() {
    sessionRef.current?.reset();
    sessionRef.current = null;
    setSnap(emptySnapshot());
    window.link.overlay.hide();
  }

  if (user === undefined || !settings) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!user) return <SignIn onSignedIn={setUser} serverUrl={settings.serverUrl} />;

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

  return (
    <Home
      user={user}
      settings={settings}
      onSettings={(patch) => void updateSettings(patch)}
      onStart={start}
      onSignOut={() => {
        void window.link.auth.signOut().then(() => setUser(null));
      }}
    />
  );
}