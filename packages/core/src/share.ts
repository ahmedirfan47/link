/**
 * Reads a shared ChatGPT or Claude conversation from whatever the share page
 * contains: JSON embedded in the HTML, or the JSON the page loads. The page
 * layouts change often, so this looks for the shape of a conversation (a list
 * of turns with a role and text) rather than for fixed paths.
 *
 * Used by the web server (direct fetch) and by the desktop app (which opens the
 * page in a real browser window when the site blocks servers).
 */

export type ShareKind = "chatgpt_share" | "claude_share";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ChatTranscript {
  title: string;
  messages: ChatMessage[];
}

/** Hard limits so a huge page cannot exhaust memory or CPU. */
const MAX_NODES = 400_000;
const MAX_DEPTH = 60;
const MAX_NESTED_JSON_DEPTH = 4;
export const MAX_SHARE_MESSAGES = 1_000;
export const MAX_SHARE_MESSAGE_CHARS = 40_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Which kind of share link a URL is, or null. */
export function shareKindOf(raw: string): ShareKind | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  if ((host === "chatgpt.com" || host === "chat.openai.com") && /^\/share\/[\w-]{8,}/.test(url.pathname)) {
    return "chatgpt_share";
  }
  if (host === "claude.ai" && /^\/share\/[\w-]{8,}/.test(url.pathname)) return "claude_share";
  return null;
}

function normalizeRole(value: unknown): ChatMessage["role"] | null {
  const role = str(value).toLowerCase();
  if (role === "user" || role === "human") return "user";
  if (role === "assistant" || role === "model" || role === "bot") return "assistant";
  return null;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (isRecord(part) && (part.type === "text" || part.type === undefined)) return str(part.text);
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (isRecord(value)) {
    if (Array.isArray(value.parts)) return textOf(value.parts);
    if (typeof value.text === "string") return value.text;
  }
  return "";
}

/** One conversation turn, if this object looks like one. */
function asMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const frame = isRecord(value.frame) ? value.frame : null;
  const author = isRecord(value.author) ? value.author : null;
  const role = normalizeRole(value.role ?? author?.role ?? value.sender ?? frame?.role);
  if (!role) return null;
  let text = textOf(value.content);
  if (!text) text = str(value.text);
  if (!text && frame) text = str(frame.text);
  if (!text) text = textOf(value.message);
  text = text.trim();
  if (!text) return null;
  return { role, text: text.slice(0, MAX_SHARE_MESSAGE_CHARS) };
}

/** ChatGPT's message tree: follow current_node back to the root. */
function fromMapping(obj: Record<string, unknown>): ChatMessage[] {
  const mapping = obj.mapping;
  if (!isRecord(mapping)) return [];
  const out: ChatMessage[] = [];
  let nodeId = str(obj.current_node);
  const seen = new Set<string>();
  while (nodeId && !seen.has(nodeId) && seen.size < 10_000) {
    seen.add(nodeId);
    const node = mapping[nodeId];
    if (!isRecord(node)) break;
    const msg = asMessage(node.message);
    if (msg) out.push(msg);
    nodeId = str(node.parent);
  }
  return out.reverse();
}

function titleNear(obj: Record<string, unknown> | null): string {
  if (!obj) return "";
  for (const key of ["title", "name", "snapshot_name", "ogTitle"]) {
    const v = str(obj[key]).trim();
    if (v && v.length <= 300) return v;
  }
  return "";
}

interface Candidate {
  messages: ChatMessage[];
  title: string;
  score: number;
}

function score(messages: ChatMessage[]): number {
  const roles = new Set(messages.map((m) => m.role));
  const chars = messages.reduce((n, m) => n + m.text.length, 0);
  // A real conversation has both sides; prefer more turns, then more text.
  return (roles.size === 2 ? 1_000_000_000 : 0) + messages.length * 1_000_000 + Math.min(chars, 999_999);
}

/** Finds the most complete conversation anywhere inside a JSON value. */
export function findChatInJson(root: unknown): ChatTranscript | null {
  let best: Candidate | null = null;
  let nodes = 0;

  const consider = (messages: ChatMessage[], parent: Record<string, unknown> | null) => {
    if (messages.length === 0) return;
    const s = score(messages);
    if (!best || s > best.score) best = { messages, title: titleNear(parent), score: s };
    else if (s === best.score && !best.title) best.title = titleNear(parent);
  };

  const walk = (value: unknown, parent: Record<string, unknown> | null, depth: number, jsonDepth: number) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return;

    if (typeof value === "string") {
      // Some pages embed the conversation as a JSON string inside JSON.
      const t = value.trimStart();
      if (jsonDepth < MAX_NESTED_JSON_DEPTH && value.length > 40 && (t.startsWith("{") || t.startsWith("["))) {
        try {
          walk(JSON.parse(value), parent, depth + 1, jsonDepth + 1);
        } catch {
          /* not JSON */
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      const messages: ChatMessage[] = [];
      for (const item of value) {
        const m = asMessage(item);
        if (m) messages.push(m);
      }
      // At least half of the list must be turns, so random arrays do not count.
      if (messages.length > 0 && messages.length * 2 >= value.length) consider(messages, parent);
      for (const item of value) walk(item, parent, depth + 1, jsonDepth);
      return;
    }

    if (isRecord(value)) {
      if (isRecord(value.mapping) && typeof value.current_node === "string") consider(fromMapping(value), value);
      for (const key of Object.keys(value)) walk(value[key], value, depth + 1, jsonDepth);
    }
  };

  walk(root, null, 0, 0);
  const found = best as Candidate | null;
  if (!found) return null;
  return { title: found.title, messages: found.messages.slice(0, MAX_SHARE_MESSAGES) };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanTitle(raw: string): string {
  return decodeEntities(raw)
    .replace(/^ChatGPT\s*[-–|:]\s*/i, "")
    .replace(/\s*[-–|]\s*(Claude|ChatGPT)$/i, "")
    .trim()
    .slice(0, 300);
}

/** Reads a conversation from the HTML of a share page. */
export function extractChatFromHtml(html: string): ChatTranscript | null {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1];
  const pageTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];

  const blobs: unknown[] = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m = scriptRe.exec(html); m; m = scriptRe.exec(html)) {
    const attrs = m[1] ?? "";
    const body = (m[2] ?? "").trim();
    if (!body) continue;
    const isJson = /type=["']application\/(ld\+)?json["']/i.test(attrs) || /id=["']__NEXT_DATA__["']/i.test(attrs);
    if (isJson || body.startsWith("{") || body.startsWith("[")) {
      try {
        blobs.push(JSON.parse(body));
      } catch {
        /* not JSON */
      }
    }
    // Older React Router pages stream data as enqueue("<json string>").
    const enqueue = /streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g;
    for (let e = enqueue.exec(body); e; e = enqueue.exec(body)) {
      try {
        blobs.push(decodeTurboStream(JSON.parse(e[1]!) as string));
      } catch {
        /* skip */
      }
    }
  }

  const found = findChatInJson(blobs);
  if (!found) return null;
  const title = cleanTitle(og || found.title || pageTitle || "");
  return { title: title || "Shared chat", messages: found.messages };
}

/**
 * Minimal decoder for React Router's "turbo-stream" format, enough to reach
 * plain objects, arrays and strings. Unknown types decode to undefined.
 */
export function decodeTurboStream(payload: string): unknown {
  const firstLine = payload.split("\n").find((l) => l.trim().startsWith("["));
  if (!firstLine) return undefined;
  const flat = JSON.parse(firstLine) as unknown[];
  if (!Array.isArray(flat)) return undefined;
  const cache = new Map<number, unknown>();
  let budget = MAX_NODES;

  const hydrate = (index: number, depth: number): unknown => {
    if (index < 0 || depth > MAX_DEPTH || --budget < 0) return undefined;
    if (cache.has(index)) return cache.get(index);
    const raw = flat[index];
    if (raw === null || typeof raw !== "object") {
      cache.set(index, raw);
      return raw;
    }
    if (Array.isArray(raw)) {
      if (typeof raw[0] === "string" && raw.length <= 3 && /^[A-Z]$/.test(raw[0])) {
        cache.set(index, undefined); // Date, Promise, Map and similar: not needed here.
        return undefined;
      }
      const arr: unknown[] = [];
      cache.set(index, arr);
      for (const i of raw) arr.push(typeof i === "number" ? hydrate(i, depth + 1) : undefined);
      return arr;
    }
    const obj: Record<string, unknown> = {};
    cache.set(index, obj);
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const keyIndex = Number(k.replace(/^_/, ""));
      const key = flat[keyIndex];
      if (typeof key !== "string") continue;
      obj[key] = typeof v === "number" ? hydrate(v, depth + 1) : undefined;
    }
    return obj;
  };

  return hydrate(0, 0);
}

/** A conversation as plain text, for cue generation and for questions. */
export function transcriptToText(messages: ChatMessage[], assistantName: string): string {
  return messages.map((m) => `${m.role === "user" ? "Me" : assistantName}: ${m.text}`).join("\n\n");
}

/** Validates messages sent by a client (the desktop reader). */
export function cleanMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const item of input.slice(0, MAX_SHARE_MESSAGES)) {
    if (!isRecord(item)) continue;
    const role = normalizeRole(item.role);
    const text = str(item.text).trim().slice(0, MAX_SHARE_MESSAGE_CHARS);
    if (role && text) out.push({ role, text });
  }
  return out;
}