import { app, safeStorage } from "electron";
import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../shared/config";
import type { Result, UserInfo } from "../shared/types";

/**
 * Supabase sign-in for the desktop app. The session lives only in the main
 * process and is saved to disk encrypted with the OS keychain (safeStorage),
 * so the windows never see the refresh token.
 */

const store = new Map<string, string>();
let loading: Promise<void> | null = null;
let writes: Promise<void> = Promise.resolve();

function file(): string {
  return join(app.getPath("userData"), "auth.bin");
}

/** Plain-text marker so an unencrypted file (no keychain available) is still readable. */
const PLAIN_PREFIX = "plain:";

async function load(): Promise<void> {
  try {
    if (!existsSync(file())) return;
    const raw = await readFile(file());
    let json: string;
    if (raw.subarray(0, PLAIN_PREFIX.length).toString("utf8") === PLAIN_PREFIX) {
      json = raw.subarray(PLAIN_PREFIX.length).toString("utf8");
    } else {
      json = (await safeStorage.decryptStringAsync(raw)).result;
    }
    for (const [k, v] of Object.entries(JSON.parse(json) as Record<string, string>)) store.set(k, v);
  } catch (err) {
    console.error("Could not read saved session; signing out.", err);
    store.clear();
  }
}

/** Writes are chained so two saves never overlap. */
function persist(): Promise<void> {
  writes = writes.then(async () => {
    try {
      if (store.size === 0) {
        if (existsSync(file())) await unlink(file());
        return;
      }
      const json = JSON.stringify(Object.fromEntries(store));
      const data = (await safeStorage.isAsyncEncryptionAvailable())
        ? await safeStorage.encryptStringAsync(json)
        : Buffer.from(PLAIN_PREFIX + json, "utf8");
      await writeFile(file(), data);
    } catch (err) {
      console.error("Could not save session", err);
    }
  });
  return writes;
}

let client: SupabaseClient | null = null;

async function supabase(): Promise<SupabaseClient> {
  loading ??= load();
  await loading;
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: {
        getItem: async (key) => store.get(key) ?? null,
        setItem: async (key, value) => {
          store.set(key, value);
          await persist();
        },
        removeItem: async (key) => {
          store.delete(key);
          await persist();
        },
      },
    },
  });
  return client;
}

export async function getUser(): Promise<UserInfo | null> {
  const { data } = await (await supabase()).auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email ?? "" } : null;
}

export async function signIn(email: string, password: string): Promise<Result<UserInfo>> {
  const { data, error } = await (await supabase()).auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    return { ok: false, error: error?.code === "email_not_confirmed" ? "Confirm your email first." : "Wrong email or password." };
  }
  return { ok: true, data: { id: data.user.id, email: data.user.email ?? "" } };
}

export async function signOut(): Promise<void> {
  await (await supabase()).auth.signOut();
  store.clear();
  await persist();
}

/** A valid access token for API calls (refreshed automatically when needed). */
export async function accessToken(): Promise<string | null> {
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.access_token ?? null;
}