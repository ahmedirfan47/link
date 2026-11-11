import "server-only";
import {
  extractChatFromHtml,
  findChatInJson,
  transcriptToText,
  type ChatMessage,
  type ShareKind,
  type SourceKind,
} from "@link/core";
import { firecrawlApiKey } from "@/lib/env";

/** Upper bound of text kept per source (about 25k tokens). */
export const MAX_SOURCE_CHARS = 100_000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_FILE_TYPES = ".pdf,.docx,.txt,.md,.markdown,.csv,.json";

export class ExtractionError extends Error {}

/**
 * The share site refused a server request (usually its bot protection). The
 * desktop app can still read it, because it opens the page like a browser.
 */
export class ShareBlockedError extends ExtractionError {}

function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SOURCE_CHARS);
}

function extension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Turns an uploaded file into plain text. */
export async function extractFileText(file: File): Promise<string> {
  if (file.size === 0) throw new ExtractionError("The file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new ExtractionError("Files must be 10 MB or smaller.");

  const ext = extension(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const result = tidy(text);
    if (!result) throw new ExtractionError("No text found in this PDF. Scanned PDFs are not supported yet.");
    return result;
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return tidy(value);
  }

  if (["txt", "md", "markdown", "csv", "json"].includes(ext)) {
    return tidy(new TextDecoder("utf-8").decode(bytes));
  }

  throw new ExtractionError("Supported files: PDF, DOCX, TXT, MD, CSV, JSON.");
}

/** Blocks the server from being pointed at itself or the local network. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (h.includes(":")) {
    // IPv6: loopback, unique-local (fc00::/7) and link-local (fe80::/10).
    return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Decides what kind of link this is. */
export function classifyUrl(raw: string): { url: URL; kind: SourceKind } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ExtractionError("That is not a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ExtractionError("Only http and https links are supported.");
  }
  if (isPrivateHost(url.hostname)) {
    throw new ExtractionError("Links to local or private network addresses are not allowed.");
  }
  const host = url.hostname.replace(/^www\./, "");
  if ((host === "chatgpt.com" || host === "chat.openai.com") && url.pathname.startsWith("/share/")) {
    return { url, kind: "chatgpt_share" };
  }
  if (host === "claude.ai" && url.pathname.startsWith("/share/")) {
    return { url, kind: "claude_share" };
  }
  return { url, kind: "url" };
}

async function firecrawl(url: URL, apiKey: string, format: "markdown" | "rawHtml"): Promise<{ title: string; body: string }> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.toString(), formats: [format], onlyMainContent: format === "markdown" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new ExtractionError(`Could not read that page (Firecrawl ${res.status}).`);
  const json = (await res.json()) as {
    data?: { markdown?: string; rawHtml?: string; metadata?: { title?: string } };
  };
  return {
    title: json.data?.metadata?.title ?? url.hostname,
    body: (format === "markdown" ? json.data?.markdown : json.data?.rawHtml) ?? "",
  };
}

function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return { title, text: tidy(text) };
}

/** Headers of an ordinary browser visit, so share pages answer as they would to a person. */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Fetches a normal web page and returns its readable text. */
export async function extractUrlText(url: URL): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (res?.ok) {
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    const result = type.includes("html") ? htmlToText(body) : { title: "", text: tidy(body) };
    if (result.text.length >= 50) return { title: result.title || url.hostname, text: result.text };
  }

  const apiKey = firecrawlApiKey();
  if (apiKey) {
    const page = await firecrawl(url, apiKey, "markdown");
    const text = tidy(page.body);
    if (text) return { title: page.title, text };
  }
  if (res && !res.ok) throw new ExtractionError(`Could not open that link (HTTP ${res.status}).`);
  throw new ExtractionError("Very little text found. The page may need JavaScript; paste its text as a note instead.");
}

/* ------------------------------------------------------------------ */
/*  Shared ChatGPT and Claude chats, read directly from the share page */
/* ------------------------------------------------------------------ */

export interface SharedChat {
  title: string;
  messages: ChatMessage[];
  text: string;
}

const ASSISTANT_NAME: Record<ShareKind, string> = { chatgpt_share: "ChatGPT", claude_share: "Claude" };

function toSharedChat(kind: ShareKind, title: string, messages: ChatMessage[]): SharedChat {
  const name = ASSISTANT_NAME[kind];
  return {
    title: `${name}: ${title || "Shared chat"}`.slice(0, 300),
    messages,
    text: tidy(transcriptToText(messages, name)),
  };
}

async function fetchText(url: string, accept: string): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Accept: accept },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, body: res.ok ? await res.text() : "" };
  } catch {
    return null;
  }
}

/**
 * Reads a public share link the way a browser does: the page itself, or the
 * JSON the page loads. No OpenAI or Anthropic API or account is involved.
 */
export async function readShareLink(url: URL, kind: ShareKind): Promise<SharedChat> {
  const shareId = url.pathname.split("/").filter(Boolean)[1] ?? "";

  if (kind === "claude_share" && /^[\w-]{8,100}$/.test(shareId)) {
    const snapshot = await fetchText(
      `https://claude.ai/api/chat_snapshots/${shareId}?rendering_mode=messages&render_all_tools=true`,
      "application/json",
    );
    if (snapshot?.body) {
      try {
        const chat = findChatInJson(JSON.parse(snapshot.body));
        if (chat) return toSharedChat(kind, chat.title, chat.messages);
      } catch {
        /* not JSON: blocked or changed */
      }
    }
  }

  const page = await fetchText(url.toString(), "text/html,application/xhtml+xml");
  if (page?.status === 404) throw new ExtractionError("That share link was not found. It may have been deleted or unshared.");
  if (page?.body) {
    const chat = extractChatFromHtml(page.body);
    if (chat) return toSharedChat(kind, chat.title, chat.messages);
  }

  const apiKey = firecrawlApiKey();
  if (apiKey) {
    const raw = await firecrawl(url, apiKey, "rawHtml").catch(() => null);
    const chat = raw ? extractChatFromHtml(raw.body) : null;
    if (chat) return toSharedChat(kind, chat.title, chat.messages);
  }

  throw new ShareBlockedError(
    `${ASSISTANT_NAME[kind]} did not let the server read this link. Open it with the Link desktop app, which reads it like your browser does.`,
  );
}