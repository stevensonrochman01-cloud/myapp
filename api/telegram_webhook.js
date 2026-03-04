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
const UNVERIFIED_COOLDOWN_SEC  = 600;
const SCHEDULED_CHECK_SEC      = 3600;
const SCHEDULED_MIN_MSG_GAP    = 10;

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

// ══════════════════════════════════════════════════════════════════
// LOGGER — structured, timestamped, emoji-prefixed
// ══════════════════════════════════════════════════════════════════
const log = {
  _ts: () => new Date().toISOString(),

  info:  (tag, data) => console.log( `[${log._ts()}] ℹ️  [${tag}]`, typeof data === "object" ? JSON.stringify(data) : data),
  ok:    (tag, data) => console.log( `[${log._ts()}] ✅ [${tag}]`, typeof data === "object" ? JSON.stringify(data) : data),
  warn:  (tag, data) => console.warn(`[${log._ts()}] ⚠️  [${tag}]`, typeof data === "object" ? JSON.stringify(data) : data),
  error: (tag, data) => console.error(`[${log._ts()}] ❌ [${tag}]`, typeof data === "object" ? JSON.stringify(data) : data),
  skip:  (tag, data) => console.log( `[${log._ts()}] ⏭️  [${tag}]`, typeof data === "object" ? JSON.stringify(data) : data),
  tg:    (tag, data) => console.log( `[${log._ts()}] 📨 [${tag}]`, typeof data === "object" ? JSON.stringify(data) : data),
  redis: (tag, data) => console.log( `[${log._ts()}] 🗄️  [${tag}]`, typeof data === "object" ? JSON.stringify(data) : data),
};

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

// ─── Telegram API wrapper ─────────────────────────────────────────
async function tgApi(method, body) {
  log.tg(`TG_REQUEST → ${method}`, body);
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await resp.json().catch(() => ({}));
  if (json?.ok) {
    log.ok(`TG_RESPONSE ← ${method}`, json);
  } else {
    log.error(`TG_RESPONSE ← ${method}`, json);
  }
  return json;
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

// ─── Verify API ───────────────────────────────────────────────────
async function verifyUsernameApi(username) {
  const url = `${VERIFY_API_BASE}?username=${encodeURIComponent(username)}`;
  log.info("VERIFY_API_REQUEST", { url });
  try {
    const r = await fetch(url, { method: "GET" });
    const json = await r.json();
    log.info("VERIFY_API_RESPONSE", { username, result: json });
    return json;
  } catch (e) {
    log.error("VERIFY_API_FAILED", { username, error: e.message });
    return {};
  }
}

// ─── Redis: username → user ID cache ─────────────────────────────
async function storeUserId(username, userId) {
  if (!username || !userId) return;
  try {
    await redis.set(`uid:${username.toLowerCase()}`, String(userId), {
      ex: 60 * 60 * 24 * 30
    });
    log.redis("STORE_USER_ID", { username, userId });
  } catch (e) {
    log.error("STORE_USER_ID_FAILED", { username, userId, error: e.message });
  }
}

async function getUserIdByUsername(username) {
  try {
    const val = await redis.get(`uid:${username.toLowerCase()}`);
    const userId = val ? parseInt(val, 10) : null;
    log.redis("GET_USER_ID", { username, userId, found: !!userId });
    return userId;
  } catch (e) {
    log.error("GET_USER_ID_FAILED", { username, error: e.message });
    return null;
  }
}

// ─── Redis: last bot message ID ──────────────────────────────────
async function saveBotMsgId(chatId, messageId) {
  if (!messageId) return;
  try {
    await redis.set(`lastbotmsg:${chatId}`, messageId);
    log.redis("SAVE_BOT_MSG_ID", { chatId, messageId });
  } catch (e) {
    log.error("SAVE_BOT_MSG_ID_FAILED", { chatId, messageId, error: e.message });
  }
}

async function getLastBotMsgId(chatId) {
  try {
    const v = await redis.get(`lastbotmsg:${chatId}`);
    const msgId = v ? parseInt(v, 10) : null;
    log.redis("GET_LAST_BOT_MSG_ID", { chatId, msgId });
    return msgId;
  } catch (e) {
    log.error("GET_LAST_BOT_MSG_ID_FAILED", { chatId, error: e.message });
    return null;
  }
}

// ─── Admin status check ───────────────────────────────────────────
async function isGroupAdmin(chatId, userId) {
  log.info("CHECK_ADMIN", { chatId, userId });
  const res = await tgApi("getChatMember", { chat_id: chatId, user_id: userId });
  const status = res?.result?.status;
  const isAdmin = ["administrator", "creator"].includes(status);
  log.info("CHECK_ADMIN_RESULT", { userId, status, isAdmin });
  return isAdmin;
}

// ─── Promote + assign custom title ───────────────────────────────
async function assignVerifiedTitle(chatId, userId, role) {
  log.info("ASSIGN_TITLE_START", { chatId, userId, role });

  // Step 1: Promote with zero permissions (required before title can be set)
  const promoteRes = await tgApi("promoteChatMember", {
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

  if (!promoteRes?.ok) {
    log.error("PROMOTE_FAILED", { chatId, userId, response: promoteRes });
    return {
      ok: false,
      description: `promoteChatMember failed: ${promoteRes?.description || "Unknown error"}`
    };
  }

  log.ok("PROMOTE_SUCCESS", { chatId, userId });

  // Step 2: Wait for Telegram to propagate the promotion
  log.info("PROMOTE_DELAY", "Waiting 1500ms for Telegram to propagate promotion...");
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Step 3: Set the custom title (max 16 chars, plain text only)
  const titleMap = {
    sugarbaby:  "Verified SugarBaby",
    sugardaddy: "Verified SugarDaddy"
  };
  const title = titleMap[role] || "Verified Member";
  log.info("SET_TITLE_ATTEMPT", { chatId, userId, title });

  const titleRes = await tgApi("setChatAdministratorCustomTitle", {
    chat_id: chatId,
    user_id: userId,
    custom_title: title
  });

  if (titleRes?.ok) {
    log.ok("SET_TITLE_SUCCESS", { chatId, userId, title });
  } else {
    log.error("SET_TITLE_FAILED", { chatId, userId, title, response: titleRes });
  }

  return titleRes;
}

// ─── Command parsers ──────────────────────────────────────────────
function parseAdminVerifyCommand(text) {
  if (!text) return null;
  const m = text
    .trim()
    .match(/^(?:\/verify(?:@\S+)?|verify)\s+@?([a-zA-Z0-9_]{4,32})\s+(sugarbaby|sugardaddy)\s*$/i);
  if (!m) return null;
  return { username: m[1], role: m[2].toLowerCase() };
}

function parsePublicVerifyCommand(text) {
  if (!text) return null;
  const m = text
    .trim()
    .match(/^(?:\/verify(?:@\S+)?|verify)\s+@?([a-zA-Z0-9_]{4,32})\s*$/i);
  return m ? m[1] : null;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  if (!BOT_TOKEN) return res.status(500).send("Missing BOT_TOKEN");

  try {
    const update = req.body || {};
    log.info("WEBHOOK_RECEIVED", { update_id: update.update_id });

    const message = update.message || update.edited_message;
    if (!message) {
      log.skip("NO_MESSAGE", "Update has no message — skipping");
      return res.status(200).send("ok");
    }

    const chat = message.chat;
    const from = message.from;

    log.info("MESSAGE_RECEIVED", {
      chat_id: chat?.id,
      chat_type: chat?.type,
      from_id: from?.id,
      from_username: from?.username,
      msg_id: message.message_id,
      text: message.text || "(no text)",
      is_bot: from?.is_bot
    });

    if (!chat) {
      log.skip("NO_CHAT", "No chat object — skipping");
      return res.status(200).send("ok");
    }
    if (chat.type !== "group" && chat.type !== "supergroup") {
      log.skip("NOT_A_GROUP", { chat_type: chat.type });
      return res.status(200).send("ok");
    }
    if (from?.is_bot) {
      log.skip("FROM_BOT", { from_id: from?.id });
      return res.status(200).send("ok");
    }

    const currentMsgId = message.message_id;

    // Cache sender's user ID on every message
    if (from?.username && from?.id) {
      await storeUserId(from.username, from.id);
    }

    // ══════════════════════════════════════════════════════════
    // (A) WELCOME — new members joining
    // ══════════════════════════════════════════════════════════
    if (message.new_chat_members?.length) {
      log.info("NEW_MEMBERS", { count: message.new_chat_members.length });

      for (const member of message.new_chat_members) {
        if (member.is_bot) {
          log.skip("NEW_MEMBER_IS_BOT", { id: member.id });
          continue;
        }

        log.info("PROCESSING_NEW_MEMBER", { id: member.id, username: member.username });

        if (member.username && member.id) {
          await storeUserId(member.username, member.id);
        }

        const m = mentionUser(member);
        let isVerified = false;

        if (member.username) {
          const v = await verifyUsernameApi(member.username);
          isVerified = v?.verified === true;
        } else {
          log.warn("NEW_MEMBER_NO_USERNAME", { id: member.id });
        }

        log.info("NEW_MEMBER_VERIFIED_STATUS", { username: member.username, isVerified });

        if (isVerified) {
          log.ok("WELCOME_VERIFIED", { username: member.username });
          const r = await tgSendMessage({
            chat_id: chat.id,
            text: `👑 Welcome ${m}! You're already <b>verified</b> — enjoy the group! ✅`
          });
          await saveBotMsgId(chat.id, r?.result?.message_id);
        } else {
          log.warn("WELCOME_UNVERIFIED", { username: member.username });
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

          // Silent DM attempt
          log.info("DM_ATTEMPT", { member_id: member.id });
          tgSendMessage({
            chat_id: member.id,
            text:
              `Hi ${escapeHtml(member.first_name || "")} 👋\n\n` +
              `Verify your profile to stay in the group — it's <b>completely FREE</b>! 🎉`,
            reply_markup: verifyButton("✅ Verify Me Now")
          }).then(r => {
            if (r?.ok) log.ok("DM_SENT", { member_id: member.id });
            else log.warn("DM_FAILED", { member_id: member.id, response: r });
          }).catch(e => log.warn("DM_EXCEPTION", { member_id: member.id, error: e.message }));
        }
      }
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (B) ADMIN COMMAND: /verify @username sugarbaby|sugardaddy
    // ══════════════════════════════════════════════════════════
    const adminCmd = parseAdminVerifyCommand(message.text);
    log.info("PARSE_ADMIN_CMD", { text: message.text, parsed: adminCmd });

    if (adminCmd) {
      log.info("ADMIN_CMD_DETECTED", adminCmd);

      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        log.warn("ADMIN_CMD_REJECTED_NOT_ADMIN", { from_id: from.id, username: from.username });
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
        log.warn("ADMIN_CMD_USER_NOT_CACHED", { username });
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

      log.info("ADMIN_CMD_ASSIGNING_TITLE", { username, userId: targetUserId, role });
      const result = await assignVerifiedTitle(chat.id, targetUserId, role);

      if (result?.ok) {
        const emoji = role === "sugardaddy" ? "💎" : "🌸";
        const label = role === "sugardaddy" ? "Verified SugarDaddy" : "Verified SugarBaby";
        log.ok("TITLE_ASSIGNED", { username, role, label });

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
        log.error("TITLE_ASSIGN_FAILED", { username, result });
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
    // (C) PUBLIC LOOKUP: /verify @username
    // ══════════════════════════════════════════════════════════
    const verifyTarget = parsePublicVerifyCommand(message.text);
    log.info("PARSE_PUBLIC_VERIFY", { text: message.text, target: verifyTarget });

    if (verifyTarget) {
      log.info("PUBLIC_VERIFY_START", { target: verifyTarget });
      const v = await verifyUsernameApi(verifyTarget);
      let reply, markup;

      if (v?.verified) {
        log.ok("PUBLIC_VERIFY_VERIFIED", { target: verifyTarget });
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
        log.warn("PUBLIC_VERIFY_NOT_VERIFIED", { target: verifyTarget });
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
      log.info("CMD_SCAM", { from: from.username, chat_id: chat.id });
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
      log.info("CMD_RULES", { from: from.username, chat_id: chat.id });
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
    // (F) HOURLY SCHEDULED BROADCAST
    // ══════════════════════════════════════════════════════════
    const schedCheckKey = `sched:lastcheck:${chat.id}`;
    const schedIndexKey = `sched:index:${chat.id}`;
    const lastCheckTs   = await redis.get(schedCheckKey);
    const nowTs         = Math.floor(Date.now() / 1000);
    const secSinceCheck = lastCheckTs ? nowTs - parseInt(lastCheckTs, 10) : SCHEDULED_CHECK_SEC + 1;

    log.info("SCHED_CHECK", {
      chat_id: chat.id,
      sec_since_last_check: secSinceCheck,
      threshold: SCHEDULED_CHECK_SEC,
      due: secSinceCheck >= SCHEDULED_CHECK_SEC
    });

    if (secSinceCheck >= SCHEDULED_CHECK_SEC) {
      await redis.set(schedCheckKey, nowTs);

      const lastBotMsgId = await getLastBotMsgId(chat.id);
      const msgGap = lastBotMsgId ? currentMsgId - lastBotMsgId : SCHEDULED_MIN_MSG_GAP + 1;

      log.info("SCHED_GAP_CHECK", {
        currentMsgId,
        lastBotMsgId,
        msgGap,
        threshold: SCHEDULED_MIN_MSG_GAP,
        will_post: msgGap >= SCHEDULED_MIN_MSG_GAP
      });

      if (msgGap >= SCHEDULED_MIN_MSG_GAP) {
        const idx       = parseInt((await redis.get(schedIndexKey)) || "0", 10);
        const scheduled = SCHEDULED_MESSAGES[idx % SCHEDULED_MESSAGES.length];
        await redis.set(schedIndexKey, (idx + 1) % SCHEDULED_MESSAGES.length);

        log.ok("SCHED_POSTING", { idx, next_idx: (idx + 1) % SCHEDULED_MESSAGES.length });

        const markup = scheduled.button ? verifyButton(scheduled.button) : undefined;
        const r = await tgSendMessage({ chat_id: chat.id, text: scheduled.text, reply_markup: markup });
        await saveBotMsgId(chat.id, r?.result?.message_id);
        return res.status(200).send("ok");
      } else {
        log.skip("SCHED_SKIPPED_TOO_SOON", { msgGap, needed: SCHEDULED_MIN_MSG_GAP });
      }
    }

    // ══════════════════════════════════════════════════════════
    // (G) UNVERIFIED USER WARNING
    // ══════════════════════════════════════════════════════════
    const username    = from?.username;
    const identity    = username ? `@${username}` : `id:${from.id}`;
    const cooldownKey = `cooldown:unverified:${chat.id}:${identity}`;

    const inCooldown = await redis.get(cooldownKey);
    log.info("UNVERIFIED_CHECK", { identity, inCooldown: !!inCooldown });

    if (inCooldown) {
      log.skip("UNVERIFIED_IN_COOLDOWN", { identity });
      return res.status(200).send("ok");
    }

    let isVerified = false;
    if (username) {
      const v = await verifyUsernameApi(username);
      isVerified = v?.verified === true;
    } else {
      log.warn("USER_NO_USERNAME", { from_id: from.id });
    }

    log.info("UNVERIFIED_STATUS", { identity, isVerified });

    if (!isVerified) {
      await redis.set(cooldownKey, "1", { ex: UNVERIFIED_COOLDOWN_SEC });
      log.warn("UNVERIFIED_WARNING_SENT", { identity, cooldown_sec: UNVERIFIED_COOLDOWN_SEC });

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
    } else {
      log.ok("USER_IS_VERIFIED", { identity });
    }

    return res.status(200).send("ok");

  } catch (e) {
    log.error("UNHANDLED_EXCEPTION", { message: e.message, stack: e.stack });
    return res.status(200).send("ok");
  }
}
