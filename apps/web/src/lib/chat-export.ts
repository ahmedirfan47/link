import "server-only";
import { strFromU8, unzipSync } from "fflate";

/**
 * Reads the "Export data" archive from ChatGPT or Claude. Both put every
 * conversation in conversations.json; the shapes differ.
 */

export interface ExportedChat {
  id: string;
  title: string;
  updatedAt: string;
  source: "chatgpt" | "claude";
  messages: { role: "user" | "assistant"; text: string }[];
}

export class ChatExportError extends Error {
  override name = "ChatExportError";
}

function conversationsJson(bytes: Uint8Array, fileName: string): unknown[] {
  const texts: string[] = [];
  if (fileName.toLowerCase().endsWith(".zip") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    // Newer exports can split the list into conversations-000.json, conversations-001.json, ...
    const files = unzipSync(bytes, { filter: (f) => /(^|\/)conversations(-\d+)?\.json$/i.test(f.name) });
    for (const name of Object.keys(files).sort()) texts.push(strFromU8(files[name]!));
    if (texts.length === 0) {
      throw new ChatExportError("No conversations.json in this archive. Is it a ChatGPT or Claude data export?");
    }
  } else {
    texts.push(new TextDecoder("utf-8").decode(bytes));
  }
  const all: unknown[] = [];
  for (const text of texts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ChatExportError("conversations.json could not be read.");
    }
    if (!Array.isArray(parsed)) throw new ChatExportError("conversations.json is not a list of chats.");
    all.push(...parsed);
  }
  return all;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function isoFrom(value: unknown): string {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

/** ChatGPT stores a message tree; follow current_node back to the root to get the visible thread. */
function parseChatGpt(c: Record<string, unknown>): ExportedChat | null {
  const mapping = c.mapping;
  if (!isRecord(mapping)) return null;
  const messages: ExportedChat["messages"] = [];
  let nodeId = str(c.current_node);
  const seen = new Set<string>();
  while (nodeId && !seen.has(nodeId)) {
    seen.add(nodeId);
    const node = mapping[nodeId];
    if (!isRecord(node)) break;
    const message = node.message;
    if (isRecord(message)) {
      const role = isRecord(message.author) ? str(message.author.role) : "";
      const content = message.content;
      const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
      const text = parts.filter((p): p is string => typeof p === "string").join("\n").trim();
      if (text && (role === "user" || role === "assistant")) messages.push({ role, text });
    }
    nodeId = str(node.parent);
  }
  messages.reverse();
  return {
    id: str(c.conversation_id) || str(c.id),
    title: str(c.title) || "Untitled chat",
    updatedAt: isoFrom(c.update_time ?? c.create_time),
    source: "chatgpt",
    messages,
  };
}

function parseClaude(c: Record<string, unknown>): ExportedChat | null {
  if (!Array.isArray(c.chat_messages)) return null;
  const messages: ExportedChat["messages"] = [];
  for (const m of c.chat_messages) {
    if (!isRecord(m)) continue;
    const sender = str(m.sender);
    let text = str(m.text);
    if (!text && Array.isArray(m.content)) {
      text = m.content
        .filter((p): p is Record<string, unknown> => isRecord(p) && p.type === "text")
        .map((p) => str(p.text))
        .join("\n");
    }
    text = text.trim();
    if (!text) continue;
    if (sender === "human") messages.push({ role: "user", text });
    else if (sender === "assistant") messages.push({ role: "assistant", text });
  }
  return {
    id: str(c.uuid),
    title: str(c.name) || "Untitled chat",
    updatedAt: isoFrom(c.updated_at ?? c.created_at),
    source: "claude",
    messages,
  };
}

export function parseChatExport(bytes: Uint8Array, fileName: string): ExportedChat[] {
  const data = conversationsJson(bytes, fileName);
  const chats: ExportedChat[] = [];
  for (const c of data) {
    if (!isRecord(c)) continue;
    const chat = "mapping" in c ? parseChatGpt(c) : parseClaude(c);
    if (chat && chat.id && chat.messages.length > 0) chats.push(chat);
  }
  if (chats.length === 0) throw new ChatExportError("No chats with text were found in this export.");
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** One chat as plain text for cue generation. */
export function chatToText(chat: ExportedChat): string {
  const assistant = chat.source === "chatgpt" ? "ChatGPT" : "Claude";
  return chat.messages.map((m) => `${m.role === "user" ? "Me" : assistant}: ${m.text}`).join("\n\n");
}