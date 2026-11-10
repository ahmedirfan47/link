import { HashingEmbedder, type Embedder } from "@link/core";

/**
 * The model that turns speech into meaning vectors, running locally in this
 * window. Downloaded once (about 25 MB for English) and cached by the browser.
 * If it cannot load (offline on first run), a basic keyword embedder is used.
 */

export interface LoadedEmbedder {
  embedder: Embedder;
  /** Human-readable name for the status line. */
  name: string;
  /** neural = semantic model; basic = keyword fallback (different score range). */
  quality: "neural" | "basic";
}

const ENGLISH_MODEL = "onnx-community/all-MiniLM-L6-v2-ONNX";
const MULTILINGUAL_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const BATCH = 32;

/** Cosine thresholds for sensitivity 1 (strict) … 5 (loose). */
const THRESHOLDS: Record<LoadedEmbedder["quality"], number[]> = {
  neural: [0.68, 0.62, 0.56, 0.51, 0.46],
  basic: [0.5, 0.42, 0.35, 0.3, 0.25],
};

export function thresholdFor(quality: LoadedEmbedder["quality"], sensitivity: number): number {
  const list = THRESHOLDS[quality];
  return list[Math.min(list.length - 1, Math.max(0, Math.round(sensitivity) - 1))]!;
}

export async function loadEmbedder(
  language: string,
  onProgress: (message: string) => void,
): Promise<LoadedEmbedder> {
  const model = language === "en" ? ENGLISH_MODEL : MULTILINGUAL_MODEL;
  try {
    onProgress("Loading the matching model…");
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;

    const extractor = await pipeline("feature-extraction", model, {
      dtype: "q8",
      progress_callback: (p: unknown) => {
        const info = p as { status?: string; progress?: number; file?: string };
        if (info.status === "progress" && typeof info.progress === "number") {
          onProgress(`Downloading matching model… ${Math.round(info.progress)}%`);
        }
      },
    });

    const embedder: Embedder = {
      dimensions: 384,
      async embed(texts: string[]): Promise<Float32Array[]> {
        const out: Float32Array[] = [];
        for (let i = 0; i < texts.length; i += BATCH) {
          const batch = texts.slice(i, i + BATCH);
          const tensor = await extractor(batch, { pooling: "mean", normalize: true });
          const rows = tensor.tolist() as number[][];
          for (const row of rows) out.push(Float32Array.from(row));
        }
        return out;
      },
    };
    // Warm up so the first real match is fast.
    await embedder.embed(["warm up"]);
    return { embedder, name: language === "en" ? "MiniLM (English)" : "MiniLM (multilingual)", quality: "neural" };
  } catch (err) {
    console.warn("Neural embedder unavailable, using basic matching", err);
    onProgress("Matching model unavailable; using basic keyword matching.");
    return { embedder: new HashingEmbedder(), name: "Basic keyword matching", quality: "basic" };
  }
}