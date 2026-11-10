import type { Embedder } from "./matching";
import { splitWords } from "./text";

/**
 * A zero-download embedder based on the hashing trick (word unigrams and bigrams).
 * Much weaker than a neural model, but deterministic and instant, so it is used
 * as a fallback when the neural model cannot load, and in tests.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by",
  "is", "are", "was", "were", "be", "been", "am", "it", "its", "this", "that", "these", "those",
  "i", "me", "my", "we", "our", "you", "your", "they", "their", "he", "she", "so", "um", "uh",
  "like", "just", "really", "very", "can", "could", "would", "will", "do", "does", "did",
  "about", "kind", "sort", "okay", "ok", "yeah", "right", "well",
]);

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** FNV-1a 32-bit hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class HashingEmbedder implements Embedder {
  readonly dimensions: number;
  /** Cosine threshold that suits this embedder's score range. */
  readonly defaultThreshold = 0.35;

  constructor(dimensions = 1024) {
    this.dimensions = dimensions;
  }

  embedOne(text: string): Float32Array {
    const v = new Float32Array(this.dimensions);
    const tokens = splitWords(text)
      .filter((w) => !STOPWORDS.has(w))
      .map(stem);
    const add = (feature: string, weight: number) => {
      const h = hash(feature);
      const index = h % this.dimensions;
      v[index] = (v[index] ?? 0) + ((h & 0x80000000) === 0 ? weight : -weight);
    };
    tokens.forEach((t, i) => {
      add(t, 1);
      const next = tokens[i + 1];
      if (next) add(`${t}_${next}`, 0.6);
    });
    return v;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.embedOne(t));
  }
}