import { Redis } from "@upstash/redis";


const redis = new Redis({
  url: "https://loyal-peacock-6620.upstash.io",
  token: "AhncAAIgcDEYt2k1btBty1s0PCWMoat4ZvBLK1KJOT9obDGXWrmiiA"
});

const botToken = '8111507659:AAHtUZCkKPXNmLSxii02hlUaf3-qRfSDHxg';
const BOT_TOKEN = botToken;
const VERIFY_API_BASE =
  process.env.VERIFY_API_BASE ||
  "https://myapp-git-main-stebes-projects.vercel.app/api/verify";
const VERIFY_LINK =
  process.env.VERIFY_LINK || "http://golden-sugar-daddy.vercel.app/verification";

// Settings
const UNVERIFIED_COOLDOWN_SEC = 300; // 5 minutes
const REMINDER_EVERY_N_MESSAGES = 25;
const REMINDER_COOLDOWN_SEC = 1800; // 30 minutes

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function mentionUser(user) {
  const username = user?.username;
  if (username) return `@${username}`;
  const safeName = escapeHtml(user?.first_name || "User");
  return `<a href="tg://user?id=${user.id}">${safeName}</a>`;
}

async function tgSendMessage({ chat_id, text, reply_to_message_id, parse_mode }) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode,
      disable_web_page_preview: true,
      ...(reply_to_message_id ? { reply_to_message_id } : {})
    })
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok && json.ok, json };
}

async function verifyUsername(username) {
  const url = `${VERIFY_API_BASE}?username=${encodeURIComponent(username)}`;
  const r = await fetch(url, { method: "GET" });
  const j = await r.json();
  return j; // expects: { ok, verified, public_id, badge, role, name, ... }
}

function parseVerifyCommand(text) {
  if (!text) return null;
  // matches: "verify @name" or "/verify @name" or "verify name"
  const m = text.trim().match(/^(\/verify|verify)\s+@?([a-zA-Z0-9_]{4,32})\s*$/i);
  if (!m) return null;
  return m[2];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  if (!BOT_TOKEN) return res.status(500).send("Missing BOT_TOKEN");

  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).send("ok");

    const chat = message.chat;
    const from = message.from;

    if (!chat) return res.status(200).send("ok");
    if (chat.type !== "group" && chat.type !== "supergroup")
      return res.status(200).send("ok");

    if (from?.is_bot) return res.status(200).send("ok");

    // ------------- (A) Welcome flow: new members -------------
    if (message.new_chat_members?.length) {
      for (const member of message.new_chat_members) {
        if (member.is_bot) continue;

        const m = mentionUser(member);
        const username = member.username;

        let isVerified = false;
        if (username) {
          const v = await verifyUsername(username);
          isVerified = v?.verified === true;
        }

        if (!isVerified) {
          const welcomeText =
            `${m} welcome to the group 👋\n\n` +
            `To keep things safe and legit here, please verify your profile so you can connect with real sugar daddies and sugar babies.\n\n` +
            `✅ Verification is completely FREE\n` +
            `⏱ SugarBaby: 2–6 mins\n` +
            `⏱ SugarDaddy: < 1 business day\n\n` +
            `Verification link:\n${VERIFY_LINK}\n\n` +
            `⚠️ Anyone asking a sugar baby for money or vouchers is a confirmed scammer. Block and report them.`;

          await tgSendMessage({
            chat_id: chat.id,
            text: welcomeText,
            parse_mode: "HTML"
          });

          // Optional: attempt DM with the link (may fail if user never started bot)
          // We'll try quietly; no spammy error messages in group.
          try {
            await tgSendMessage({
              chat_id: member.id,
              text:
                `Hi ${escapeHtml(member.first_name || "")} 👋\n\n` +
                `Please verify to stay safe and be trusted in the group:\n${VERIFY_LINK}\n\n` +
                `Verification is FREE.`,
              parse_mode: "HTML"
            });
          } catch (_) {}
        }
      }

      return res.status(200).send("ok");
    }

    // ------------- (B) Group command: verify @username -------------
    const verifyTarget = parseVerifyCommand(message.text);
    if (verifyTarget) {
      const v = await verifyUsername(verifyTarget);

      let reply;
      if (v?.verified) {
        const name = escapeHtml(v?.name || verifyTarget);
        const pub = escapeHtml(v?.public_id || "N/A");
        const role = escapeHtml(v?.role || "N/A");
        const badge = escapeHtml(v?.badge || "N/A");

        reply =
          `✅ <b>Verified</b>\n` +
          `User: @${escapeHtml(verifyTarget)}\n` +
          `Name: ${name}\n` +
          `Public ID: <b>${pub}</b>\n` +
          `Role: ${role}\n` +
          `Badge: ${badge}\n\n` +
          `Stay safe and always verify.`;
      } else {
        reply =
          `❌ <b>Unverified</b>\n` +
          `User: @${escapeHtml(verifyTarget)}\n\n` +
          `Be careful: unverified users can potentially scam you.\n\n` +
          `Verify here:\n${VERIFY_LINK}`;
      }

      await tgSendMessage({
        chat_id: chat.id,
        text: reply,
        reply_to_message_id: message.message_id,
        parse_mode: "HTML"
      });

      return res.status(200).send("ok");
    }

    // ------------- (C) Periodic reminders after N messages -------------
    // increment message counter
    const msgCountKey = `msgcount:${chat.id}`;
    const currentCount = await redis.incr(msgCountKey);

    if (currentCount % REMINDER_EVERY_N_MESSAGES === 0) {
      const reminderKey = `reminder:cooldown:${chat.id}`;
      const already = await redis.get(reminderKey);

      if (!already) {
        const reminderText =
          `🔔 <b>Safety reminder</b>\n\n` +
          `• Be sure to verify yourself. This group is for verified people.\n` +
          `• Average verification time:\n` +
          `  - SugarBaby: 2–6 mins\n` +
          `  - SugarDaddy: < 1 business day\n` +
          `• Verification is completely FREE.\n\n` +
          `⚠️ Anyone who asks a sugar baby for money or vouchers is a confirmed scammer. Block them.\n\n` +
          `Verify here:\n${VERIFY_LINK}`;

        await tgSendMessage({
          chat_id: chat.id,
          text: reminderText,
          parse_mode: "HTML"
        });

        await redis.set(reminderKey, "1", { ex: REMINDER_COOLDOWN_SEC });
      }
    }

    // ------------- (D) Unverified warning with 5 min cooldown -------------
    const username = from?.username;

    // If no username, treat as unverified but still cooldown by user id
    const identityKey = username ? `@${username}` : `id:${from.id}`;
    const cooldownKey = `cooldown:unverified:${chat.id}:${identityKey}`;

    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) return res.status(200).send("ok");

    let isVerified = false;
    if (username) {
      const v = await verifyUsername(username);
      isVerified = v?.verified === true;
    }

    if (!isVerified) {
      // set cooldown so we don't repeat for 5 minutes
      await redis.set(cooldownKey, "1", { ex: UNVERIFIED_COOLDOWN_SEC });

      const m = mentionUser(from);

      const warnText =
        `${m} ⚠️ <b>Unverified profile</b>\n\n` +
        `Please verify to keep the group safe and avoid scams.\n\n` +
        `✅ Verification is FREE\n` +
        `Verification link:\n${VERIFY_LINK}`;

      await tgSendMessage({
        chat_id: chat.id,
        text: warnText,
        reply_to_message_id: message.message_id,
        parse_mode: "HTML"
      });
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("telegram_webhook_error", e);
    return res.status(200).send("ok");
  }
}
