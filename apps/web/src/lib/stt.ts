import "server-only";
import { assemblyaiApiKey } from "@/lib/env";

/** English-only uses the cheaper, fastest model; mixed languages use one that code-switches. */
export function speechModel(language: string): string {
  return language === "en" ? "universal-streaming-english" : "universal-3-6-pro";
}

export class SttTokenError extends Error {}

export interface SttTokenResponse {
  provider: "assemblyai";
  token: string;
  speechModel: string;
  url: string;
  sampleRate: number;
}

/**
 * A short-lived AssemblyAI streaming token, so the desktop app or the Pocket
 * window can open the transcription WebSocket without seeing the real API key.
 */
export async function issueSttToken(language: string): Promise<SttTokenResponse> {
  const apiKey = assemblyaiApiKey();
  const res = await fetch("https://token.assemblyai.com/v1/token", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ product: "streaming", expires_in_seconds: 120, max_session_duration_seconds: 10_800 }),
  });

  let token: string | undefined;
  if (res.ok) {
    token = ((await res.json()) as { token?: string }).token;
  } else {
    // Older token endpoint, kept as a fallback.
    const legacy = await fetch(
      "https://streaming.assemblyai.com/v3/token?expires_in_seconds=120&max_session_duration_seconds=10800",
      { headers: { authorization: apiKey } },
    );
    if (!legacy.ok) {
      throw new SttTokenError(`Transcription service refused the token request (${res.status}/${legacy.status}).`);
    }
    token = ((await legacy.json()) as { token?: string }).token;
  }
  if (!token) throw new SttTokenError("Transcription service returned no token.");

  return {
    provider: "assemblyai",
    token,
    speechModel: speechModel(language),
    url: "wss://streaming.assemblyai.com/v3/ws",
    sampleRate: 16_000,
  };
}
