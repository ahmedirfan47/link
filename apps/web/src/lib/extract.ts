import "server-only";
import type { SourceKind } from "@link/core";
import { firecrawlApiKey } from "@/lib/env";

/** Upper bound of text kept per source (about 25k tokens). */
export const MAX_SOURCE_CHARS = 100_000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_FILE_TYPES = ".pdf,.docx,.txt,.md,.markdown,.csv,.json";

export class ExtractionError extends Error {}

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

async function scrapeWithFirecrawl(url: URL, apiKey: string): Promise<{ title: string; text: string }> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.toString(), formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new ExtractionError(`Could not read that page (Firecrawl ${res.status}).`);
  const json = (await res.json()) as {
    data?: { markdown?: string; metadata?: { title?: string } };
  };
  const text = tidy(json.data?.markdown ?? "");
  if (!text) throw new ExtractionError("The page had no readable text. Is the link public?");
  return { title: json.data?.metadata?.title ?? url.hostname, text };
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

/** Fetches a link and returns its readable text. */
export async function extractUrlText(url: URL, kind: SourceKind): Promise<{ title: string; text: string }> {
  const apiKey = firecrawlApiKey();
  if (apiKey) return scrapeWithFirecrawl(url, apiKey);

  if (kind === "chatgpt_share" || kind === "claude_share") {
    throw new ExtractionError(
      "Chat share links load with JavaScript. Add FIRECRAWL_API_KEY to apps/web/.env.local to import them, or paste the chat as a note.",
    );
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkBot/0.1)" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ExtractionError(`Could not open that link (HTTP ${res.status}).`);
  const type = res.headers.get("content-type") ?? "";
  const body = await res.text();
  const result = type.includes("html") ? htmlToText(body) : { title: "", text: tidy(body) };
  if (result.text.length < 50) {
    throw new ExtractionError("Very little text found. The page may need JavaScript; add FIRECRAWL_API_KEY or paste it as a note.");
  }
  return { title: result.title || url.hostname, text: result.text };
}