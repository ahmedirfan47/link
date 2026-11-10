/**
 * Public configuration. The Supabase URL and publishable key are designed to be
 * public; access is protected by Row Level Security, not by hiding these.
 */
export const SUPABASE_URL = "https://fmbdcatybvknmmtnikpr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Lf6YAThmLq-EuwGAf_H77g_Zbek3if2";

/**
 * Where the Link website runs. Release builds bake in LINK_SERVER_URL;
 * development builds use localhost. Users can still change it in the app.
 */
export const DEFAULT_SERVER_URL = __LINK_SERVER_URL__;

/** Custom URL scheme: link-app://start?pack=<id>, link-app://auth?code=<code>, link-app://open */
export const DESKTOP_SCHEME = "link-app";

export const HOTKEYS = {
  toggleOverlay: "CommandOrControl+Shift+L",
  clearCards: "CommandOrControl+Shift+X",
  toggleClickThrough: "CommandOrControl+Shift+K",
} as const;