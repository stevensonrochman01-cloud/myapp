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

// ─── SCAM REPORT CONFIG ───────────────────────────────────────────
// Set this to a private admin/log channel chat ID to receive evidence forwarding.
// Leave as null to disable forwarding.
const ADMIN_LOG_CHAT_ID = process.env.ADMIN_LOG_CHAT_ID || null;

// Strike thresholds (weighted: verified reporter = 2pts, unverified = 1pt)
const MUTE_STRIKE_THRESHOLD   = 3;   // Mute suspect + ping admins
const BAN_STRIKE_THRESHOLD    = 5;   // Auto-ban if target is also unverified
const MUTE_DURATION_SEC       = 3600; // 1 hour mute

// ─── Timing Config ────────────────────────────────────────────────
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
      `<i>You're here to earn, not to pay.</i> Report them immediately using /report @username.`,
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
  log.info("PROMOTE_DELAY", "Waiting 1500ms for Telegram to propagate promotion...");
  await new Promise(resolve => setTimeout(resolve, 1500));

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

// ══════════════════════════════════════════════════════════════════
// SCAM REPORTING SYSTEM
// ══════════════════════════════════════════════════════════════════

// ─── Redis keys ───────────────────────────────────────────────────
// scam:reports:<username>       → JSON array of report objects
// scam:strikes:<username>       → total weighted strike score (string number)
// scam:blacklist:<username>     → "1" if globally confirmed scammer
// scam:confirmed:<username>     → JSON with confirmation details

async function getScamReports(username) {
  try {
    const raw = await redis.get(`scam:reports:${username.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    log.error("GET_SCAM_REPORTS_FAILED", { username, error: e.message });
    return [];
  }
}

async function saveScamReports(username, reports) {
  try {
    await redis.set(`scam:reports:${username.toLowerCase()}`, JSON.stringify(reports), {
      ex: 60 * 60 * 24 * 90  // 90-day retention
    });
  } catch (e) {
    log.error("SAVE_SCAM_REPORTS_FAILED", { username, error: e.message });
  }
}

async function getStrikeScore(username) {
  try {
    const v = await redis.get(`scam:strikes:${username.toLowerCase()}`);
    if (!v) return 0;
    // Support both legacy plain number and new "score:count" format
    const str = String(v);
    return parseFloat(str.split(":")[0]);
  } catch (e) {
    log.error("GET_STRIKE_SCORE_FAILED", { username, error: e.message });
    return 0;
  }
}

async function getStrikeData(username) {
  try {
    const v = await redis.get(`scam:strikes:${username.toLowerCase()}`);
    if (!v) return { score: 0, count: 0 };
    const parts = String(v).split(":");
    return { score: parseFloat(parts[0]), count: parseInt(parts[1] || "0", 10) };
  } catch (e) {
    log.error("GET_STRIKE_DATA_FAILED", { username, error: e.message });
    return { score: 0, count: 0 };
  }
}

async function setStrikeScore(username, score, count = 0) {
  try {
    await redis.set(`scam:strikes:${username.toLowerCase()}`, `${score}:${count}`, {
      ex: 60 * 60 * 24 * 90
    });
  } catch (e) {
    log.error("SET_STRIKE_SCORE_FAILED", { username, error: e.message });
  }
}

async function isBlacklisted(username) {
  try {
    const v = await redis.get(`scam:blacklist:${username.toLowerCase()}`);
    return !!v;
  } catch (e) {
    log.error("IS_BLACKLISTED_FAILED", { username, error: e.message });
    return false;
  }
}

async function addToBlacklist(username, details = {}) {
  try {
    await redis.set(`scam:blacklist:${username.toLowerCase()}`, "1");
    await redis.set(
      `scam:confirmed:${username.toLowerCase()}`,
      JSON.stringify({ username, ...details, confirmedAt: Date.now() })
    );
    log.redis("BLACKLISTED", { username });
  } catch (e) {
    log.error("ADD_TO_BLACKLIST_FAILED", { username, error: e.message });
  }
}

async function removeFromBlacklist(username) {
  try {
    await redis.del(`scam:blacklist:${username.toLowerCase()}`);
    await redis.del(`scam:confirmed:${username.toLowerCase()}`);
    await redis.del(`scam:reports:${username.toLowerCase()}`);
    await redis.del(`scam:strikes:${username.toLowerCase()}`);
    log.redis("BLACKLIST_CLEARED", { username });
  } catch (e) {
    log.error("REMOVE_FROM_BLACKLIST_FAILED", { username, error: e.message });
  }
}

// ─── Redis: departure feedback pending ───────────────────────────
async function setFeedbackPending(userId, meta = {}) {
  try {
    await redis.set(
      `feedback:pending:${userId}`,
      JSON.stringify({ ...meta, askedAt: Date.now() }),
      { ex: 60 * 60 * 48 } // expires after 48 hours
    );
    log.redis("FEEDBACK_PENDING_SET", { userId });
  } catch (e) {
    log.error("FEEDBACK_PENDING_SET_FAILED", { userId, error: e.message });
  }
}

async function getFeedbackPending(userId) {
  try {
    const raw = await redis.get(`feedback:pending:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    log.error("FEEDBACK_PENDING_GET_FAILED", { userId, error: e.message });
    return null;
  }
}

async function clearFeedbackPending(userId) {
  try {
    await redis.del(`feedback:pending:${userId}`);
    log.redis("FEEDBACK_PENDING_CLEARED", { userId });
  } catch (e) {
    log.error("FEEDBACK_PENDING_CLEAR_FAILED", { userId, error: e.message });
  }
}

// ─── Mute a user ──────────────────────────────────────────────────
async function muteUser(chatId, userId, durationSec = MUTE_DURATION_SEC) {
  const untilDate = Math.floor(Date.now() / 1000) + durationSec;
  log.info("MUTE_USER", { chatId, userId, durationSec });
  return tgApi("restrictChatMember", {
    chat_id: chatId,
    user_id: userId,
    until_date: untilDate,
    permissions: {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    }
  });
}

// ─── Ban a user ───────────────────────────────────────────────────
async function banUser(chatId, userId) {
  log.info("BAN_USER", { chatId, userId });
  return tgApi("banChatMember", { chat_id: chatId, user_id: userId });
}

// ─── Forward evidence message to admin log channel ────────────────
async function forwardEvidence(fromChatId, messageId) {
  if (!ADMIN_LOG_CHAT_ID) return null;
  log.info("FORWARD_EVIDENCE", { fromChatId, messageId, to: ADMIN_LOG_CHAT_ID });
  return tgApi("forwardMessage", {
    chat_id: ADMIN_LOG_CHAT_ID,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

// ─── Get top N most reported users (across all time) ─────────────
async function getTopReported(limit = 10) {
  try {
    const keys = await redis.keys("scam:strikes:*");
    const results = [];
    for (const key of keys) {
      const username  = key.replace("scam:strikes:", "");
      const { score, count } = await getStrikeData(username);
      const confirmed = !!(await redis.get(`scam:blacklist:${username}`));
      results.push({ username, score, reportCount: count, confirmed });
    }
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (e) {
    log.error("GET_TOP_REPORTED_FAILED", { error: e.message });
    return [];
  }
}

// ─── Core report handler ──────────────────────────────────────────
/**
 * Files a scam report against targetUsername.
 * Returns { alreadyReported, newScore, muteTriggered, banTriggered }
 */
async function fileScamReport({ targetUsername, reporterId, reporterUsername, reporterVerified, reason, chatId, evidenceMsgId }) {
  const reports = await getScamReports(targetUsername);

  // Prevent duplicate reports from same reporter
  const alreadyReported = reports.some(r => r.reporterId === reporterId);
  if (alreadyReported) {
    log.warn("REPORT_DUPLICATE", { targetUsername, reporterId });
    return { alreadyReported: true, newScore: await getStrikeScore(targetUsername), muteTriggered: false, banTriggered: false };
  }

  // Credibility weight: verified reporter = 2, unverified = 1
  const weight = reporterVerified ? 2 : 1;

  const reportEntry = {
    reporterId,
    reporterUsername: reporterUsername || null,
    reporterVerified,
    weight,
    reason: reason || "No reason given",
    chatId,
    evidenceMsgId: evidenceMsgId || null,
    ts: Date.now()
  };

  reports.push(reportEntry);
  await saveScamReports(targetUsername, reports);

  const oldScore = await getStrikeScore(targetUsername);
  const newScore = oldScore + weight;
  // Store score AND report count together so /scamreports never mismatches
  await setStrikeScore(targetUsername, newScore, reports.length);

  log.ok("REPORT_FILED", { targetUsername, reporterId, weight, newScore });

  // Forward evidence to admin log
  if (evidenceMsgId && ADMIN_LOG_CHAT_ID) {
    const contextNote = `🚨 <b>Report Evidence</b>\n👤 Reported: @${escapeHtml(targetUsername)}\n📋 Reason: ${escapeHtml(reason || "None")}\n⚖️ Reporter: @${escapeHtml(reporterUsername || "unknown")} (${reporterVerified ? "✅ Verified" : "⚠️ Unverified"})\n📊 New strike score: ${newScore}`;
    await tgSendMessage({ chat_id: ADMIN_LOG_CHAT_ID, text: contextNote });
    await forwardEvidence(chatId, evidenceMsgId);
  }

  return { alreadyReported: false, newScore, muteTriggered: false, banTriggered: false };
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

/**
 * Parses /report command — NO regex on the reason, accepts any free text.
 *   /report @username any reason text here  → { targetUsername, reason }
 *   /report any reason text here (as reply) → { targetUsername: null, reason }
 *   /report                                 → { targetUsername: null, reason: null }
 */
function parseReportCommand(text) {
  if (!text) return null;
  const trimmed = text.trim();

  // Must start with /report (optionally @botname)
  const prefix = trimmed.match(/^\/report(?:@\S+)?/i);
  if (!prefix) return null;

  // Everything after the command trigger
  const rest = trimmed.slice(prefix[0].length).trim();

  // If starts with @username, split it off — rest is the reason
  const withUser = rest.match(/^@?([a-zA-Z0-9_]{4,32})(?:\s+(.+))?$/is);
  if (withUser && rest.startsWith("@")) {
    return { targetUsername: withUser[1], reason: withUser[2]?.trim() || null };
  }

  // No @username prefix — entire rest is the reason (reply-based usage)
  return { targetUsername: null, reason: rest || null };
}

/**
 * Parses /clearreport @username  (admin only)
 */
function parseClearReportCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/clearreport(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})\s*$/i);
  return m ? m[1] : null;
}

/**
 * Parses /confirm @username [tactics]  (admin only — confirms as scammer)
 */
function parseConfirmScammerCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/confirmscam(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})(?:\s+(.+))?$/i);
  if (!m) return null;
  return { username: m[1], tactics: m[2]?.trim() || null };
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
    if (from?.is_bot) {
      log.skip("FROM_BOT", { from_id: from?.id });
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (PRIVATE) DEPARTURE FEEDBACK — DM reply from a user who left
    // Must be checked BEFORE the group-only guard so private
    // messages can still reach this path.
    // ══════════════════════════════════════════════════════════
    if (chat.type === "private" && from?.id && message.text) {
      const pending = await getFeedbackPending(from.id);

      if (pending) {
        log.info("FEEDBACK_RECEIVED", { from_id: from.id, text: message.text });
        await clearFeedbackPending(from.id);

        const firstName   = escapeHtml(from.first_name || "");
        const lastName    = escapeHtml(from.last_name  || "");
        const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
        const username    = from.username ? `@${escapeHtml(from.username)}` : `(no username)`;

        // Thank the user
        await tgSendMessage({
          chat_id: from.id,
          text:
            `💛 Thank you for your feedback, ${firstName}!\n\n` +
            `Our team will review it and use it to improve the group. We hope to see you back someday! 🙏`
        });

        // Forward feedback to admin
        if (ADMIN_LOG_CHAT_ID) {
          await tgSendMessage({
            chat_id: ADMIN_LOG_CHAT_ID,
            text:
              `📩 <b>Departure Feedback Received</b>\n\n` +
              `👤 Name: ${displayName}\n` +
              `🔗 Username: ${username}\n` +
              `🪪 User ID: <code>${from.id}</code>\n` +
              `🏘️ Left group: ${escapeHtml(pending.chatTitle || "Unknown")}\n` +
              `📅 Left at: ${new Date(pending.leftAt || Date.now()).toUTCString()}\n\n` +
              `💬 <b>Their reason:</b>\n${escapeHtml(message.text)}`
          });
          log.ok("FEEDBACK_FORWARDED_TO_ADMIN", { from_id: from.id });
        } else {
          log.warn("FEEDBACK_NO_ADMIN_CHANNEL", "ADMIN_LOG_CHAT_ID not set — feedback not forwarded");
        }

        return res.status(200).send("ok");
      }

      // Private message but no pending feedback — ignore silently
      log.skip("PRIVATE_NO_PENDING_FEEDBACK", { from_id: from.id });
      return res.status(200).send("ok");
    }

    // From here on, only process group / supergroup messages
    if (chat.type !== "group" && chat.type !== "supergroup") {
      log.skip("NOT_A_GROUP", { chat_type: chat.type });
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

        // Build a friendly display name — prefer @username, fall back to First [Last] name
        const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || "there";
        const displayName = member.username
          ? `@${member.username}`
          : `<b>${escapeHtml(fullName)}</b>`;
        // Linked mention (clickable) for inline use
        const m = member.username
          ? `@${member.username}`
          : `<a href="tg://user?id=${member.id}">${escapeHtml(fullName)}</a>`;

        let isVerified = false;

        if (member.username) {
          // ── Blacklist check on join ──
          const blacklisted = await isBlacklisted(member.username);
          if (blacklisted) {
            log.warn("BLACKLISTED_USER_JOINED", { username: member.username });
            await banUser(chat.id, member.id);
            await tgSendMessage({
              chat_id: chat.id,
              text:
                `🚫 <b>Banned on entry</b>\n\n` +
                `${displayName} is on the <b>global scammer blacklist</b> and has been automatically removed. 🔐`
            });
            continue;
          }

          const v = await verifyUsernameApi(member.username);
          isVerified = v?.verified === true;
        } else {
          log.warn("NEW_MEMBER_NO_USERNAME", { id: member.id, name: fullName });
        }

        log.info("NEW_MEMBER_VERIFIED_STATUS", { username: member.username, name: fullName, isVerified });

        if (isVerified) {
          log.ok("WELCOME_VERIFIED", { username: member.username });
          const r = await tgSendMessage({
            chat_id: chat.id,
            text: `👑 Welcome ${m}! You're already <b>verified</b> — enjoy the group! ✅`
          });
          await saveBotMsgId(chat.id, r?.result?.message_id);
        } else {
          log.warn("WELCOME_UNVERIFIED", { username: member.username, name: fullName });

          // Build context-aware welcome text
          const noUsernameNote = !member.username
            ? `\n\n<i>💡 Tip: Set a Telegram username in your profile settings so others can verify you.</i>`
            : "";

          const r = await tgSendMessage({
            chat_id: chat.id,
            text:
              `👋 Welcome, ${m}!\n\n` +
              `This is a <b>verified-only</b> group 🛡️\n` +
              `Please verify yourself to stay — it's <b>FREE</b> for all Sugar Babies! 💸\n\n` +
              `⚠️ <i>Anyone asking for money or vouchers first is a scammer.</i>` +
              noUsernameNote,
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
    // (A2) DEPARTURE — member left or was removed
    // ══════════════════════════════════════════════════════════
    if (message.left_chat_member) {
      const leaver = message.left_chat_member;

      if (leaver.is_bot) {
        log.skip("LEFT_MEMBER_IS_BOT", { id: leaver.id });
        return res.status(200).send("ok");
      }

      const fullName    = [leaver.first_name, leaver.last_name].filter(Boolean).join(" ").trim() || "there";
      const firstName   = escapeHtml(leaver.first_name || fullName);
      const chatTitle   = escapeHtml(chat.title || "the group");

      log.info("MEMBER_LEFT", { id: leaver.id, username: leaver.username, name: fullName });

      // Send a DM asking for departure feedback
      tgSendMessage({
        chat_id: leaver.id,
        text:
          `Hey ${firstName} 👋\n\n` +
          `I noticed you left <b>${chatTitle}</b>. We're sorry to see you go! 😔\n\n` +
          `Would you mind sharing why you left? Your feedback helps us improve the group for everyone.\n\n` +
          `Just reply to this message with your reason — it goes straight to the admin team. 💬\n\n` +
          `<i>(You have 48 hours to reply. Your response is completely private.)</i>`
      }).then(async dmResult => {
        if (dmResult?.ok) {
          log.ok("DEPARTURE_DM_SENT", { leaver_id: leaver.id });
          // Mark this user as awaiting feedback so the private handler picks it up
          await setFeedbackPending(leaver.id, {
            chatId:    chat.id,
            chatTitle: chat.title || "",
            leftAt:    Date.now(),
            username:  leaver.username || null,
            name:      fullName
          });
        } else {
          log.warn("DEPARTURE_DM_FAILED", { leaver_id: leaver.id, response: dmResult });
        }
      }).catch(e => log.warn("DEPARTURE_DM_EXCEPTION", { leaver_id: leaver.id, error: e.message }));

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

        // Show blacklist status in lookup result
        const blacklisted = await isBlacklisted(verifyTarget);
        if (blacklisted) {
          reply =
            `🚫 <b>CONFIRMED SCAMMER</b> — @${escapeHtml(verifyTarget)}\n\n` +
            `⛔ This user is on the <b>global scammer blacklist</b>.\n` +
            `Do NOT engage with this person. Block immediately.`;
        } else {
          const score = await getStrikeScore(verifyTarget);
          const reports = await getScamReports(verifyTarget);
          reply =
            `❌ <b>Not Verified</b> — @${escapeHtml(verifyTarget)}\n\n` +
            `⚠️ Proceed with caution. Unverified users may be scammers.\n` +
            (score > 0
              ? `\n📊 <b>Report Score:</b> ${score} pts from ${reports.length} report(s)`
              : "");
          markup = verifyButton("🔗 Verify This Profile");
        }
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
          `Real Sugar Daddies <b>give</b> — they never ask you to pay first.\n\n` +
          `📣 To report a scammer: reply to their message and type <code>/report [reason]</code>\n` +
          `Or use: <code>/report @username [reason]</code>\n\n` +
          `Block & report immediately. 🚫`,
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
          `5️⃣ For genuine SD connections → @${ADMIN_USERNAME}\n` +
          `6️⃣ Report suspected scammers: /report @username [reason]\n\n` +
          `<i>Breaking rules = instant ban. 🔨</i>`,
        reply_to_message_id: message.message_id,
        reply_markup: verifyButton()
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (H) COMMAND: /report  ← NEW
    //   Usage 1: /report @username [reason]
    //   Usage 2: Reply to a message + /report [reason]
    // ══════════════════════════════════════════════════════════
    const reportCmd = parseReportCommand(message.text);

    if (reportCmd !== null) {
      log.info("CMD_REPORT_DETECTED", { from: from.username, parsed: reportCmd });

      let targetUsername = reportCmd.targetUsername;
      let reason         = reportCmd.reason;
      let evidenceMsgId  = null;

      // ── Reply-based report: ALWAYS override target from the replied message.
      // This also fixes the regex-eats-reason bug (e.g. /report asking for money
      // where "asking" was wrongly parsed as a username).
      if (message.reply_to_message) {
        const replyFrom   = message.reply_to_message.from;
        evidenceMsgId     = message.reply_to_message.message_id;

        if (!replyFrom?.username) {
          await tgSendMessage({
            chat_id: chat.id,
            text:
              `⚠️ <b>Cannot identify target</b>\n\n` +
              `The user you replied to has no username. Try:\n` +
              `<code>/report @username [reason]</code>`,
            reply_to_message_id: message.message_id
          });
          return res.status(200).send("ok");
        }

        // Override username with the reply target
        targetUsername = replyFrom.username;

        // Re-extract reason as EVERYTHING after /report (ignoring any parsed username)
        const rawReason = message.text?.trim().match(/^\/report(?:@\S+)?(?:\s+(.+))?$/i);
        reason = rawReason?.[1]?.trim() || null;

        log.info("REPORT_REPLY_RESOLVED", { targetUsername, reason, evidenceMsgId });
      }

      if (!targetUsername) {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `ℹ️ <b>How to report a scammer</b>\n\n` +
            `Option 1 — Reply to their message and type:\n<code>/report [reason]</code>\n\n` +
            `Option 2 — Use their username:\n<code>/report @username [reason]</code>\n\n` +
            `Example: <code>/report @john asked me for vouchers</code>`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      // Prevent self-report
      if (targetUsername.toLowerCase() === from?.username?.toLowerCase()) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `🤨 You can't report yourself.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      // Prevent reporting the bot admin
      if (targetUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `🚫 You cannot report the group admin.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      // Check reporter's verification status for credibility scoring
      let reporterVerified = false;
      if (from?.username) {
        const rv = await verifyUsernameApi(from.username);
        reporterVerified = rv?.verified === true;
      }

      const { alreadyReported, newScore } = await fileScamReport({
        targetUsername,
        reporterId: from.id,
        reporterUsername: from.username,
        reporterVerified,
        reason,
        chatId: chat.id,
        evidenceMsgId
      });

      if (alreadyReported) {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `ℹ️ You've already reported <b>@${escapeHtml(targetUsername)}</b>.\n` +
            `Admins are aware and monitoring the situation.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      // Acknowledge the report (anonymous — does not say who reported)
      const reports = await getScamReports(targetUsername);
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📋 <b>Report Received</b>\n\n` +
          `👤 User: @${escapeHtml(targetUsername)}\n` +
          `📝 Reason: ${escapeHtml(reason || "Not specified")}\n` +
          `🔢 Total reports: ${reports.length}\n\n` +
          `<i>Admins have been notified. The report is anonymous. 🔒</i>`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);

      // ── DM confirmation to reporter ───────────────────────
      tgSendMessage({
        chat_id: from.id,
        text:
          `✅ <b>Your report was received</b>\n\n` +
          `You reported @${escapeHtml(targetUsername)}.\n` +
          `If confirmed as a scammer, you will be notified. Thank you for keeping the group safe! 🛡️`
      }).catch(() => {});

      // ── Strike threshold actions ──────────────────────────
      if (newScore >= BAN_STRIKE_THRESHOLD) {
        // Check if target is unverified before auto-banning
        const targetV = await verifyUsernameApi(targetUsername);
        const targetVerified = targetV?.verified === true;

        if (!targetVerified) {
          const targetUserId = await getUserIdByUsername(targetUsername);
          if (targetUserId) {
            log.warn("AUTO_BAN_TRIGGERED", { targetUsername, newScore });
            await banUser(chat.id, targetUserId);
            await addToBlacklist(targetUsername, { reason: "Auto-banned via community reports", chatId: chat.id, score: newScore });

            const banMsg = await tgSendMessage({
              chat_id: chat.id,
              text:
                `⛔ <b>User Auto-Banned</b>\n\n` +
                `@${escapeHtml(targetUsername)} has been removed from the group.\n` +
                `📊 Strike score: <b>${newScore}</b> — threshold exceeded.\n` +
                `🌐 Added to the global scammer blacklist. 🔐`
            });
            await saveBotMsgId(chat.id, banMsg?.result?.message_id);

            if (ADMIN_LOG_CHAT_ID) {
              await tgSendMessage({
                chat_id: ADMIN_LOG_CHAT_ID,
                text:
                  `⛔ <b>[AUTO-BAN]</b> @${escapeHtml(targetUsername)}\n` +
                  `Group: ${chat.title || chat.id}\n` +
                  `Score: ${newScore}\n` +
                  `Reports: ${reports.length}\n` +
                  `Use /clearreport @${escapeHtml(targetUsername)} to reverse if false positive.`
              });
            }
          } else {
            log.warn("AUTO_BAN_NO_USER_ID", { targetUsername });
          }
        }
      } else if (newScore >= MUTE_STRIKE_THRESHOLD) {
        const targetUserId = await getUserIdByUsername(targetUsername);
        if (targetUserId) {
          log.warn("AUTO_MUTE_TRIGGERED", { targetUsername, newScore });
          await muteUser(chat.id, targetUserId);

          const muteMsg = await tgSendMessage({
            chat_id: chat.id,
            text:
              `🔇 <b>User Muted Pending Review</b>\n\n` +
              `@${escapeHtml(targetUsername)} has been muted for <b>1 hour</b> while admins review reports.\n` +
              `📊 Strike score: <b>${newScore}</b>\n\n` +
              `<i>Admins: use /clearreport @${escapeHtml(targetUsername)} to dismiss if false.</i>`
          });
          await saveBotMsgId(chat.id, muteMsg?.result?.message_id);

          if (ADMIN_LOG_CHAT_ID) {
            await tgSendMessage({
              chat_id: ADMIN_LOG_CHAT_ID,
              text:
                `🔇 <b>[AUTO-MUTE]</b> @${escapeHtml(targetUsername)}\n` +
                `Group: ${chat.title || chat.id}\n` +
                `Score: ${newScore} | Reports: ${reports.length}\n` +
                `Review and use /clearreport or /confirmscam to action.`
            });
          }
        }
      }

      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (I) ADMIN COMMAND: /scamreports  ← NEW
    //   Shows top reported users (admins only)
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/scamreports(@\S+)?$/i)) {
      log.info("CMD_SCAMREPORTS", { from: from.username });

      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `🚫 This command is for admins only.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const topReported = await getTopReported(10);

      if (!topReported.length) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `📊 <b>Scam Reports</b>\n\nNo reports filed yet. ✅`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const lines = topReported.map((u, i) => {
        const status = u.confirmed ? "⛔ CONFIRMED" : `⚠️ Score: ${u.score}`;
        return `${i + 1}. @${escapeHtml(u.username)} — ${status} | ${u.reportCount} report(s)`;
      });

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📊 <b>Top Reported Users</b>\n\n` +
          lines.join("\n") +
          `\n\n<i>Use /clearreport @username to dismiss\nUse /confirmscam @username [tactics] to confirm</i>`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (J) ADMIN COMMAND: /clearreport @username  ← NEW
    //   Dismisses all reports against a user (false positive)
    // ══════════════════════════════════════════════════════════
    const clearTarget = parseClearReportCommand(message.text);
    if (clearTarget) {
      log.info("CMD_CLEARREPORT", { from: from.username, target: clearTarget });

      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `🚫 This command is for admins only.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      await removeFromBlacklist(clearTarget);

      // Unmute if they were muted
      const targetUserId = await getUserIdByUsername(clearTarget);
      if (targetUserId) {
        await tgApi("restrictChatMember", {
          chat_id: chat.id,
          user_id: targetUserId,
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true
          }
        });
      }

      log.ok("REPORT_CLEARED", { target: clearTarget, clearedBy: from.username });

      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text: `✅ <b>[CLEARED]</b> Reports against @${escapeHtml(clearTarget)} dismissed by admin @${escapeHtml(from.username || from.id)}`
        });
      }

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `✅ <b>Reports Cleared</b>\n\n` +
          `All reports against @${escapeHtml(clearTarget)} have been dismissed.\n` +
          `If they were muted, they can now speak again. 🔓`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (K) ADMIN COMMAND: /confirmscam @username [tactics]  ← NEW
    //   Admin confirms a user as a scammer → blacklist + public notice
    // ══════════════════════════════════════════════════════════
    const confirmCmd = parseConfirmScammerCommand(message.text);
    if (confirmCmd) {
      log.info("CMD_CONFIRMSCAM", { from: from.username, target: confirmCmd.username });

      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `🚫 This command is for admins only.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const { username: scammerUsername, tactics } = confirmCmd;
      await addToBlacklist(scammerUsername, {
        confirmedBy: from.username || from.id,
        tactics: tactics || "Not specified",
        chatId: chat.id
      });

      // Ban from this group
      const targetUserId = await getUserIdByUsername(scammerUsername);
      if (targetUserId) {
        await banUser(chat.id, targetUserId);
      }

      log.ok("SCAMMER_CONFIRMED", { username: scammerUsername, confirmedBy: from.username });

      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text:
            `⛔ <b>[CONFIRMED SCAMMER]</b>\n` +
            `Username: @${escapeHtml(scammerUsername)}\n` +
            `Confirmed by: @${escapeHtml(from.username || String(from.id))}\n` +
            `Tactics: ${escapeHtml(tactics || "Not specified")}\n` +
            `Date: ${new Date().toUTCString()}`
        });
      }

      // Public scammer profile card
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `⛔ <b>CONFIRMED SCAMMER</b>\n\n` +
          `👤 Username: @${escapeHtml(scammerUsername)}\n` +
          `🎭 Tactics: ${escapeHtml(tactics || "Not specified")}\n` +
          `📅 Confirmed: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}\n` +
          `🌐 Status: <b>Global blacklist — banned on entry</b>\n\n` +
          `⚠️ <i>If this person contacts you on any platform, block and ignore them.</i>`
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

    // ── End of message handling ──
    return res.status(200).send("ok");

  } catch (e) {
    log.error("UNHANDLED_EXCEPTION", { message: e.message, stack: e.stack });
    return res.status(200).send("ok");
  }
}
