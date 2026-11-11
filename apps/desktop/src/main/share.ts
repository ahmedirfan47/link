import { BrowserWindow } from "electron";
import {
  extractChatFromHtml,
  findChatInJson,
  shareKindOf,
  type ChatTranscript,
  type ShareKind,
} from "@link/core";
import type { Result } from "../shared/types";

/**
 * Reads a ChatGPT or Claude share link the way a person does: it opens the
 * page in a hidden browser window, lets it load, and reads the conversation
 * from the page and from the data the page fetched. No OpenAI or Anthropic
 * API or account is used. Used when those sites block the Link server.
 */

const LOAD_TIMEOUT_MS = 45_000;
/** Extra time after load for pages that fetch the chat with JavaScript. */
const SETTLE_MS = 2_500;
const MAX_JSON_BODY = 20 * 1024 * 1024;

export interface ReadShareResult {
  kind: ShareKind;
  chat: ChatTranscript;
}

function pickBetter(a: ChatTranscript | null, b: ChatTranscript | null): ChatTranscript | null {
  if (!a) return b;
  if (!b) return a;
  return b.messages.length > a.messages.length ? b : a;
}

export async function readShare(rawUrl: string): Promise<Result<ReadShareResult>> {
  const kind = shareKindOf(rawUrl);
  if (!kind) return { ok: false, error: "Only ChatGPT and Claude share links can be read." };

  // A private, in-memory session: nothing from the user's own browsing is used or kept.
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      partition: `share-reader-${Date.now()}`,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
    },
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  let fromNetwork: ChatTranscript | null = null;
  const jsonRequests = new Set<string>();
  const dbg = win.webContents.debugger;

  try {
    // Watch the JSON the page loads (Claude fetches the chat after the page opens).
    dbg.attach("1.3");
    dbg.on("message", (_event, method, params: Record<string, unknown>) => {
      if (method === "Network.responseReceived") {
        const response = params.response as { mimeType?: string } | undefined;
        if (response?.mimeType?.includes("json")) jsonRequests.add(String(params.requestId));
      } else if (method === "Network.loadingFinished") {
        const requestId = String(params.requestId);
        if (!jsonRequests.has(requestId) || Number(params.encodedDataLength ?? 0) > MAX_JSON_BODY) return;
        dbg
          .sendCommand("Network.getResponseBody", { requestId })
          .then((res: { body?: string; base64Encoded?: boolean }) => {
            if (!res.body) return;
            const text = res.base64Encoded ? Buffer.from(res.body, "base64").toString("utf8") : res.body;
            fromNetwork = pickBetter(fromNetwork, findChatInJson(JSON.parse(text)));
          })
          .catch(() => undefined);
      }
    });
    await dbg.sendCommand("Network.enable");

    const status = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The page took too long to open.")), LOAD_TIMEOUT_MS);
      let code = 200;
      win.webContents.on("did-navigate", (_e, _url, httpResponseCode) => {
        code = httpResponseCode;
      });
      win.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve(code);
      });
      win.webContents.once("did-fail-load", (_e, _code, description) => {
        clearTimeout(timer);
        reject(new Error(`Could not open the link (${description}).`));
      });
      void win.loadURL(rawUrl);
    });
    if (status === 404) return { ok: false, error: "That share link was not found. It may have been unshared." };

    // Wait for the conversation to appear, checking a few times.
    let fromPage: ChatTranscript | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      const html = (await win.webContents.executeJavaScript("document.documentElement.outerHTML", true)) as string;
      fromPage = extractChatFromHtml(html);
      if (fromPage || fromNetwork) break;
    }

    const chat = pickBetter(fromPage, fromNetwork);
    if (!chat || chat.messages.length === 0) {
      return { ok: false, error: "No conversation was found on that page. Check that the link is public." };
    }
    const title = chat.title || win.webContents.getTitle().replace(/\s*[-|]\s*(Claude|ChatGPT)$/i, "") || "Shared chat";
    return { ok: true, data: { kind, chat: { title, messages: chat.messages } } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      if (dbg.isAttached()) dbg.detach();
    } catch {
      /* already detached */
    }
    win.destroy();
  }
}