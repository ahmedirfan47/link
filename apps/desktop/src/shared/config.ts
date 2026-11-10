/**
 * Public configuration. The Supabase URL and publishable key are designed to be
 * public; access is protected by Row Level Security, not by hiding these.
 */
export const SUPABASE_URL = "https://fmbdcatybvknmmtnikpr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Lf6YAThmLq-EuwGAf_H77g_Zbek3if2";

/** Where the Link web app runs. Change it in Settings after you deploy to Vercel. */
export const DEFAULT_SERVER_URL = "http://localhost:3000";

export const HOTKEYS = {
  toggleOverlay: "CommandOrControl+Shift+L",
  clearCards: "CommandOrControl+Shift+X",
  toggleClickThrough: "CommandOrControl+Shift+K",
} as const;