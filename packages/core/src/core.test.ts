import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CueMatcher,
  RollingWindow,
  buildIndex,
  cosineSimilarity,
  cueTexts,
  keywordHits,
  normalizeText,
  type Embedder,
} from "./index";

/** Tiny fake embedder: each known phrase maps to a fixed 3-dimensional vector. */
const table: Record<string, number[]> = {
  "what is your revenue": [1, 0, 0],
  "how much money do you make": [0.95, 0.1, 0],
  "who are your competitors": [0, 1, 0],
  "who else does this": [0.1, 0.95, 0],
};
const fakeEmbedder: Embedder = {
  dimensions: 3,
  async embed(texts) {
    return texts.map((t) => Float32Array.from(table[normalizeText(t)] ?? [0, 0, 1]));
  },
};

test("normalizeText strips punctuation and keeps other scripts", () => {
  assert.equal(normalizeText("  What's   your MRR?! "), "what s your mrr");
  assert.equal(normalizeText("آپ کی آمدنی؟"), "آپ کی آمدنی");
});

test("RollingWindow keeps only the last N words, partial included", () => {
  const w = new RollingWindow(5);
  w.commit("one two three");
  w.setPartial("four five six");
  assert.equal(w.text(), "two three four five six");
  w.commit("four five six seven");
  assert.equal(w.text(), "three four five six seven");
});

test("cosineSimilarity of identical vectors is 1", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-6);
});

test("cueTexts removes duplicate phrasings", () => {
  assert.deepEqual(cueTexts({ prompt: "Revenue?", variants: ["revenue", "Your revenue?"] }), [
    "Revenue?",
    "Your revenue?",
  ]);
});

test("CueMatcher matches, rejects weak queries and respects cooldown", async () => {
  const index = await buildIndex(
    [
      { id: "rev", prompt: "What is your revenue", variants: ["How much money do you make"] },
      { id: "comp", prompt: "Who are your competitors", variants: ["Who else does this"] },
    ],
    fakeEmbedder,
  );
  const matcher = new CueMatcher(index, { threshold: 0.8, margin: 0.05, cooldownMs: 1000 });

  const first = matcher.match([0.97, 0.05, 0], 0);
  assert.equal(first?.cueId, "rev");

  assert.equal(matcher.match([0.97, 0.05, 0], 500), null, "cooldown blocks repeat");
  assert.equal(matcher.match([0.97, 0.05, 0], 1500)?.cueId, "rev", "shown again after cooldown");
  assert.equal(matcher.match([0, 0, 1], 2000), null, "unrelated speech shows nothing");

  const loose = new CueMatcher(index, { threshold: 0.5, margin: 0.05, cooldownMs: 1000 });
  assert.equal(loose.match([0.7, 0.7, 0], 0), null, "ambiguous speech shows nothing");
});

test("keywordHits finds whole words and phrases only", () => {
  const cues = [
    { id: "price", keywords: ["SAR 40k", "pricing"] },
    { id: "name", keywords: ["Salesman"] },
  ];
  assert.deepEqual(keywordHits("so what's the pricing like", cues), ["price"]);
  assert.deepEqual(keywordHits("is it sar 40k per year", cues), ["price"]);
  assert.deepEqual(keywordHits("salesmanship matters", cues), []);
});