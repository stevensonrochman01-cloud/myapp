function getBaseUrl(req) {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}` : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const setupSecret = process.env.TELEGRAM_SETUP_SECRET;
  if (!setupSecret) {
    return res.status(500).json({ ok: false, error: "Missing TELEGRAM_SETUP_SECRET" });
  }

  if (req.headers["x-setup-secret"] !== setupSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!botToken || !webhookSecret) {
    return res.status(500).json({
      ok: false,
      error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET"
    });
  }

  const baseUrl = getBaseUrl(req);
  if (!baseUrl) {
    return res.status(500).json({ ok: false, error: "Could not determine deployment URL" });
  }

  const webhookUrl = `${baseUrl}/api/telegram_webhook`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message", "callback_query"]
      })
    });

    const json = await response.json();
    return res.status(response.ok ? 200 : 500).json({
      ok: !!json?.ok,
      webhookUrl,
      telegram: json
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to configure Telegram webhook"
    });
  }
}
