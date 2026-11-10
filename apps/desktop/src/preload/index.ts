import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { HotkeyName, LinkBridge, OverlayState, SessionEndInput, Settings } from "../shared/types";

/**
 * The only bridge between the windows and the main process.
 * Windows get these functions and nothing else (no Node, no raw IPC).
 */

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const bridge: LinkBridge = {
  auth: {
    getUser: () => ipcRenderer.invoke("auth:get-user"),
    signIn: (email, password) => ipcRenderer.invoke("auth:sign-in", email, password),
    signOut: () => ipcRenderer.invoke("auth:sign-out"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch: Partial<Settings>) => ipcRenderer.invoke("settings:set", patch),
  },
  api: {
    listPacks: () => ipcRenderer.invoke("api:list-packs"),
    getPack: (id) => ipcRenderer.invoke("api:get-pack", id),
    sttToken: (language) => ipcRenderer.invoke("api:stt-token", language),
    fallback: (packId, question) => ipcRenderer.invoke("api:fallback", packId, question),
    startSession: (packId, title) => ipcRenderer.invoke("api:start-session", packId, title),
    endSession: (id, body: SessionEndInput) => ipcRenderer.invoke("api:end-session", id, body),
  },
  overlay: {
    update: (state: OverlayState) => ipcRenderer.send("overlay:update", state),
    show: () => ipcRenderer.send("overlay:show"),
    hide: () => ipcRenderer.send("overlay:hide"),
    onState: (listener) => subscribe<OverlayState>("overlay:state", listener),
    dismiss: (cardId) => ipcRenderer.send("overlay:dismiss", cardId),
    setClickThrough: (enabled) => ipcRenderer.send("overlay:set-click-through", enabled),
  },
  control: {
    onDismiss: (listener) => subscribe<string>("control:dismiss", listener),
    onHotkey: (listener) => subscribe<HotkeyName>("control:hotkey", listener),
  },
};

contextBridge.exposeInMainWorld("link", bridge);