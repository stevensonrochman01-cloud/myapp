const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || process.env.ADMIN_LOG_CHAT_ID || "";

function formatValue(value, fallback = "N/A") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

export function buildDiscoveryAlertMessage(logEntry) {
  const lines = [
    "New Nearby Discovery Activity",
    `Action: ${formatValue(logEntry.action)}`,
    `Permission: ${formatValue(logEntry.permission)}`,
    `IP: ${formatValue(logEntry.ip)}`,
    `Country: ${formatValue(logEntry.country)}`,
    `City: ${formatValue(logEntry.city)}`,
    `Path: ${formatValue(logEntry.pathname)}`,
    `Method: ${formatValue(logEntry.method)}`,
    `Latitude: ${formatValue(logEntry.latitude)}`,
    `Longitude: ${formatValue(logEntry.longitude)}`,
    `Accuracy: ${formatValue(logEntry.accuracy)}`,
    `User Agent: ${formatValue(logEntry.userAgent)}`,
    `Referer: ${formatValue(logEntry.referer)}`,
    `Time: ${formatValue(logEntry.timestamp)}`
  ];

  return lines.join("\n");
}

export async function sendOwnerAlert(text) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  if (!OWNER_CHAT_ID) {
    throw new Error("Missing OWNER_CHAT_ID or ADMIN_LOG_CHAT_ID");
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: OWNER_CHAT_ID,
      text
    })
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.ok) {
    throw new Error(`Telegram sendMessage failed: ${JSON.stringify(json)}`);
  }

  return json;
}
