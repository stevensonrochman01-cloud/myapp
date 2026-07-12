import { buildDiscoveryLogEntry } from "./_requestMeta.js";

function parseRequestBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const body = parseRequestBody(req.body);
  const action = String(body.action || "").trim();
  const permission = String(body.permission || "unknown").trim() || "unknown";

  if (!action) {
    return res.status(400).json({ ok: false, error: "Missing action" });
  }

  const logEntry = buildDiscoveryLogEntry({
    headers: req.headers,
    pathname: "/find-nearby",
    action,
    permission,
    coords: body.coords
  });

  console.log("visitor_location_log", JSON.stringify(logEntry));

  return res.status(200).json({ ok: true });
}
