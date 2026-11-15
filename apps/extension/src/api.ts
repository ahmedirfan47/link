/**
 * Calls to the Link website. The side panel uses your normal Link sign-in:
 * with host permission for Link, Chrome sends the site's cookie with these
 * requests, so there is nothing to sign in to separately.
 */

declare const __LINK_URL__: string;
export const LINK_URL: string = typeof __LINK_URL__ === "string" ? __LINK_URL__ : "https://link-zeta-six.vercel.app";

export class SignedOutError extends Error {
  constructor() {
    super("Sign in to Link in this browser, then reopen the panel.");
  }
}

export interface PackItem {
  id: string;
  title: string;
  meeting_type: string;
  language: string;
  role: "owner" | "viewer";
  from: string | null;
}

export interface Card {
  id: string;
  direction: "incoming" | "outgoing";
  kind: "question" | "topic" | "number" | "checklist";
  prompt: string;
  variants: string[];
  bullets: string[];
  keywords: string[];
  priority: number;
  useful: number;
}

export interface PackDetail {
  pack: { id: string; title: string; language: string; meetingType: string };
  role: "owner" | "viewer";
  cards: Card[];
}

export interface GrokAnswer {
  bullets: string[];
  confident: boolean;
  sources: string[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${LINK_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch {
    throw new Error("Cannot reach Link. Check your connection.");
  }
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 401 || (res.redirected && new URL(res.url).pathname === "/login") || !type.includes("json")) {
    throw new SignedOutError();
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Link returned an error (${res.status}).`);
  return body;
}

export const api = {
  packs: () => call<{ packs: PackItem[] }>("/api/pocket-packs").then((r) => r.packs),
  pack: (id: string) => call<PackDetail>(`/api/pocket-pack?id=${encodeURIComponent(id)}`),
  star: (packId: string, cueId: string) =>
    call<{ count: number }>("/api/pocket-card", { method: "POST", body: JSON.stringify({ action: "star", packId, cueId }) }),
  hide: (packId: string, cueId: string) =>
    call<{ ok: true }>("/api/pocket-card", { method: "POST", body: JSON.stringify({ action: "hide", packId, cueId }) }),
  save: (packId: string, question: string, bullets: string[]) =>
    call<{ id: string }>("/api/pocket-card", {
      method: "POST",
      body: JSON.stringify({ action: "save", packId, question, bullets }),
    }),
  miss: (packId: string, question: string) =>
    call<{ ok: true }>("/api/pocket-miss", {
      method: "POST",
      body: JSON.stringify({ packId, question, source: "extension" }),
    }),
  ask: (packId: string, question: string) =>
    call<GrokAnswer>("/api/pocket-answer", {
      method: "POST",
      body: JSON.stringify({ packId, question, source: "extension" }),
    }),
};
