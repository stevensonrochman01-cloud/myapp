// myapp/api/verify.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: "Missing Supabase configuration" });
  }

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
    const sb = getSupabaseClient();
    if (!sb) {
      return res.status(500).json({ ok: false, error: "Supabase client not available" });
    }

    let match = null;

    for (const val of candidates) {
      const { data, error } = await sb
        .from("verified_profiles")
        .select("id, public_id, full_name, role, badge, is_verified, telegram")
        .eq("telegram", val)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        match = data;
        break;
      }
    }

    if (!match) {
      return res.status(200).json({
        ok: true,
        verified: false,
        reason: "not_found"
      });
    }

    return res.status(200).json({
      ok: true,
      verified: !!match.is_verified,
      public_id: match.public_id || null,
      badge: match.badge || null,
      role: match.role || null,
      name: match.full_name || null
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
