import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SERVER_URL } from "../shared/config";
import type { Settings } from "../shared/types";

const DEFAULTS: Settings = {
  serverUrl: DEFAULT_SERVER_URL,
  mode: "laptop",
  sensitivity: 3,
  micDeviceId: null,
  summarize: true,
  overlayClickThrough: false,
  overlayBounds: null,
};

let cache: Settings | null = null;

function file(): string {
  return join(app.getPath("userData"), "settings.json");
}

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), "utf8")) as Partial<Settings>) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings(), ...patch };
  next.serverUrl = next.serverUrl.trim().replace(/\/+$/, "") || DEFAULT_SERVER_URL;
  next.sensitivity = Math.min(5, Math.max(1, Math.round(next.sensitivity)));
  cache = next;
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.error("Could not save settings", err);
  }
  return next;
}