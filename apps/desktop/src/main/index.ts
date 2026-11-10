import { join } from "node:path";
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
import { HOTKEYS } from "../shared/config";
import type { OverlayState, SessionEndInput, Settings } from "../shared/types";
import * as api from "./api";
import * as auth from "./auth";
import { getSettings, setSettings } from "./settings";

let control: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
let lastOverlayState: OverlayState | null = null;

const preload = join(__dirname, "../preload/index.js");

function load(win: BrowserWindow, page: "index" | "overlay"): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`);
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`));
}

function createControlWindow(): void {
  control = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 420,
    minHeight: 600,
    title: "Link",
    backgroundColor: "#0b0b0f",
    autoHideMenuBar: true,
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  load(control, "index");
  // Links open in the default browser, never inside the app.
  control.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
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
  ipcMain.handle("auth:sign-out", () => auth.signOut());

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (_e, patch: Partial<Settings>) => setSettings(patch));

  ipcMain.handle("api:list-packs", () => api.listPacks());
  ipcMain.handle("api:get-pack", (_e, id: string) => api.getPack(id));
  ipcMain.handle("api:stt-token", (_e, language: string) => api.sttToken(language));
  ipcMain.handle("api:fallback", (_e, packId: string, question: string) => api.fallback(packId, question));
  ipcMain.handle("api:start-session", (_e, packId: string, title: string) => api.startSession(packId, title));
  ipcMain.handle("api:end-session", (_e, id: string, body: SessionEndInput) => api.endSession(id, body));

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

// One instance only: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (control) {
      if (control.isMinimized()) control.restore();
      control.focus();
    }
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId("app.link.desktop");
    registerMediaHandlers();
    registerIpc();
    createControlWindow();
    createOverlayWindow();
    registerHotkeys();
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}