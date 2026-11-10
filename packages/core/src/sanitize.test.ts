import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, sanitizeGeneratedCue, sanitizeGeneratedPack } from "./index";

test("sanitizeGeneratedCue clamps lengths, counts and priority", () => {
  const cue = sanitizeGeneratedCue({
    direction: "incoming",
    kind: "question",
    prompt: "  What is   your revenue?  ",
    variants: ["What is your revenue?", "how much do you make", "How much do you make?", 42],
    bullets: ["a".repeat(500), "two", "three", "four"],
    keywords: ["MRR", "mrr", "revenue"],
    priority: 9,
  });
  assert.ok(cue);
  assert.equal(cue.prompt, "What is your revenue?");
  assert.deepEqual(cue.variants, ["how much do you make"], "drops prompt copy, duplicates, non-strings");
  assert.equal(cue.bullets.length, LIMITS.bulletsPerCue);
  assert.equal(cue.bullets[0]!.length, LIMITS.bulletMaxChars);
  assert.deepEqual(cue.keywords, ["MRR", "revenue"]);
  assert.equal(cue.priority, 3);
});

test("sanitizeGeneratedCue falls back on bad enums and rejects empty prompts", () => {
  const cue = sanitizeGeneratedCue({ direction: "sideways", kind: "poem", prompt: "Pricing" });
  assert.equal(cue?.direction, "incoming");
  assert.equal(cue?.kind, "question");
  assert.equal(sanitizeGeneratedCue({ prompt: "   " }), null);
  assert.equal(sanitizeGeneratedCue({}), null);
});

test("sanitizeGeneratedPack removes duplicate cues and junk", () => {
  const pack = sanitizeGeneratedPack({
    cues: [
      { direction: "incoming", kind: "question", prompt: "Who are your competitors?" },
      { direction: "incoming", kind: "question", prompt: "who are your competitors" },
      { direction: "outgoing", kind: "question", prompt: "Who are your competitors?" },
      null,
      "nope",
    ],
    gaps: ["What is your current MRR?", "", 5],
  });
  assert.equal(pack.cues.length, 2, "same prompt allowed once per direction");
  assert.deepEqual(pack.gaps, ["What is your current MRR?"]);
});

test("sanitizeGeneratedPack tolerates a completely wrong shape", () => {
  assert.deepEqual(sanitizeGeneratedPack({ cues: "x", gaps: null }), { cues: [], gaps: [] });
});