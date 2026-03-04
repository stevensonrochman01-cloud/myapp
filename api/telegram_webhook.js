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
const ADMIN_USERNAME = "SugarBabyAdmin";

// ─── Timing Config ────────────────────────────────────────────────
const UNVERIFIED_COOLDOWN_SEC  = 600;   // 10 min per-user warning cooldown
const SCHEDULED_CHECK_SEC      = 3600;  // check for broadcast every 1 hour
const SCHEDULED_MIN_MSG_GAP    = 10;    // only broadcast if 10+ msgs since last bot msg

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
  return { inline_keyboard: [[{ text: label, url: VERIFY_LINK }]] };
}

async function tgApi(method, body) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return resp.json().catch(() => ({}));
}

async function tgSendMessage({ chat_id, text, reply_to_message_id, parse_mode = "HTML", reply_markup }) {
  return tgApi("sendMessage", {
    chat_id,
    text,
    parse_mode,
    disable_web_page_preview: true,
    ...(reply_to_message_id ? { reply_to_message_id } : {}),
    ...(reply_markup ? { reply_markup } : {})
  });
}

async function verifyUsernameApi(username) {
  const url = `${VERIFY_API_BASE}?username=${encodeURIComponent(username)}`;
  const r = await fetch(url, { method: "GET" });
  return r.json().catch(() => ({}));
}

// ─── Username → User ID cache (needed for title assignment) ───────
// Telegram does not allow looking up user IDs by username via Bot API.
// We cache every user's ID the moment they send a message in the group.
async function storeUserId(username, userId) {
  if (!username || !userId) return;
  await redis.set(`uid:${username.toLowerCase()}`, String(userId), {
    ex: 60 * 60 * 24 * 30 // cache for 30 days
  });
}

async function getUserIdByUsername(username) {
  const val = await redis.get(`uid:${username.toLowerCase()}`);
  return val ? parseInt(val, 10) : null;
}

// ─── Admin check ──────────────────────────────────────────────────
async function isGroupAdmin(chatId, userId) {
  const res = await tgApi("getChatMember", { chat_id: chatId, user_id: userId });
  return ["administrator", "creator"].includes(res?.result?.status);
}

// ─── Promote silently + set custom title ──────────────────────────
// Telegram requires a user to be an admin before a custom title can be set.
// We promote them with zero permissions so they get only the visual title tag.
async function assignVerifiedTitle(chatId, userId, role) {
  // Promote with no special permissions — purely for title eligibility
  await tgApi("promoteChatMember", {
    chat_id: chatId,
    user_id: userId,
    is_anonymous: false,
    can_manage_chat: false,
    can_change_info: false,
    can_delete_messages: false,
    can_invite_users: false,
    can_restrict_members: false,
    can_pin_messages: false,
    can_promote_members: false,
    can_manage_video_chats: false
  });

  // Telegram custom titles: plain text only, max 16 chars
  const titleMap = {
    sugarbaby:  "Verified SugarBaby",
    sugardaddy: "Verified SugarDaddy"
  };
  const title = titleMap[role] || "Verified Member";

  return tgApi("setChatAdministratorCustomTitle", {
    chat_id: chatId,
    user_id: userId,
    custom_title: title
  });
}

// ─── Command parsers ──────────────────────────────────────────────

// Admin version: /verify @username sugarbaby   OR   /verify @username sugardaddy
function parseAdminVerifyCommand(text) {
  if (!text) return null;
  const m = text
    .trim()
    .match(/^\/verify\s+@?([a-zA-Z0-9_]{4,32})\s+(sugarbaby|sugardaddy)\s*$/i);
  if (!m) return null;
  return { username: m[1], role: m[2].toLowerCase() };
}

// Public lookup: /verify @username  (or: verify @username)
function parsePublicVerifyCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^(\/verify|verify)\s+@?([a-zA-Z0-9_]{4,32})\s*$/i);
  return m ? m[2] : null;
}

// ─── Last bot message tracking ────────────────────────────────────
async function saveBotMsgId(chatId, messageId) {
  if (messageId) await redis.set(`lastbotmsg:${chatId}`, messageId);
}

async function getLastBotMsgId(chatId) {
  const v = await redis.get(`lastbotmsg:${chatId}`);
  return v ? parseInt(v, 10) : null;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
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

    // Cache sender's user ID on every message received
    if (from?.username && from?.id) {
      storeUserId(from.username, from.id); // fire-and-forget
    }

    // ══════════════════════════════════════════════════════════
    // (A) WELCOME — new members
    // ══════════════════════════════════════════════════════════
    if (message.new_chat_members?.length) {
      for (const member of message.new_chat_members) {
        if (member.is_bot) continue;

        // Cache new member's ID immediately
        if (member.username && member.id) storeUserId(member.username, member.id);

        const m = mentionUser(member);
        let isVerified = false;
        if (member.username) {
          const v = await verifyUsernameApi(member.username);
          isVerified = v?.verified === true;
        }

        if (isVerified) {
          const r = await tgSendMessage({
            chat_id: chat.id,
            text: `👑 Welcome ${m}! You're already <b>verified</b> — enjoy the group! ✅`
          });
          await saveBotMsgId(chat.id, r?.result?.message_id);
        } else {
          const r = await tgSendMessage({
            chat_id: chat.id,
            text:
              `👋 Welcome ${m}!\n\n` +
              `This is a <b>verified-only</b> group 🛡️\n` +
              `Please verify yourself to stay — it's <b>FREE</b> for all Sugar Babies! 💸\n\n` +
              `⚠️ <i>Anyone asking for money or vouchers first is a scammer.</i>`,
            reply_markup: verifyButton("🔗 Tap to Verify (FREE)")
          });
          await saveBotMsgId(chat.id, r?.result?.message_id);

          // Silent DM — fails quietly if user never started the bot
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
    // (B) ADMIN COMMAND: /verify @username sugarbaby|sugardaddy
    //     Only group admins can use this.
    //     Assigns a visible title tag next to the member's name.
    // ══════════════════════════════════════════════════════════
    const adminCmd = parseAdminVerifyCommand(message.text);
    if (adminCmd) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);

      if (!senderIsAdmin) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `🚫 Only group admins can assign verification tags.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const { username, role } = adminCmd;
      const targetUserId = await getUserIdByUsername(username);

      if (!targetUserId) {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `⚠️ <b>User not found in cache</b>\n\n` +
            `@${escapeHtml(username)} hasn't sent a message in this group yet.\n` +
            `Ask them to send one message here first, then retry.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const result = await assignVerifiedTitle(chat.id, targetUserId, role);

      if (result?.ok) {
        const emoji = role === "sugardaddy" ? "💎" : "🌸";
        const label = role === "sugardaddy" ? "Verified SugarDaddy" : "Verified SugarBaby";

        const r = await tgSendMessage({
          chat_id: chat.id,
          text:
            `${emoji} <b>Verification Tag Assigned!</b>\n\n` +
            `👤 @${escapeHtml(username)}\n` +
            `🏷️ Title: <b>${label}</b>\n\n` +
            `Their name now shows the verified tag in the group. ✅`,
          reply_to_message_id: message.message_id
        });
        await saveBotMsgId(chat.id, r?.result?.message_id);
      } else {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `❌ <b>Could not assign title</b>\n\n` +
            `Make sure:\n` +
            `• The bot has <b>Admin</b> rights in this group\n` +
            `• @${escapeHtml(username)} is still in this group\n` +
            `• The bot's admin rank is <b>higher</b> than the target user's rank\n\n` +
            `<i>Error: ${escapeHtml(result?.description || "Unknown")}</i>`,
          reply_to_message_id: message.message_id
        });
      }

      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (C) PUBLIC LOOKUP: /verify @username  (status check only)
    // ══════════════════════════════════════════════════════════
    const verifyTarget = parsePublicVerifyCommand(message.text);
    if (verifyTarget) {
      const v = await verifyUsernameApi(verifyTarget);
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
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (D) COMMAND: /scam
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/scam(@\S+)?$/i)) {
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `🚨 <b>Scam Warning</b>\n\n` +
          `<b>Never</b> send money, gift cards, or vouchers to anyone here.\n\n` +
          `Real Sugar Daddies <b>give</b> — they never ask you to pay first. Block & report immediately. 🚫`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (E) COMMAND: /rules
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/rules(@\S+)?$/i)) {
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📋 <b>Group Rules</b>\n\n` +
          `1️⃣ Verified members only — get verified to stay\n` +
          `2️⃣ No asking for money, vouchers, or advance payments\n` +
          `3️⃣ No spam or self-promotion\n` +
          `4️⃣ Respect all members\n` +
          `5️⃣ For genuine SD connections → @${ADMIN_USERNAME}\n\n` +
          `<i>Breaking rules = instant ban. 🔨</i>`,
        reply_to_message_id: message.message_id,
        reply_markup: verifyButton()
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (F) HOURLY SCHEDULED BROADCAST (rotating messages)
    // ══════════════════════════════════════════════════════════
    const schedCheckKey = `sched:lastcheck:${chat.id}`;
    const schedIndexKey = `sched:index:${chat.id}`;
    const lastCheckTs   = await redis.get(schedCheckKey);
    const nowTs         = Math.floor(Date.now() / 1000);

    if (!lastCheckTs || nowTs - parseInt(lastCheckTs, 10) >= SCHEDULED_CHECK_SEC) {
      await redis.set(schedCheckKey, nowTs);

      const lastBotMsgId = await getLastBotMsgId(chat.id);
      const msgGap = lastBotMsgId
        ? currentMsgId - lastBotMsgId
        : SCHEDULED_MIN_MSG_GAP + 1;

      if (msgGap >= SCHEDULED_MIN_MSG_GAP) {
        const idx       = parseInt((await redis.get(schedIndexKey)) || "0", 10);
        const scheduled = SCHEDULED_MESSAGES[idx % SCHEDULED_MESSAGES.length];
        await redis.set(schedIndexKey, (idx + 1) % SCHEDULED_MESSAGES.length);

        const markup = scheduled.button ? verifyButton(scheduled.button) : undefined;
        const r = await tgSendMessage({
          chat_id: chat.id,
          text: scheduled.text,
          reply_markup: markup
        });
        await saveBotMsgId(chat.id, r?.result?.message_id);
        return res.status(200).send("ok");
      }
    }

    // ══════════════════════════════════════════════════════════
    // (G) UNVERIFIED USER WARNING (2-line, 10-min cooldown)
    // ══════════════════════════════════════════════════════════
    const username    = from?.username;
    const identity    = username ? `@${username}` : `id:${from.id}`;
    const cooldownKey = `cooldown:unverified:${chat.id}:${identity}`;

    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) return res.status(200).send("ok");

    let isVerified = false;
    if (username) {
      const v = await verifyUsernameApi(username);
      isVerified = v?.verified === true;
    }

    if (!isVerified) {
      await redis.set(cooldownKey, "1", { ex: UNVERIFIED_COOLDOWN_SEC });
      const m = mentionUser(from);
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `${m} — your profile is <b>unverified</b> ⚠️\n` +
          `Verify for free to keep chatting here! 👇`,
        reply_to_message_id: message.message_id,
        reply_markup: verifyButton()
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("telegram_webhook_error", e);
    return res.status(200).send("ok");
  }
}
