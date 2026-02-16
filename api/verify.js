// myapp/api/verify.js
import { createClient } from "@supabase/supabase-js";

  const SUPABASE_URL = "https://efrijmrcuvtwjwgcttou.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmlqbXJjdXZ0d2p3Z2N0dG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxMzA3OSwiZXhwIjoyMDg1Mzg5MDc5fQ.krH9FGamxlGGF8a3yZQjstZXBs2Y9Q0KY5VH36TqP3o";

// Use service role for server-side lookups, never expose it in the browser.

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  const usernameRaw = (req.query.username || "").toString().trim();
  if (!usernameRaw) return res.status(400).json({ ok: false, error: "Missing username" });

  const u = usernameRaw.startsWith("@") ? usernameRaw.slice(1) : usernameRaw;
  const username = u.toLowerCase();

  // try common formats people store in DB
  const candidates = [
    username,
    "@" + username,
    "https://t.me/" + username,
    "http://t.me/" + username,
    "t.me/" + username,
  ];

  try {
    // 1) prove we can read the table at all
    const probe = await sb
      .from("verified_profiles")
      .select("id, telegram")
      .limit(5);

    // 2) try to match using different stored formats
    let match = null;
    let matchedValue = null;

    for (const val of candidates) {
      const { data, error } = await sb
        .from("verified_profiles")
        .select("id, public_id, full_name, role, badge, is_verified, telegram")
        .eq("telegram", val)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        match = data;
        matchedValue = val;
        break;
      }
    }

    if (!match) {
      return res.status(200).json({
        ok: true,
        verified: false,
        reason: "not_found",
        debug: {
          input: usernameRaw,
          normalized: username,
          tried: candidates,
          probe_error: probe.error ? String(probe.error.message || probe.error) : null,
          probe_sample: probe.data || null,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      verified: !!match.is_verified,
      public_id: match.public_id || null,
      badge: match.badge || null,
      role: match.role || null,
      name: match.full_name || null,
      debug: { matchedValue, dbTelegram: match.telegram },
    });
  } catch (e) {
    console.error("verify_error", e);
    return res.status(500).json({
      ok: false,
      error: "Server error",
      detail: String(e?.message || e),
    });
  }
}
