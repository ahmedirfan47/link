import { test } from "node:test";
import assert from "node:assert/strict";
import { searchCues } from "./search";

const cues = [
  {
    id: "revenue",
    prompt: "What is your current monthly revenue?",
    variants: ["how much are you making", "and revenue?", "what are your sales right now"],
    keywords: ["MRR"],
    priority: 1,
  },
  {
    id: "pricing",
    prompt: "How do you price the product?",
    variants: ["what does it cost", "pricing model"],
    keywords: [],
    priority: 2,
  },
  {
    id: "team",
    prompt: "Who is on your team?",
    variants: ["tell me about the founders"],
    keywords: [],
    priority: 2,
  },
  {
    id: "competitor",
    prompt: "How are you different from competitors?",
    variants: ["why not just use another tool"],
    keywords: ["Otter"],
    priority: 3,
  },
];

test("finds the cue from a few spoken words", () => {
  const hits = searchCues("so what's your monthly revenue at the moment", cues);
  assert.equal(hits[0]?.cue.id, "revenue");
});

test("matches word forms (pricing / price)", () => {
  const hits = searchCues("talk me through your pricing", cues);
  assert.equal(hits[0]?.cue.id, "pricing");
});

test("a keyword alone brings up its cue", () => {
  const hits = searchCues("have you looked at Otter", cues);
  assert.equal(hits[0]?.cue.id, "competitor");
});

test("a partly typed last word still matches while typing", () => {
  const hits = searchCues("found", cues, { partial: true });
  assert.equal(hits[0]?.cue.id, "team");
});

test("filler-only and unrelated queries return nothing", () => {
  assert.deepEqual(searchCues("um okay so yeah", cues), []);
  assert.deepEqual(searchCues("the weather in Lahore today", cues), []);
});

test("respects the limit and orders by score", () => {
  const hits = searchCues("revenue pricing team competitors", cues, { limit: 2, minScore: 0.1 });
  assert.equal(hits.length, 2);
  assert.ok(hits[0]!.score >= hits[1]!.score);
});

test("cards marked helpful win near-ties but never match on usefulness alone", () => {
  const twins = [
    { id: "a", prompt: "What is your burn rate?", variants: [], keywords: [], useful: 0 },
    { id: "b", prompt: "What is your burn rate?", variants: [], keywords: [], useful: 5 },
  ];
  assert.equal(searchCues("what's the burn rate", twins)[0]?.cue.id, "b");
  assert.deepEqual(searchCues("tell me about hiring", twins), []);
});
