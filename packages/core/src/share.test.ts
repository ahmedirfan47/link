import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanMessages,
  decodeTurboStream,
  extractChatFromHtml,
  findChatInJson,
  shareKindOf,
  transcriptToText,
} from "./share";

test("shareKindOf recognises ChatGPT and Claude share links only", () => {
  assert.equal(shareKindOf("https://chatgpt.com/share/685ddbcd-6ab8-8011-bfa6-1f10c8790414"), "chatgpt_share");
  assert.equal(shareKindOf("https://chat.openai.com/share/abcdef12-3456"), "chatgpt_share");
  assert.equal(shareKindOf("https://claude.ai/share/3af7bd6a-1111-2222-3333-444455556666"), "claude_share");
  assert.equal(shareKindOf("https://claude.ai/chat/3af7bd6a-1111"), null);
  assert.equal(shareKindOf("http://chatgpt.com/share/685ddbcd-6ab8"), null);
  assert.equal(shareKindOf("not a url"), null);
});

test("reads the current ChatGPT page layout (JSON script with a messages list)", () => {
  const data = {
    conversation: {
      title: "Pricing plan",
      messages: [
        { id: "1", role: "user", content: "What should we charge?" },
        { id: "2", role: "assistant", content: "Start at $49 per seat." },
      ],
    },
  };
  const html = `<html><head><meta property="og:title" content="Pricing plan"><title>ChatGPT - Pricing plan</title></head>
  <body><script id="__WEB_MOBILE_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
  const chat = extractChatFromHtml(html);
  assert.ok(chat);
  assert.equal(chat.title, "Pricing plan");
  assert.deepEqual(chat.messages, [
    { role: "user", text: "What should we charge?" },
    { role: "assistant", text: "Start at $49 per seat." },
  ]);
});

test("reads the older ChatGPT message tree and skips system messages", () => {
  const data = {
    props: {
      pageProps: {
        serverResponse: {
          data: {
            title: "Old share",
            current_node: "c",
            mapping: {
              root: { parent: null, message: { author: { role: "system" }, content: { parts: ["hidden"] } } },
              a: { parent: "root", message: { author: { role: "user" }, content: { parts: ["Hello"] } } },
              b: { parent: "a", message: { author: { role: "assistant" }, content: { parts: ["Hi there"] } } },
              c: { parent: "b", message: { author: { role: "user" }, content: { parts: ["Thanks"] } } },
            },
          },
        },
      },
    },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
  const chat = extractChatFromHtml(html);
  assert.ok(chat);
  assert.equal(chat.title, "Old share");
  assert.deepEqual(
    chat.messages.map((m) => m.text),
    ["Hello", "Hi there", "Thanks"],
  );
});

test("reads a Claude snapshot (sender human/assistant, content blocks)", () => {
  const snapshot = {
    snapshot_name: "Investor prep",
    chat_messages: [
      { sender: "human", text: "", content: [{ type: "text", text: "Help me prepare." }] },
      { sender: "assistant", text: "Sure. Who is the investor?", content: [] },
      { sender: "human", text: "A seed fund." },
    ],
  };
  const chat = findChatInJson(snapshot);
  assert.ok(chat);
  assert.equal(chat.title, "Investor prep");
  assert.equal(chat.messages.length, 3);
  assert.equal(chat.messages[0]!.text, "Help me prepare.");
  assert.equal(chat.messages[1]!.role, "assistant");
});

test("finds a conversation stored as a JSON string inside JSON", () => {
  const inner = JSON.stringify({ messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "A" }] });
  const chat = findChatInJson({ serializedConversationState: inner });
  assert.ok(chat);
  assert.equal(chat.messages.length, 2);
});

test("decodes React Router turbo-stream data", () => {
  // { messages: [ {role:"user", content:"Hi"}, {role:"assistant", content:"Hello"} ] }
  const flat = [{ _1: 2 }, "messages", [3, 7], { _4: 5, _6: 11 }, "role", "user", "content", { _4: 8, _6: 9 }, "assistant", "Hello", "unused", "Hi"];
  const decoded = decodeTurboStream(JSON.stringify(flat));
  const chat = findChatInJson(decoded);
  assert.ok(chat);
  assert.deepEqual(chat.messages, [
    { role: "user", text: "Hi" },
    { role: "assistant", text: "Hello" },
  ]);
});

test("returns null when the page holds no conversation", () => {
  assert.equal(extractChatFromHtml("<html><body>Just a page</body></html>"), null);
  assert.equal(findChatInJson({ items: [{ role: "admin", content: "x" }] }), null);
});

test("cleanMessages keeps only valid turns", () => {
  const out = cleanMessages([
    { role: "user", text: " hi " },
    { role: "system", text: "no" },
    { role: "assistant", text: "" },
    "junk",
    { role: "human", text: "again" },
  ]);
  assert.deepEqual(out, [
    { role: "user", text: "hi" },
    { role: "user", text: "again" },
  ]);
  assert.equal(transcriptToText(out, "Claude"), "Me: hi\n\nMe: again");
});