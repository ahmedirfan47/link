import { createClient } from "@/lib/supabase/server";

/** Everything the signed-in user has in Link, as one JSON download. */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Sign in first." }, { status: 401 });

  const [packs, sources, cues, gaps, sessions, events, asks] = await Promise.all([
    supabase.from("packs").select("*").order("created_at"),
    supabase
      .from("sources")
      .select("id, pack_id, kind, title, uri, content_text, messages, status, created_at")
      .order("created_at"),
    supabase.from("cues").select("*").order("created_at"),
    supabase.from("gap_questions").select("*").order("created_at"),
    supabase.from("sessions").select("*").order("started_at"),
    supabase.from("session_events").select("session_id, t_ms, type, payload, created_at").order("created_at"),
    supabase.from("ask_messages").select("pack_id, role, content, created_at").order("created_at"),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    account: { id: claims.claims.sub, email: claims.claims.email ?? null },
    packs: packs.data ?? [],
    sources: sources.data ?? [],
    cues: cues.data ?? [],
    gap_questions: gaps.data ?? [],
    calls: sessions.data ?? [],
    call_events: events.data ?? [],
    ask_messages: asks.data ?? [],
  };
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="link-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}