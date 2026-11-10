import type {
  FallbackResult,
  PackDetail,
  PackSummary,
  Result,
  SessionEndInput,
  SessionEndResult,
  SttToken,
} from "../shared/types";
import { accessToken } from "./auth";
import { getSettings } from "./settings";

/** Calls the Link web app's /api/desktop endpoints as the signed-in user. */
async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<Result<T>> {
  try {
    const token = await accessToken();
    if (!token) return { ok: false, error: "You are signed out. Sign in again." };
    const res = await fetch(`${getSettings().serverUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(150_000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `Server error (${res.status}).` };
    return { ok: true, data: json as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: /fetch failed|ECONNREFUSED/i.test(message)
        ? `Cannot reach the Link server at ${getSettings().serverUrl}. Is it running?`
        : message,
    };
  }
}

function map<A, B>(result: Result<A>, fn: (a: A) => B): Result<B> {
  return result.ok ? { ok: true, data: fn(result.data) } : result;
}

export async function listPacks(): Promise<Result<PackSummary[]>> {
  return map(await call<{ packs: PackSummary[] }>("/api/desktop/packs"), (d) => d.packs);
}

export function getPack(id: string): Promise<Result<PackDetail>> {
  return call<PackDetail>(`/api/desktop/packs/${encodeURIComponent(id)}`);
}

export function sttToken(language: string): Promise<Result<SttToken>> {
  return call<SttToken>("/api/desktop/stt-token", { method: "POST", body: { language } });
}

export function fallback(packId: string, question: string): Promise<Result<FallbackResult>> {
  return call<FallbackResult>("/api/desktop/fallback", { method: "POST", body: { packId, question } });
}

export async function startSession(packId: string, title: string): Promise<Result<{ id: string }>> {
  return map(
    await call<{ session: { id: string } }>("/api/desktop/sessions", { method: "POST", body: { packId, title } }),
    (d) => ({ id: d.session.id }),
  );
}

export function endSession(id: string, body: SessionEndInput): Promise<Result<SessionEndResult>> {
  return call<SessionEndResult>(`/api/desktop/sessions/${encodeURIComponent(id)}/end`, { method: "POST", body });
}