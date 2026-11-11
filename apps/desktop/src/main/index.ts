import { join, resolve } from "node:path";
import {
  BrowserWindow,
  app,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell,
} from "electron";
import electronUpdater from "electron-updater";
import { DESKTOP_SCHEME, HOTKEYS } from "../shared/config";
import type { AuthEvent, DeepLink, Notice, OverlayState, SessionEndInput, Settings } from "../shared/types";
import * as api from "./api";
import * as auth from "./auth";
import { readShare } from "./share";
import { getSettings, setSettings } from "./settings";

let control: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
let lastOverlayState: OverlayState | null = null;
/** A link that arrived before the control window was ready to receive it. */
let pendingDeepLink: DeepLink | null = null;

const preload = join(__dirname, "../preload/index.js");

function load(win: BrowserWindow, page: "index" | "overlay"): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`);
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`));
}

function focusControl(): void {
  if (!control) return;
  if (control.isMinimized()) control.restore();
  control.show();
  control.focus();
}

/* ------------------------------------------------------------------ */
/*  link-app:// links from the website                                 */
/* ------------------------------------------------------------------ */

function registerProtocol(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    // Development: Windows must launch electron.exe with the app path.
    app.setAsDefaultProtocolClient(DESKTOP_SCHEME, process.execPath, [resolve(process.argv[1]!)]);
  } else {
    app.setAsDefaultProtocolClient(DESKTOP_SCHEME);
  }
}

function findLink(argv: string[]): string | undefined {
  return argv.find((a) => a.startsWith(`${DESKTOP_SCHEME}://`));
}

async function handleLink(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  focusControl();
  const action = url.hostname || url.pathname.replace(/^\/+/, "");

  if (action === "read-share") {
    void importShare(url.searchParams.get("pack") ?? "", url.searchParams.get("url") ?? "");
    return;
  }

  if (action === "auth") {
    const code = url.searchParams.get("code") ?? "";
    const result = await auth.completeBrowserSignIn(getSettings().serverUrl, code);
    const event: AuthEvent = result.ok ? { user: result.data } : { error: result.error };
    control?.webContents.send("control:auth", event);
    return;
  }

  let link: DeepLink | null = null;
  if (action === "start") {
    const packId = url.searchParams.get("pack") ?? "";
    if (/^[0-9a-f-]{36}$/i.test(packId)) link = { type: "start", packId };
  } else if (action === "open") {
    link = { type: "open" };
  }
  if (!link) return;

  // Kept until the window takes it, so a link that arrives while the window is
  // still loading is not lost. The event just tells a ready window to take it.
  pendingDeepLink = link;
  control?.webContents.send("control:deep-link", link);
}

function notify(notice: Notice): void {
  control?.webContents.send("control:notice", notice);
}

let importing = false;

/**
 * link-app://read-share?pack=<id>&url=<share link>: the website could not read a
 * share link, so the app opens it like a browser and saves the chat to the pack.
 */
async function importShare(packId: string, shareUrl: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(packId) || !shareUrl) return;
  if (importing) {
    notify({ kind: "error", text: "Already reading a chat. Wait for it to finish." });
    return;
  }
  importing = true;
  try {
    if (!(await auth.getUser())) {
      notify({ kind: "error", text: "Sign in to the app first, then use the button on the website again." });
      return;
    }
    notify({ kind: "working", text: "Reading the shared chat…" });
    const read = await readShare(shareUrl);
    if (!read.ok) {
      notify({ kind: "error", text: read.error });
      return;
    }
    const saved = await api.addSharedChat(packId, {
      url: shareUrl,
      title: read.data.chat.title,
      messages: read.data.chat.messages,
    });
    if (!saved.ok) {
      notify({ kind: "error", text: saved.error });
      return;
    }
    notify({ kind: "done", text: `Added “${saved.data.title}” (${saved.data.messages} messages) to the pack.` });
    void shell.openExternal(`${getSettings().serverUrl}/packs/${packId}`);
  } finally {
    importing = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Windows                                                            */
/* ------------------------------------------------------------------ */

function createControlWindow(): void {
  control = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 420,
    minHeight: 600,
    title: "Link",
    backgroundColor: "#141413",
    autoHideMenuBar: true,
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  load(control, "index");
  // Links open in the default browser, never inside the app.
  control.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  control.on("closed", () => {
    control = null;
    app.quit();
  });
}

function createOverlayWindow(): void {
  const settings = getSettings();
  const area = screen.getPrimaryDisplay().workArea;
  const width = 400;
  const height = 560;
  const bounds = settings.overlayBounds ?? {
    x: area.x + area.width - width - 24,
    y: area.y + 72,
    width,
    height,
  };

  overlay = new BrowserWindow({
    ...bounds,
    minWidth: 300,
    minHeight: 220,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: "Link overlay",
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true);
  applyClickThrough(settings.overlayClickThrough);
  load(overlay, "overlay");

  overlay.webContents.on("did-finish-load", () => {
    if (lastOverlayState) overlay?.webContents.send("overlay:state", lastOverlayState);
  });

  let saveTimer: NodeJS.Timeout | null = null;
  const saveBounds = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (overlay) setSettings({ overlayBounds: overlay.getBounds() });
    }, 400);
  };
  overlay.on("moved", saveBounds);
  overlay.on("resized", saveBounds);
  overlay.on("closed", () => {
    overlay = null;
  });
}

function applyClickThrough(enabled: boolean): void {
  // forward: true keeps hover working so the overlay can still fade on mouse-over.
  overlay?.setIgnoreMouseEvents(enabled, { forward: true });
}

function setClickThrough(enabled: boolean): void {
  setSettings({ overlayClickThrough: enabled });
  applyClickThrough(enabled);
  if (lastOverlayState) {
    lastOverlayState = { ...lastOverlayState, clickThrough: enabled };
    overlay?.webContents.send("overlay:state", lastOverlayState);
  }
}

function registerHotkeys(): void {
  globalShortcut.register(HOTKEYS.toggleOverlay, () => {
    if (!overlay) return;
    if (overlay.isVisible()) overlay.hide();
    else overlay.showInactive();
  });
  globalShortcut.register(HOTKEYS.clearCards, () => {
    control?.webContents.send("control:hotkey", "clearCards");
  });
  globalShortcut.register(HOTKEYS.toggleClickThrough, () => {
    setClickThrough(!getSettings().overlayClickThrough);
  });
}

function registerMediaHandlers(): void {
  // Microphone access for our own windows only.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "display-capture");
  });

  // System audio ("what the other side says") on Windows: the renderer calls
  // getDisplayMedia and we answer with the screen plus loopback audio.
  // The video track is discarded immediately by the renderer.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => {
        const source = sources[0];
        if (!source) {
          callback({});
          return;
        }
        callback({ video: source, audio: "loopback" });
      })
      .catch(() => callback({}));
  });
}

function registerIpc(): void {
  ipcMain.handle("auth:get-user", () => auth.getUser());
  ipcMain.handle("auth:sign-in", (_e, email: string, password: string) => auth.signIn(email, password));
  ipcMain.handle("auth:sign-in-browser", async () => {
    await shell.openExternal(auth.browserSignInUrl(getSettings().serverUrl));
    return { ok: true, data: null };
  });
  ipcMain.handle("auth:sign-out", () => auth.signOut());

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (_e, patch: Partial<Settings>) => setSettings(patch));

  ipcMain.handle("api:list-packs", () => api.listPacks());
  ipcMain.handle("api:get-pack", (_e, id: string) => api.getPack(id));
  ipcMain.handle("api:stt-token", (_e, language: string) => api.sttToken(language));
  ipcMain.handle("api:fallback", (_e, packId: string, question: string) => api.fallback(packId, question));
  ipcMain.handle("api:start-session", (_e, packId: string, title: string) => api.startSession(packId, title));
  ipcMain.handle("api:end-session", (_e, id: string, body: SessionEndInput) => api.endSession(id, body));

  ipcMain.handle("control:take-deep-link", () => {
    const link = pendingDeepLink;
    pendingDeepLink = null;
    return link;
  });
  ipcMain.on("control:open-website", (_e, path: string) => {
    const safePath = typeof path === "string" && path.startsWith("/") ? path : "/";
    void shell.openExternal(`${getSettings().serverUrl}${safePath}`);
  });

  ipcMain.on("overlay:update", (_e, state: OverlayState) => {
    lastOverlayState = { ...state, clickThrough: getSettings().overlayClickThrough };
    overlay?.webContents.send("overlay:state", lastOverlayState);
  });
  ipcMain.on("overlay:show", () => overlay?.showInactive());
  ipcMain.on("overlay:hide", () => overlay?.hide());
  ipcMain.on("overlay:dismiss", (_e, cardId: string) => {
    control?.webContents.send("control:dismiss", cardId);
  });
  ipcMain.on("overlay:set-click-through", (_e, enabled: boolean) => setClickThrough(enabled));
}

/** Installed builds check GitHub Releases and update on the next restart. */
function checkForUpdates(): void {
  if (!app.isPackaged) return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error("Update check failed", err));
}

// One instance only: a second launch (including a link-app:// link) goes to the running one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerProtocol();

  app.on("second-instance", (_event, argv) => {
    focusControl();
    const link = findLink(argv);
    if (link) void handleLink(link);
  });

  // macOS delivers links this way.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    void handleLink(url);
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId("app.link.desktop");
    registerMediaHandlers();
    registerIpc();
    createControlWindow();
    createOverlayWindow();
    registerHotkeys();
    checkForUpdates();

    // Opened by a link while the app was closed.
    const initial = findLink(process.argv);
    if (initial) {
      control?.webContents.once("did-finish-load", () => void handleLink(initial));
    }
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}