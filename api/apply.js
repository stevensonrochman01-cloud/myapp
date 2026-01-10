import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const body = req.body || {};

    // Validate required fields
    const required = ["role", "name", "whatsapp", "country", "dob", "is18", "consent"];
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === "") {
        return res.status(400).send(`Missing field: ${k}`);
      }
    }
    if (body.is18 !== true || body.consent !== true) {
      return res.status(400).send("18+ confirmation and consent are required.");
    }

    const dob = new Date(body.dob);
    if (Number.isNaN(dob.getTime())) return res.status(400).send("Invalid date of birth.");

    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    if (age < 18) return res.status(400).send("Applicant must be 18+.");

    const submission = {
      submittedAt: new Date().toISOString(),
      role: String(body.role || "").trim(),
      name: String(body.name || "").trim(),
      whatsapp: String(body.whatsapp || "").trim(),
      telegram: String(body.telegram || "").trim(),
      email: String(body.email || "").trim(),
      country: String(body.country || "").trim(),
      city: String(body.city || "").trim(),
      dob: String(body.dob || "").trim(),
      preference: String(body.preference || "").trim(),
      about: String(body.about || "").trim(),
      ip: (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim(),
      userAgent: String(req.headers["user-agent"] || "")
    };

    // Load creds from Vercel env var
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return res.status(500).send("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
    const creds = JSON.parse(raw);

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = process.env.GSHEET_ID;
    if (!spreadsheetId) return res.status(500).send("Missing GSHEET_ID");

    // Append row to Sheet1 (rename if your tab name differs)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          submission.submittedAt,
          submission.role,
          submission.name,
          submission.whatsapp,
          submission.telegram,
          submission.email,
          submission.country,
          submission.city,
          submission.dob,
          submission.preference,
          submission.about,
          submission.ip,
          submission.userAgent
        ]]
      }
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("apply_error", e);
    return res.status(500).send("Server error");
  }
}
