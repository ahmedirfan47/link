/**
 * Reads environment variables in one place and fails with a clear message
 * when one is missing, instead of a confusing error deep inside a library.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing environment variable ${name}. Add it to apps/web/.env.local`);
  }
  return value;
}

// NEXT_PUBLIC_ values must be read with literal property access so Next can inline them.
export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function anthropicApiKey(): string {
  return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
}

export function packModel(): string {
  return process.env.LINK_MODEL_PACK?.trim() || "claude-sonnet-5-5";
}

export function liveModel(): string {
  return process.env.LINK_MODEL_LIVE?.trim() || "claude-haiku-5-5";
}

/** Optional. Needed to import JavaScript-heavy pages such as ChatGPT and Claude share links. */
export function firecrawlApiKey(): string | null {
  return process.env.FIRECRAWL_API_KEY?.trim() || null;
}

/** Live transcription for the desktop app. The key never leaves the server. */
export function assemblyaiApiKey(): string {
  return required("ASSEMBLYAI_API_KEY", process.env.ASSEMBLYAI_API_KEY);
}

/**
 * Server-only admin key (Supabase "secret" key, sb_secret_...). Used for things a
 * signed-in user cannot do for themselves: recording usage, redeeming desktop
 * sign-in codes, the MCP connector and deleting an account. Never sent to a browser.
 */
export function supabaseSecretKey(): string {
  return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}

/** Where the Windows installer is published (a public GitHub repo with releases only). */
export function releasesRepo(): string {
  return process.env.NEXT_PUBLIC_LINK_RELEASES_REPO?.trim() || "ahmedirfan47/link-releases";
}