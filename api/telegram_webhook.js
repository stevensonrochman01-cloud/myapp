const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || process.env.ADMIN_LOG_CHAT_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || process.env.ADMIN_USERNAME || "GoldenSugarAdmin";

const DEFAULT_GREETING =
  "Hi! Welcome to Golden Sugar Daddy.\n\n" +
  "Please fill out this short form and send it back in one message. " +
  "Once you submit it, I will send it directly to the owner.";

const DEFAULT_FORM_TEMPLATE =
  "Example form:\n" +
  "Full name:\n" +
  "Age:\n" +
  "City/Country:\n" +
  "Telegram username:\n" +
  "What are you looking for?\n" +
  "Tell us a little about yourself:";

function getConfiguredGreeting() {
  return process.env.BOT_GREETING?.trim() || DEFAULT_GREETING;
}

function getConfiguredFormTemplate() {
  return process.env.BOT_FORM_TEMPLATE?.trim() || DEFAULT_FORM_TEMPLATE;
}

function getStartMessage() {
  return `${getConfiguredGreeting()}\n\n${getConfiguredFormTemplate()}`;
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isTelegramCommand(text = "") {
  return /^\/[a-zA-Z0-9_]+(?:@\S+)?(?:\s|$)/.test(String(text).trim());
}

export function buildOwnerSubmissionMessage(message) {
  const from = message?.from || {};
  const submittedText = (message?.text || "").trim();
  const submittedAt = new Date().toISOString();
  const usernameLine = from.username ? `@${from.username}` : "No username";
  const firstName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim() || "Unknown";

  return [
    "<b>New bot form submission</b>",
    "",
    `<b>Name:</b> ${escapeHtml(firstName)}`,
    `<b>Username:</b> ${escapeHtml(usernameLine)}`,
    `<b>User ID:</b> ${escapeHtml(from.id ?? "Unknown")}`,
    `<b>Chat ID:</b> ${escapeHtml(message?.chat?.id ?? "Unknown")}`,
    `<b>Submitted At:</b> ${escapeHtml(submittedAt)}`,
    "",
    "<b>Form Response:</b>",
    escapeHtml(submittedText)
  ].join("\n");
}

async function callTelegram(method, payload) {
  if (!BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await response.json();
  if (!response.ok || !json?.ok) {
    const description = json?.description || `Telegram API request failed for ${method}`;
    throw new Error(description);
  }

  return json;
}

async function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function notifyOwnerOfSubmission(message) {
  if (!OWNER_CHAT_ID) {
    throw new Error("Missing OWNER_CHAT_ID or ADMIN_LOG_CHAT_ID");
  }

  await sendMessage(OWNER_CHAT_ID, buildOwnerSubmissionMessage(message), {
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function handleTextMessage(message) {
  const chatId = message?.chat?.id;
  const text = (message?.text || "").trim();

  if (!chatId || !text) {
    return;
  }

  if (isTelegramCommand(text)) {
    const command = text.split(/\s+/)[0].toLowerCase();

    if (command === "/start" || command === "/form" || command === "/help") {
      await sendMessage(chatId, getStartMessage(), {
        disable_web_page_preview: true
      });
      return;
    }

    await sendMessage(
      chatId,
      `Unknown command. Send /start to get the form, then reply with your completed answers in one message. You can also contact @${OWNER_USERNAME}.`
    );
    return;
  }

  await notifyOwnerOfSubmission(message);

  await sendMessage(
    chatId,
    `Thanks, your form was submitted successfully. If needed, you can contact @${OWNER_USERNAME}.`
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET) {
    return res.status(500).json({
      ok: false,
      error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET"
    });
  }

  if (req.headers["x-telegram-bot-api-secret-token"] !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;

    if (message?.text) {
      await handleTextMessage(message);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[telegram_webhook] error", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Webhook handler failed"
    });
  }
}
