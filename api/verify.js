// myapp/api/verify.js
import { createClient } from "@supabase/supabase-js";

  const SUPABASE_URL = "https://efrijmrcuvtwjwgcttou.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmlqbXJjdXZ0d2p3Z2N0dG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxMzA3OSwiZXhwIjoyMDg1Mzg5MDc5fQ.krH9FGamxlGGF8a3yZQjstZXBs2Y9Q0KY5VH36TqP3o";

// Use service role for server-side lookups, never expose it in the browser.

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // Allow GET or POST
  const method = req.method;
  if (method !== "GET" && method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const input = method === "GET" ? req.query : (req.body || {});
    let username = (input.username || "").toString().trim();
    const user_id = (input.user_id || "").toString().trim(); // optional fallback

    if (!username && !user_id) {
      return res.status(400).json({ ok: false, error: "Missing username or user_id" });
    }

    // Normalize username: remove leading @, lower-case
    if (username.startsWith("@")) username = username.slice(1);
    username = username.toLowerCase();

    // IMPORTANT:
    // Change "telegram_username" below to the real column in your "verified_profiles" table.
    // If your column is named "telegram" and stores @handles, change it accordingly.
    let query = sb.from("verified_profiles").select("id, public_id, full_name, role, badge, is_verified, telegram");

    let data = null;

    if (username) {
      // Try matching without @
      const r1 = await query.eq("telegram", username).maybeSingle();
      if (r1.error) throw r1.error;
      data = r1.data;

      // If you store telegram as "@name" in DB, try that too
      if (!data) {
        const r2 = await query.eq("telegram", "@" + username).maybeSingle();
        if (r2.error) throw r2.error;
        data = r2.data;
      }
    }

    // Optional fallback if you store telegram user_id in another column:
    // if (!data && user_id) { ... }

    if (!data) {
      // Not found = unverified (or "unknown"). Your choice.
      return res.status(200).json({
        ok: true,
        verified: false,
        reason: "not_found"
      });
    }

    return res.status(200).json({
      ok: true,
      verified: !!data.is_verified,
      public_id: data.public_id || null,
      badge: data.badge || null,
      role: data.role || null,
      name: data.full_name || null
    });
  } catch (e) {
    console.error("verify_error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
