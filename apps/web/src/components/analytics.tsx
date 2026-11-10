"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

let started = false;

/**
 * PostHog product analytics and error reports. Off unless NEXT_PUBLIC_POSTHOG_KEY
 * is set. Events go through /ingest on this site (see next.config.ts) so ad
 * blockers do not drop them. Text on the page is masked, so pack content never
 * reaches PostHog.
 */
export function Analytics() {
  useEffect(() => {
    if (!KEY || started) return;
    started = true;
    posthog.init(KEY, {
      api_host: "/ingest",
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com",
      defaults: "2025-05-24",
      person_profiles: "identified_only",
      capture_exceptions: true,
      mask_all_text: true,
      disable_session_recording: true,
    });
  }, []);
  return null;
}

/** Ties analytics to the signed-in account (by id only). */
export function IdentifyUser({ id }: { id: string }) {
  useEffect(() => {
    if (!KEY || !id) return;
    // init runs in the same commit; defer one tick so it has happened.
    const t = window.setTimeout(() => posthog.identify(id), 0);
    return () => window.clearTimeout(t);
  }, [id]);
  return null;
}