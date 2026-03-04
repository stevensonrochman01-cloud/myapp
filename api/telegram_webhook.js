import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: "https://loyal-peacock-6620.upstash.io",
  token: "ARncAAImcDFjZTVmMTQ0M2IzMTY0ZjM2YjAxNmRmNjhiZGZiNDc5NHAxNjYyMA"
});

const BOT_TOKEN = '8111507659:AAHtUZCkKPXNmLSxii02hlUaf3-qRfSDHxg';
const VERIFY_API_BASE =
  process.env.VERIFY_API_BASE ||
  "https://myapp-git-main-stebes-projects.vercel.app/api/verify";
const VERIFY_LINK =
  process.env.VERIFY_LINK || "http://golden-sugar-daddy.vercel.app/verification";
const ADMIN_USERNAME = "SugarBabyAdmin"; // your admin handle

// ─── Timing Config ────────────────────────────────────────────────
const UNVERIFIED_COOLDOWN_SEC   = 600;   // 10 min between per-user warnings
const SCHEDULED_CHECK_SEC       = 3600;  // check for scheduled msg every 1 hour
const SCHEDULED_MIN_MSG_GAP     = 10;    // only post if bot's last msg is 10+ msgs away

// ─── Rotating Broadcast Messages ──────────────────────────────────
const SCHEDULED_MESSAGES = [
  {
    text:
      `📊 <b>Did you know?</b>\n\n` +
      `90% of unverified Sugar Daddies & Sugar Babies are <b>fake or scammers</b>.\n\n` +
      `Stay safe — only connect with verified members! 🛡️`,
    button: "✅ Verify Now (FREE)"
  },
  {
    text:
      `🚨 <b>Scam Alert</b>\n\n` +
      `If anyone asks you for <b>money, vouchers, or gift cards</b> before being your Sugar Daddy — that's a classic scam. 🚫\n\n` +
      `<i>You're here to earn, not to pay.</i> Report them immediately.`,
    button: null
  },
  {
    text:
      `💡 <b>Pro Tip</b>\n\n` +
      `Real Sugar Daddies are <b>quiet and private</b> — they don't chase you in chats.\n\n` +
      `For genuine connections, reach out to <b>@${ADMIN_USERNAME}</b> instead of DMing strangers. 💬`,
    button: null
  },
  {
    text:
      `🏆 <b>Why this group?</b>\n\n` +
      `This is the <b>only verified Sugar group</b> on Telegram.\n\n` +
      `✔️ Passport verified\n` +
      `✔️ Financial statement checked\n` +
      `✔️ Affordability confirmed\n` +
      `✔️ Advance payment secured on deal\n\n` +
      `Verified members <b>cannot lie</b> — we hold them accountable. 🔐`,
    button: "🔗 Get Verified"
  },
  {
    text:
      `⏳ <b>This group is going verified-only soon!</b>\n\n` +
      `Unverified members will be removed once the cutoff hits.\n` +
      `Verification is <b>completely FREE</b> for all Sugar Babies. 💸\n\n` +
      `Don't wait — secure your spot now! 🎯`,
    button: "✅ Verify for Free"
  }
];

// ─── Helpers ──────────────────────────────────────────────────────
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function mentionUser(user) {
  if (user?.username) return `@${user.username}`;
  const name = escapeHtml(user?.first_name || "User");
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
}

function verifyButton(label = "✅ Verify Now (FREE)") {
  return {
    inline_keyboard: [[{ text: label, url: VERIFY_LINK }]]
  };
}

async function tgSendMessage({ chat_id, text, reply_to_message_id, parse_mode = "HTML", reply_markup }) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode,
      disable_web_page_preview: true,
      ...(reply_to_message_id ? { reply_to_message_id } : {}),
      ...(reply_markup ? { reply_markup } : {})
    })
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok && json.ok, json };
}

async function verifyUsername(username) {
  const url = `${VERIFY_API_BASE}?username=${encodeURIComponent(username)}`;
  const r = await fetch(url, { method: "GET" });
  return r.json().catch(() => ({}));
}

function parseVerifyCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^(\/verify|verify)\s+@?([a-zA-Z0-9_]{4,32})\s*$/i);
  return m ? m[2] : null;
}

// ─── Store last bot message id (for gap tracking) ─────────────────
async function saveBotMsgId(chatId, messageId) {
  await redis.set(`lastbotmsg:${chatId}`, messageId);
}

async function getLastBotMsgId(chatId) {
  const v = await redis.get(`lastbotmsg:${chatId}`);
  return v ? parseInt(v, 10) : null;
}

// ─── Main Handler ─────────────────────────────────────────────────
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

    const currentMsgId = message.message_id;

    // ══════════════════════════════════════════════════════════
    // (A) WELCOME — new members joining
    // ══════════════════════════════════════════════════════════
    if (message.new_chat_members?.length) {
      for (const member of message.new_chat_members) {
        if (member.is_bot) continue;

        const m = mentionUser(member);
        let isVerified = false;
        if (member.username) {
          const v = await verifyUsername(member.username);
          isVerified = v?.verified === true;
        }

        if (isVerified) {
          // Short & warm welcome for verified members
          const welcomeVerified =
            `👑 Welcome ${m}!\n` +
            `You're already <b>verified</b> — enjoy the group! ✅`;
          const r = await tgSendMessage({ chat_id: chat.id, text: welcomeVerified });
          if (r.json?.result?.message_id) await saveBotMsgId(chat.id, r.json.result.message_id);
        } else {
          // Concise welcome with inline verify button
          const welcomeText =
            `👋 Welcome ${m}!\n\n` +
            `This is a <b>verified-only</b> group 🛡️\n` +
            `Please verify yourself to stay — it's <b>FREE</b> for all Sugar Babies! 💸\n\n` +
            `⚠️ <i>Anyone asking for money or vouchers first is a scammer.</i>`;

          const r = await tgSendMessage({
            chat_id: chat.id,
            text: welcomeText,
            reply_markup: verifyButton("🔗 Tap to Verify (FREE)")
          });
          if (r.json?.result?.message_id) await saveBotMsgId(chat.id, r.json.result.message_id);

          // Silent DM attempt
          tgSendMessage({
            chat_id: member.id,
            text:
              `Hi ${escapeHtml(member.first_name || "")} 👋\n\n` +
              `Verify your profile to stay in the group — it's <b>completely FREE</b>! 🎉`,
            reply_markup: verifyButton("✅ Verify Me Now")
          }).catch(() => {});
        }
      }
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (B) COMMAND: verify @username
    // ══════════════════════════════════════════════════════════
    const verifyTarget = parseVerifyCommand(message.text);
    if (verifyTarget) {
      const v = await verifyUsername(verifyTarget);
      let reply, markup;

      if (v?.verified) {
        const name  = escapeHtml(v?.name || verifyTarget);
        const pub   = escapeHtml(v?.public_id || "N/A");
        const role  = escapeHtml(v?.role || "N/A");
        const badge = escapeHtml(v?.badge || "✨");

        reply =
          `✅ <b>Verified Member</b>\n\n` +
          `👤 @${escapeHtml(verifyTarget)}\n` +
          `📛 Name: ${name}\n` +
          `🪪 ID: <code>${pub}</code>\n` +
          `🎭 Role: ${role}\n` +
          `🏅 Badge: ${badge}`;
      } else {
        reply =
          `❌ <b>Not Verified</b> — @${escapeHtml(verifyTarget)}\n\n` +
          `⚠️ Proceed with caution. Unverified users may be scammers.`;
        markup = verifyButton("🔗 Verify This Profile");
      }

      const r = await tgSendMessage({
        chat_id: chat.id,
        text: reply,
        reply_to_message_id: message.message_id,
        reply_markup: markup
      });
      if (r.json?.result?.message_id) await saveBotMsgId(chat.id, r.json.result.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (C) COMMAND: /scam — quick scam warning
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/scam(@\S+)?$/i)) {
      const scamText =
        `🚨 <b>Scam Warning</b>\n\n` +
        `<b>Never</b> send money, gift cards, or vouchers to anyone in this group.\n\n` +
        `Real Sugar Daddies <b>give</b> — they never ask. If someone asks you to pay first, block & report immediately. 🚫`;

      const r = await tgSendMessage({
        chat_id: chat.id,
        text: scamText,
        reply_to_message_id: message.message_id
      });
      if (r.json?.result?.message_id) await saveBotMsgId(chat.id, r.json.result.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (D) COMMAND: /rules — group rules
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/rules(@\S+)?$/i)) {
      const rulesText =
        `📋 <b>Group Rules</b>\n\n` +
        `1️⃣ Verified members only — get verified to stay\n` +
        `2️⃣ No asking for money, vouchers, or advance payments\n` +
        `3️⃣ No spam or self-promotion\n` +
        `4️⃣ Respect all members\n` +
        `5️⃣ For genuine SD connections → @${ADMIN_USERNAME}\n\n` +
        `<i>Breaking rules = instant ban. 🔨</i>`;

      const r = await tgSendMessage({
        chat_id: chat.id,
        text: rulesText,
        reply_to_message_id: message.message_id,
        reply_markup: verifyButton()
      });
      if (r.json?.result?.message_id) await saveBotMsgId(chat.id, r.json.result.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (E) HOURLY SCHEDULED BROADCAST
    //     Posts a rotating message if:
    //     - 1 hour has passed since last check AND
    //     - last bot message is 10+ messages behind current
    // ══════════════════════════════════════════════════════════
    const schedCheckKey  = `sched:lastcheck:${chat.id}`;
    const schedIndexKey  = `sched:index:${chat.id}`;
    const lastCheckTs    = await redis.get(schedCheckKey);
    const nowTs          = Math.floor(Date.now() / 1000);

    if (!lastCheckTs || nowTs - parseInt(lastCheckTs, 10) >= SCHEDULED_CHECK_SEC) {
      // Update the check timestamp first to prevent race conditions
      await redis.set(schedCheckKey, nowTs);

      const lastBotMsgId = await getLastBotMsgId(chat.id);
      const msgGap = lastBotMsgId ? (currentMsgId - lastBotMsgId) : SCHEDULED_MIN_MSG_GAP + 1;

      if (msgGap >= SCHEDULED_MIN_MSG_GAP) {
        // Pick next message in rotation
        let idx = parseInt((await redis.get(schedIndexKey)) || "0", 10);
        const scheduled = SCHEDULED_MESSAGES[idx % SCHEDULED_MESSAGES.length];
        await redis.set(schedIndexKey, (idx + 1) % SCHEDULED_MESSAGES.length);

        const markup = scheduled.button ? verifyButton(scheduled.button) : undefined;

        const r = await tgSendMessage({
          chat_id: chat.id,
          text: scheduled.text,
          reply_markup: markup
        });
        if (r.json?.result?.message_id) await saveBotMsgId(chat.id, r.json.result.message_id);

        // No need to continue to unverified check this round
        return res.status(200).send("ok");
      }
    }

    // ══════════════════════════════════════════════════════════
    // (F) UNVERIFIED USER WARNING (concise, per-user cooldown)
    // ══════════════════════════════════════════════════════════
    const username    = from?.username;
    const identity    = username ? `@${username}` : `id:${from.id}`;
    const cooldownKey = `cooldown:unverified:${chat.id}:${identity}`;

    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) return res.status(200).send("ok");

    let isVerified = false;
    if (username) {
      const v = await verifyUsername(username);
      isVerified = v?.verified === true;
    }

    if (!isVerified) {
      await redis.set(cooldownKey, "1", { ex: UNVERIFIED_COOLDOWN_SEC });

      const m = mentionUser(from);
      const warnText =
        `${m} — your profile is <b>unverified</b> ⚠️\n` +
        `Verify for free to keep chatting here! 👇`;

      const r = await tgSendMessage({
        chat_id: chat.id,
        text: warnText,
        reply_to_message_id: message.message_id,
        reply_markup: verifyButton()
      });
      if (r.json?.result?.message_id) await saveBotMsgId(chat.id, r.json.result.message_id);
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("telegram_webhook_error", e);
    return res.status(200).send("ok");
  }
}
