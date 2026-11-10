/**
 * Text utilities used by the live engine.
 * Unicode-aware so Urdu, Arabic and English text all normalise the same way.
 */

/** Lowercase, strip punctuation, collapse whitespace. Keeps letters and digits in any script. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitWords(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

export function countWords(input: string): number {
  return splitWords(input).length;
}

/**
 * Keeps the last N words of what one speaker said.
 * Streaming speech-to-text sends "partial" text that keeps changing,
 * then a "final" segment that never changes. The window holds both.
 */
export class RollingWindow {
  private committed: string[] = [];
  private partial: string[] = [];

  constructor(private readonly maxWords = 30) {
    if (maxWords < 1) throw new Error("maxWords must be at least 1");
  }

  /** Replace the current in-progress (partial) text. */
  setPartial(text: string): void {
    this.partial = splitWords(text);
  }

  /** Commit a final segment and clear the partial. */
  commit(text: string): void {
    this.committed.push(...splitWords(text));
    this.partial = [];
    if (this.committed.length > this.maxWords) {
      this.committed = this.committed.slice(-this.maxWords);
    }
  }

  /** The last `maxWords` words, committed text first, then the partial. */
  text(): string {
    return [...this.committed, ...this.partial].slice(-this.maxWords).join(" ");
  }

  wordCount(): number {
    return Math.min(this.committed.length + this.partial.length, this.maxWords);
  }

  clear(): void {
    this.committed = [];
    this.partial = [];
  }
}