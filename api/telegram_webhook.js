import { Redis } from "@upstash/redis";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "GoldenSugarAdmin";
const ADMIN_LOG_CHAT_ID = process.env.ADMIN_LOG_CHAT_ID || null;

function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return new Redis({ url, token });
  }

  console.warn("[CONFIG] Missing Upstash Redis configuration. Stateful bot features will be disabled.");
  return {
    async get() { return null; },
    async set() { return null; },
    async del() { return 0; },
    async keys() { return []; }
  };
}

const redis = createRedisClient();

function getBaseUrl(req) {
  if (PUBLIC_APP_URL) {
    return PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}` : "";
}

function getVerifyApiBase(req) {
  const baseUrl = getBaseUrl(req);
  return baseUrl ? `${baseUrl}/api/verify` : "";
}

function getVerifyLink(req) {
  const baseUrl = getBaseUrl(req);
  return baseUrl ? `${baseUrl}/verification` : "";
}

// ─── Strike / mute / ban thresholds ──────────────────────────────
const MUTE_STRIKE_THRESHOLD   = 3;
const BAN_STRIKE_THRESHOLD    = 5;
const MUTE_DURATION_SEC       = 3600;

// ─── Scheduled broadcast config ──────────────────────────────────
const SCHEDULED_CHECK_SEC     = 3600;
const SCHEDULED_MIN_MSG_GAP   = 10;

// ══════════════════════════════════════════════════════════════════
// 🚨 ILLEGAL CONTENT DETECTION — Specific phrases only
// These are kept tight so admin announcements never trigger them.
// ══════════════════════════════════════════════════════════════════
const ILLEGAL_KEYWORDS = [
  "cp link", "cp vid", "cp video", "cp photo", "cp pics",
  "child porn", "kiddie porn", "underage nude", "underage porn",
  "minor porn", "jailbait", "pedo", "csam",
  "selling cp", "buy cp", "trade cp", "cp for sale",
  "child abuse material",
];

function detectIllegalKeyword(text = "") {
  const lower = text.toLowerCase();
  for (const kw of ILLEGAL_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

/**
 * Returns true if the message is a forwarded message.
 */
function isForwardedMessage(msg) {
  return !!(
    msg.forward_from ||
    msg.forward_from_chat ||
    msg.forward_origin ||
    msg.forward_date ||
    msg.forward_sender_name
  );
}

// ══════════════════════════════════════════════════════════════════
// ⭐ REPUTATION SYSTEM CONFIG
// ══════════════════════════════════════════════════════════════════
const REP_TIERS = [
  { min: 0,   label: "New Member",       emoji: "🆕" },
  { min: 10,  label: "Regular",          emoji: "👤" },
  { min: 25,  label: "Trusted Member",   emoji: "🌟" },
  { min: 50,  label: "Community Helper", emoji: "🛡️" },
  { min: 100, label: "Senior Helper",    emoji: "👑" },
  { min: 200, label: "Elite Guardian",   emoji: "💎" },
];

const REP_GAINS = {
  VERIFIED_JOIN:   2,
  GOT_VERIFIED:    5,
  ACCURATE_REPORT: 10,
  DAILY_ACTIVE:    1,
  HELPFUL_REPLY:   3,
};

function getRepTier(score) {
  let tier = REP_TIERS[0];
  for (const t of REP_TIERS) {
    if (score >= t.min) tier = t;
  }
  return tier;
}

function getNextTier(score) {
  for (const t of REP_TIERS) {
    if (t.min > score) return t;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// ROTATING BROADCAST MESSAGES
// ══════════════════════════════════════════════════════════════════
const SCHEDULED_MESSAGES = [
  {
    text:
      `📊 *Did you know?*\n\n` +
      `90% of unverified Sugar Daddies & Sugar Babies are *fake or scammers*.\n\n` +
      `Stay safe — only connect with verified members! 🛡️`,
    button: "✅ Verify Now (FREE)"
  },
  {
    text:
      `🚨 *Scam Alert*\n\n` +
      `If anyone asks you for *money, vouchers, or gift cards* before being your Sugar Daddy — that's a classic scam. 🚫\n\n` +
      `_You're here to earn, not to pay._ Report them immediately using /report @username.`,
    button: null
  },
  {
    text:
      `💡 *Pro Tip*\n\n` +
      `Real Sugar Daddies are *quiet and private* — they don't chase you in chats.\n\n` +
      `For genuine connections, reach out to *${formatUsername(ADMIN_USERNAME)}* instead of DMing strangers. 💬`,
    button: null
  },
  {
    text:
      `🏆 *Why this group?*\n\n` +
      `This is the *only verified Sugar group* on Telegram.\n\n` +
      `✔️ Passport verified\n` +
      `✔️ Financial statement checked\n` +
      `✔️ Affordability confirmed\n` +
      `✔️ Advance payment secured on deal\n\n` +
      `Verified members *cannot lie* — we hold them accountable. 🔐`,
    button: "🔗 Get Verified"
  },
  {
    text:
      `⏳ *This group is going verified-only soon!*\n\n` +
      `Unverified members will be removed once the cutoff hits.\n` +
      `Verification is *completely FREE* for all Sugar Babies. 💸\n\n` +
      `Don't wait — secure your spot now! 🎯`,
    button: "✅ Verify for Free"
  },
  {
    text:
      `⭐ *Community Reputation System*\n\n` +
      `Active, helpful members earn *reputation points*!\n\n` +
      `🆕 New → 👤 Regular → 🌟 Trusted → 🛡️ Helper → 👑 Senior → 💎 Elite\n\n` +
      `Check your rank: /rep\n` +
      `Top members may be promoted to *moderators*! 🎖️`,
    button: null
  }
];

// ══════════════════════════════════════════════════════════════════
// LOGGER
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

function previewText(text = "", max = 160) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function buildMessageState(update, message) {
  const chat = message?.chat || {};
  const from = message?.from || {};
  const text = message?.text || message?.caption || "";
  const commandMatch = text.match(/^\/([a-zA-Z0-9_]+)(?:@\S+)?/);

  return {
    update_id: update?.update_id || null,
    message_id: message?.message_id || null,
    chat_id: chat?.id || null,
    chat_type: chat?.type || null,
    chat_title: chat?.title || null,
    from_id: from?.id || null,
    from_username: from?.username || null,
    from_is_bot: !!from?.is_bot,
    has_text: !!message?.text,
    has_caption: !!message?.caption,
    text_preview: previewText(text),
    command: commandMatch ? commandMatch[1].toLowerCase() : null,
    is_forwarded: isForwardedMessage(message),
    is_reply: !!message?.reply_to_message,
    new_chat_members_count: message?.new_chat_members?.length || 0,
    left_chat_member: !!message?.left_chat_member,
    has_photo: !!message?.photo?.length,
    has_document: !!message?.document,
    has_video: !!message?.video,
    has_sticker: !!message?.sticker
  };
}

// ─── Helpers ──────────────────────────────────────────────────────
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeMarkdown(s = "") {
  return String(s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function formatUsername(username) {
  return `@${escapeMarkdown(username || "")}`;
}

function mentionUser(user) {
  if (user?.username) return formatUsername(user.username);
  const name = escapeMarkdown(user?.first_name || "User");
  return `[${name}](tg://user?id=${user.id})`;
}

export function formatForwardedMessageWarning(user) {
  return (
    `⚠️ ${mentionUser(user)} Forwarded messages are not allowed in this group.\n` +
    `_Please share content directly — no forwards. 🚫_`
  );
}

function verifyButton(req, label = "Verify Now") {
  const verifyLink = getVerifyLink(req);
  if (!verifyLink) return undefined;
  return { inline_keyboard: [[{ text: label, url: verifyLink }]] };
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
  if (json?.ok) log.ok(`TG_RESPONSE ← ${method}`, json);
  else log.error(`TG_RESPONSE ← ${method}`, json);
  return json;
}

export function shouldRetryWithoutParseMode(response) {
  return (
    response?.ok === false &&
    response?.error_code === 400 &&
    /can't parse entities/i.test(String(response?.description || ""))
  );
}

async function tgSendMessage({ chat_id, text, reply_to_message_id, parse_mode = "Markdown", reply_markup }) {
  const payload = {
    chat_id, text, parse_mode,
    disable_web_page_preview: true,
    ...(reply_to_message_id ? { reply_to_message_id } : {}),
    ...(reply_markup ? { reply_markup } : {})
  };

  const result = await tgApi("sendMessage", payload);
  if (!shouldRetryWithoutParseMode(result) || !parse_mode) return result;

  log.warn("TG_SENDMESSAGE_MARKDOWN_RETRY", {
    chat_id,
    parse_mode,
    reply_to_message_id: reply_to_message_id || null
  });

  const fallbackPayload = { ...payload };
  delete fallbackPayload.parse_mode;
  return tgApi("sendMessage", fallbackPayload);
}

async function tgDeleteMessage(chat_id, message_id) {
  log.info("DELETE_MESSAGE", { chat_id, message_id });
  return tgApi("deleteMessage", { chat_id, message_id });
}

// ─── Verify API ───────────────────────────────────────────────────
async function verifyUsernameApi(username, req) {
  const verifyApiBase = getVerifyApiBase(req);
  if (!verifyApiBase) {
    log.error("VERIFY_API_UNAVAILABLE", { username });
    return {};
  }

  const url = `${verifyApiBase}?username=${encodeURIComponent(username)}`;
  try {
    const r = await fetch(url, { method: "GET" });
    return await r.json();
  } catch (e) {
    log.error("VERIFY_API_FAILED", { username, error: e.message });
    return {};
  }
}

// ─── Redis helpers ────────────────────────────────────────────────
async function storeUserId(username, userId) {
  if (!username || !userId) return;
  try {
    await redis.set(`uid:${username.toLowerCase()}`, String(userId), { ex: 60 * 60 * 24 * 30 });
  } catch {}
}

async function getUserIdByUsername(username) {
  try {
    const val = await redis.get(`uid:${username.toLowerCase()}`);
    return val ? parseInt(val, 10) : null;
  } catch { return null; }
}

async function saveBotMsgId(chatId, messageId) {
  if (!messageId) return;
  try { await redis.set(`lastbotmsg:${chatId}`, messageId); } catch {}
}

async function getLastBotMsgId(chatId) {
  try {
    const v = await redis.get(`lastbotmsg:${chatId}`);
    return v ? parseInt(v, 10) : null;
  } catch { return null; }
}

async function isGroupAdmin(chatId, userId) {
  const res = await tgApi("getChatMember", { chat_id: chatId, user_id: userId });
  return ["administrator", "creator"].includes(res?.result?.status);
}

async function assignVerifiedTitle(chatId, userId, role) {
  const promoteRes = await tgApi("promoteChatMember", {
    chat_id: chatId, user_id: userId,
    is_anonymous: false, can_manage_chat: false, can_change_info: false,
    can_delete_messages: false, can_invite_users: false, can_restrict_members: false,
    can_pin_messages: false, can_promote_members: false, can_manage_video_chats: false
  });
  if (!promoteRes?.ok) return { ok: false, description: promoteRes?.description };
  await new Promise(r => setTimeout(r, 1500));
  const titleMap = { sugarbaby: "Verified SugarBaby", sugardaddy: "Verified SugarDaddy" };
  return tgApi("setChatAdministratorCustomTitle", {
    chat_id: chatId, user_id: userId, custom_title: titleMap[role] || "Verified Member"
  });
}

// ── Restrict user (mute with custom duration) ─────────────────────
async function restrictUser(chatId, userId, durationSec) {
  const untilDate = Math.floor(Date.now() / 1000) + durationSec;
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

async function muteUser(chatId, userId, durationSec = MUTE_DURATION_SEC) {
  return restrictUser(chatId, userId, durationSec);
}

async function banUser(chatId, userId) {
  return tgApi("banChatMember", { chat_id: chatId, user_id: userId });
}

async function forwardEvidence(fromChatId, messageId) {
  if (!ADMIN_LOG_CHAT_ID) return null;
  return tgApi("forwardMessage", { chat_id: ADMIN_LOG_CHAT_ID, from_chat_id: fromChatId, message_id: messageId });
}

// ══════════════════════════════════════════════════════════════════
// SCAM REPORTING SYSTEM
// ══════════════════════════════════════════════════════════════════
async function getScamReports(username) {
  try {
    const raw = await redis.get(`scam:reports:${username.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveScamReports(username, reports) {
  try {
    await redis.set(`scam:reports:${username.toLowerCase()}`, JSON.stringify(reports), { ex: 60 * 60 * 24 * 90 });
  } catch {}
}

async function getStrikeScore(username) {
  try {
    const v = await redis.get(`scam:strikes:${username.toLowerCase()}`);
    if (!v) return 0;
    return parseFloat(String(v).split(":")[0]);
  } catch { return 0; }
}

async function getStrikeData(username) {
  try {
    const v = await redis.get(`scam:strikes:${username.toLowerCase()}`);
    if (!v) return { score: 0, count: 0 };
    const parts = String(v).split(":");
    return { score: parseFloat(parts[0]), count: parseInt(parts[1] || "0", 10) };
  } catch { return { score: 0, count: 0 }; }
}

async function setStrikeScore(username, score, count = 0) {
  try {
    await redis.set(`scam:strikes:${username.toLowerCase()}`, `${score}:${count}`, { ex: 60 * 60 * 24 * 90 });
  } catch {}
}

async function isBlacklisted(username) {
  try { return !!(await redis.get(`scam:blacklist:${username.toLowerCase()}`)); }
  catch { return false; }
}

async function addToBlacklist(username, details = {}) {
  try {
    await redis.set(`scam:blacklist:${username.toLowerCase()}`, "1");
    await redis.set(`scam:confirmed:${username.toLowerCase()}`, JSON.stringify({ username, ...details, confirmedAt: Date.now() }));
  } catch {}
}

async function removeFromBlacklist(username) {
  try {
    await redis.del(`scam:blacklist:${username.toLowerCase()}`);
    await redis.del(`scam:confirmed:${username.toLowerCase()}`);
    await redis.del(`scam:reports:${username.toLowerCase()}`);
    await redis.del(`scam:strikes:${username.toLowerCase()}`);
  } catch {}
}

async function setFeedbackPending(userId, meta = {}) {
  try {
    await redis.set(`feedback:pending:${userId}`, JSON.stringify({ ...meta, askedAt: Date.now() }), { ex: 60 * 60 * 48 });
  } catch {}
}

async function getFeedbackPending(userId) {
  try {
    const raw = await redis.get(`feedback:pending:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function clearFeedbackPending(userId) {
  try { await redis.del(`feedback:pending:${userId}`); } catch {}
}

async function getTopReported(limit = 10) {
  try {
    const keys = await redis.keys("scam:strikes:*");
    const results = [];
    for (const key of keys) {
      const username = key.replace("scam:strikes:", "");
      const { score, count } = await getStrikeData(username);
      const confirmed = !!(await redis.get(`scam:blacklist:${username}`));
      results.push({ username, score, reportCount: count, confirmed });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch { return []; }
}

async function fileScamReport({ targetUsername, reporterId, reporterUsername, reporterVerified, reason, chatId, evidenceMsgId }) {
  const reports = await getScamReports(targetUsername);
  const alreadyReported = reports.some(r => r.reporterId === reporterId);
  if (alreadyReported) return { alreadyReported: true, newScore: await getStrikeScore(targetUsername) };

  const weight = reporterVerified ? 2 : 1;
  reports.push({
    reporterId, reporterUsername: reporterUsername || null, reporterVerified, weight,
    reason: reason || "No reason given", chatId, evidenceMsgId: evidenceMsgId || null, ts: Date.now()
  });
  await saveScamReports(targetUsername, reports);

  const newScore = (await getStrikeScore(targetUsername)) + weight;
  await setStrikeScore(targetUsername, newScore, reports.length);

  if (reporterId) await storeReporterForTarget(targetUsername, reporterId);

  if (evidenceMsgId && ADMIN_LOG_CHAT_ID) {
    await tgSendMessage({
      chat_id: ADMIN_LOG_CHAT_ID,
      text:
        `🚨 *Report Evidence*\n` +
        `👤 Reported: ${formatUsername(targetUsername)}\n` +
        `📋 Reason: ${escapeMarkdown(reason || "None")}\n` +
        `⚖️ Reporter: ${formatUsername(reporterUsername || "unknown")} (${reporterVerified ? "✅ Verified" : "⚠️ Unverified"})\n` +
        `📊 New strike score: ${newScore}`
    });
    await forwardEvidence(chatId, evidenceMsgId);
  }

  return { alreadyReported: false, newScore };
}

// ══════════════════════════════════════════════════════════════════
// ⭐ REPUTATION HELPERS
// ══════════════════════════════════════════════════════════════════
async function getRepScore(userId) {
  try {
    const v = await redis.get(`rep:score:${userId}`);
    return v ? parseInt(v, 10) : 0;
  } catch { return 0; }
}

async function addRepScore(userId, delta, reason) {
  try {
    const current = await getRepScore(userId);
    const newScore = Math.max(0, current + delta);
    await redis.set(`rep:score:${userId}`, newScore);
    const raw = await redis.get(`rep:history:${userId}`);
    const history = raw ? JSON.parse(raw) : [];
    history.push({ reason, delta, ts: Date.now() });
    if (history.length > 50) history.splice(0, history.length - 50);
    await redis.set(`rep:history:${userId}`, JSON.stringify(history), { ex: 60 * 60 * 24 * 90 });
    return {
      newScore, oldScore: current,
      tierChanged: getRepTier(current).label !== getRepTier(newScore).label,
      newTier: getRepTier(newScore)
    };
  } catch { return { newScore: 0, oldScore: 0, tierChanged: false, newTier: REP_TIERS[0] }; }
}

async function getRepHistory(userId) {
  try {
    const raw = await redis.get(`rep:history:${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function isDailyRepClaimed(userId) {
  try { return !!(await redis.get(`rep:daily:${userId}`)); }
  catch { return false; }
}

async function claimDailyRep(userId) {
  try {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const ttl = Math.floor((midnight - now) / 1000);
    await redis.set(`rep:daily:${userId}`, "1", { ex: ttl });
  } catch {}
}

async function storeReporterForTarget(targetUsername, reporterId) {
  try {
    const key = `rep:reporters:${targetUsername.toLowerCase()}`;
    const raw = await redis.get(key);
    const reporters = raw ? JSON.parse(raw) : [];
    if (!reporters.includes(reporterId)) {
      reporters.push(reporterId);
      await redis.set(key, JSON.stringify(reporters), { ex: 60 * 60 * 24 * 90 });
    }
  } catch {}
}

async function getReportersForTarget(targetUsername) {
  try {
    const raw = await redis.get(`rep:reporters:${targetUsername.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function getTopRepUsers(limit = 10) {
  try {
    const keys = await redis.keys("rep:score:*");
    const results = [];
    for (const key of keys) {
      const userId = key.replace("rep:score:", "");
      const score  = parseInt((await redis.get(key)) || "0", 10);
      const uname  = await redis.get(`repname:${userId}`);
      results.push({ userId, score, username: uname || null });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch { return []; }
}

async function storeRepName(userId, username) {
  if (!userId || !username) return;
  try { await redis.set(`repname:${userId}`, username, { ex: 60 * 60 * 24 * 30 }); } catch {}
}

// ══════════════════════════════════════════════════════════════════
// COMMAND PARSERS
// ══════════════════════════════════════════════════════════════════
function parseAdminVerifyCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^(?:\/verify(?:@\S+)?|verify)\s+@?([a-zA-Z0-9_]{4,32})\s+(sugarbaby|sugardaddy)\s*$/i);
  return m ? { username: m[1], role: m[2].toLowerCase() } : null;
}

function parsePublicVerifyCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^(?:\/verify(?:@\S+)?|verify)\s+@?([a-zA-Z0-9_]{4,32})\s*$/i);
  return m ? m[1] : null;
}

function parseReportCommand(text) {
  if (!text) return null;
  const prefix = text.trim().match(/^\/report(?:@\S+)?/i);
  if (!prefix) return null;
  const rest = text.trim().slice(prefix[0].length).trim();
  const withUser = rest.match(/^@?([a-zA-Z0-9_]{4,32})(?:\s+(.+))?$/is);
  if (withUser && rest.startsWith("@")) return { targetUsername: withUser[1], reason: withUser[2]?.trim() || null };
  return { targetUsername: null, reason: rest || null };
}

function parseClearReportCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/clearreport(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})\s*$/i);
  return m ? m[1] : null;
}

function parseConfirmScammerCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/confirmscam(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})(?:\s+(.+))?$/i);
  return m ? { username: m[1], tactics: m[2]?.trim() || null } : null;
}

function parseGiveRepCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/giverep(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})(?:\s+(\d+))?(?:\s+(.+))?$/i);
  if (!m) return null;
  return { username: m[1], points: m[2] ? parseInt(m[2], 10) : REP_GAINS.HELPFUL_REPLY, reason: m[3]?.trim() || "Awarded by admin" };
}

function parseTakeRepCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/takerep(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})(?:\s+(\d+))?(?:\s+(.+))?$/i);
  if (!m) return null;
  return { username: m[1], points: m[2] ? parseInt(m[2], 10) : 5, reason: m[3]?.trim() || "Penalised by admin" };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method !== "POST") {
    log.warn("WEBHOOK_REJECTED_METHOD", { method: req.method });
    return res.status(405).send("Method Not Allowed");
  }
  if (!BOT_TOKEN) {
    log.error("WEBHOOK_CONFIG_ERROR", { missing: "TELEGRAM_BOT_TOKEN" });
    return res.status(500).send("Missing TELEGRAM_BOT_TOKEN");
  }
  if (!TELEGRAM_WEBHOOK_SECRET) {
    log.error("WEBHOOK_CONFIG_ERROR", { missing: "TELEGRAM_WEBHOOK_SECRET" });
    return res.status(500).send("Missing TELEGRAM_WEBHOOK_SECRET");
  }
  if (req.headers["x-telegram-bot-api-secret-token"] !== TELEGRAM_WEBHOOK_SECRET) {
    log.warn("WEBHOOK_UNAUTHORIZED", {
      provided_secret: req.headers["x-telegram-bot-api-secret-token"] ? "present" : "missing"
    });
    return res.status(401).send("Unauthorized");
  }

  try {
    const update = req.body || {};
    log.info("WEBHOOK_RECEIVED", { update_id: update.update_id });

    const message = update.message || update.edited_message;
    if (!message) {
      log.skip("WEBHOOK_NO_MESSAGE", {
        update_id: update.update_id,
        has_callback_query: !!update.callback_query,
        has_channel_post: !!update.channel_post
      });
      return res.status(200).send("ok");
    }

    const chat = message.chat;
    const from = message.from;
    const messageState = buildMessageState(update, message);
    const finishOk = (tag, extra = {}) => {
      log.ok(tag, { ...messageState, ...extra });
      return res.status(200).send("ok");
    };
    const logBranch = (tag, extra = {}) => log.info(tag, { ...messageState, ...extra });

    log.info("MESSAGE_STATE", messageState);

    if (!chat) return finishOk("SKIP_NO_CHAT");
    if (from?.is_bot) return finishOk("SKIP_BOT_SENDER");

    // ══════════════════════════════════════════════════════════
    // (PRIVATE) DEPARTURE FEEDBACK
    // ══════════════════════════════════════════════════════════
    if (chat.type === "private" && from?.id && message.text) {
      logBranch("BRANCH_PRIVATE_MESSAGE");
      const pending = await getFeedbackPending(from.id);
      if (pending) {
        logBranch("PRIVATE_FEEDBACK_PENDING_FOUND", {
          pending_chat_id: pending.chatId || null,
          pending_chat_title: pending.chatTitle || null
        });
        await clearFeedbackPending(from.id);
        const firstName = from.first_name || "";
        await tgSendMessage({
          chat_id: from.id,
          text: `💛 Thank you for your feedback, ${firstName}!\n\nOur team will review it. We hope to see you back someday! 🙏`
        });
        if (ADMIN_LOG_CHAT_ID) {
          const lastName = from.last_name || "";
          const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
          await tgSendMessage({
            chat_id: ADMIN_LOG_CHAT_ID,
            text:
              `📩 *Departure Feedback*\n\n` +
              `👤 Name: ${displayName}\n` +
              `🔗 Username: ${from.username ? formatUsername(from.username) : "(none)"}\n` +
              `🪪 User ID: ${from.id}\n` +
              `🏘️ Left: ${pending.chatTitle || "Unknown"}\n\n` +
              `💬 *Reason:*\n${message.text}`
          });
        }
        return finishOk("PRIVATE_FEEDBACK_CAPTURED");
      }
      return finishOk("PRIVATE_MESSAGE_NO_PENDING_FEEDBACK");
    }

    if (chat.type !== "group" && chat.type !== "supergroup") {
      return finishOk("SKIP_UNSUPPORTED_CHAT_TYPE");
    }

    const currentMsgId = message.message_id;

    // Cache user IDs + rep names
    if (from?.username && from?.id) {
      await storeUserId(from.username, from.id);
      await storeRepName(from.id, from.username);
      logBranch("USER_CACHE_UPDATED");
    }

    // ══════════════════════════════════════════════════════════
    // 🚨 SECURITY LAYER 1: ILLEGAL CONTENT — RESTRICT + WARN
    // Soft action: delete message, restrict for 24h, notify group.
    // Does NOT ban. Admins review and decide next steps.
    // ══════════════════════════════════════════════════════════
    const msgText = message.text || message.caption || "";
    const illegalKw = detectIllegalKeyword(msgText);
    logBranch("SECURITY_SCAN_COMPLETE", { illegal_keyword: illegalKw || null });

    if (illegalKw) {
      log.warn("ILLEGAL_KEYWORD_DETECTED", {
        from_id: from.id, from_username: from.username, keyword: illegalKw
      });

      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      logBranch("ILLEGAL_KEYWORD_ADMIN_CHECK", { sender_is_admin: senderIsAdmin, keyword: illegalKw });
      if (!senderIsAdmin) {
        // 1. Delete the message
        await tgDeleteMessage(chat.id, message.message_id);

        // 2. Restrict for 24 hours (cannot send any messages)
        await restrictUser(chat.id, from.id, 60 * 60 * 24);

        // 3. Public notice — shows who was restricted and what triggered it
        const mention = from.username
          ? formatUsername(from.username)
          : `[${from.first_name || "User"}](tg://user?id=${from.id})`;

        await tgSendMessage({
          chat_id: chat.id,
          text:
            `⚠️ *User Restricted*\n\n` +
            `${mention} has been restricted from sending messages for *24 hours*.\n\n` +
            `🔑 Triggered by: \`${illegalKw}\`\n\n` +
            `_Admins have been notified and will review. If this was a mistake, contact an admin._`
        });

        // 4. Alert admin log with full context
        if (ADMIN_LOG_CHAT_ID) {
          await tgSendMessage({
            chat_id: ADMIN_LOG_CHAT_ID,
            text:
              `⚠️ *[ILLEGAL KEYWORD — RESTRICTED]*\n\n` +
              `👤 User: ${mention}\n` +
              `🪪 ID: ${from.id}\n` +
              `🔑 Trigger: \`${illegalKw}\`\n` +
              `💬 Message: \`${msgText.slice(0, 300)}\`\n` +
              `🏘️ Group: ${chat.title || String(chat.id)}\n` +
              `📅 ${new Date().toUTCString()}\n\n` +
              `_Use /confirmscam @username to permanently ban, or /clearreport @username to lift restriction._`
          });
        }

        return finishOk("ILLEGAL_KEYWORD_ACTIONED", { keyword: illegalKw });
      }
      logBranch("ILLEGAL_KEYWORD_ADMIN_EXEMPT", { keyword: illegalKw });
    }

    // ══════════════════════════════════════════════════════════
    // 🚫 SECURITY LAYER 2: FORWARDED MESSAGE AUTO-DELETE
    // Admins are exempt.
    // ══════════════════════════════════════════════════════════
    if (isForwardedMessage(message)) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      logBranch("FORWARDED_MESSAGE_CHECK", { sender_is_admin: senderIsAdmin });
      if (!senderIsAdmin) {
        log.warn("FORWARDED_MSG_DELETED", { from_id: from.id, msg_id: message.message_id });
        await tgDeleteMessage(chat.id, message.message_id);

        const warning = await tgSendMessage({
          chat_id: chat.id,
          text: formatForwardedMessageWarning(from)
        });

        if (warning?.result?.message_id) {
          setTimeout(() => {
            tgDeleteMessage(chat.id, warning.result.message_id).catch(() => {});
          }, 8000);
        }

        return finishOk("FORWARDED_MESSAGE_ACTIONED", {
          warning_message_id: warning?.result?.message_id || null
        });
      }
      logBranch("FORWARDED_MESSAGE_ADMIN_EXEMPT");
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ REPUTATION: Daily Active Bonus
    // ══════════════════════════════════════════════════════════
    if (from?.id && !(await isDailyRepClaimed(from.id))) {
      logBranch("DAILY_REP_AWARDED");
      await claimDailyRep(from.id);
      const result = await addRepScore(from.id, REP_GAINS.DAILY_ACTIVE, "Daily activity");
      if (result.tierChanged) {
        const m = from.username
          ? formatUsername(from.username)
          : `[${from.first_name || "Member"}](tg://user?id=${from.id})`;
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `${result.newTier.emoji} *Reputation Tier Up!*\n\n` +
            `Congratulations ${m}! You've reached *${result.newTier.label}* 🎉\n` +
            `Current score: *${result.newScore} pts*\n\n` +
            `_Keep being helpful to climb higher! 🚀_`
        });
        logBranch("DAILY_REP_TIER_UP", { new_score: result.newScore, new_tier: result.newTier?.label || null });
      }
    } else if (from?.id) {
      logBranch("DAILY_REP_ALREADY_CLAIMED");
    }

    // ══════════════════════════════════════════════════════════
    // (A) WELCOME — new members
    // ══════════════════════════════════════════════════════════
    if (message.new_chat_members?.length) {
      logBranch("BRANCH_NEW_CHAT_MEMBERS");
      for (const member of message.new_chat_members) {
        logBranch("NEW_MEMBER_PROCESSING", {
          member_id: member.id,
          member_username: member.username || null,
          member_is_bot: !!member.is_bot
        });
        if (member.is_bot) continue;
        if (member.username && member.id) {
          await storeUserId(member.username, member.id);
          await storeRepName(member.id, member.username);
        }

        const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || "there";
        const m = member.username
          ? formatUsername(member.username)
          : `[${fullName}](tg://user?id=${member.id})`;

        // Blacklist check
        if (member.username && await isBlacklisted(member.username)) {
          log.warn("NEW_MEMBER_BLACKLISTED", { member_id: member.id, member_username: member.username });
          await banUser(chat.id, member.id);
          await tgSendMessage({
            chat_id: chat.id,
            text: `🚫 *Banned on Entry*\n\n${m} is on the global scammer blacklist and has been automatically removed. 🔐`
          });
          continue;
        }

        let isVerified = false;
        if (member.username) {
          const v = await verifyUsernameApi(member.username, req);
          isVerified = v?.verified === true;
        }

        if (isVerified) {
          logBranch("NEW_MEMBER_VERIFIED", { member_id: member.id, member_username: member.username || null });
          await addRepScore(member.id, REP_GAINS.VERIFIED_JOIN, "Joined as verified member");
          const r = await tgSendMessage({
            chat_id: chat.id,
            text:
              `👑 Welcome ${m}! You're already *verified* — enjoy the group! ✅\n` +
              `⭐ *+${REP_GAINS.VERIFIED_JOIN} reputation* awarded for joining verified.`
          });
          await saveBotMsgId(chat.id, r?.result?.message_id);
        } else {
          logBranch("NEW_MEMBER_UNVERIFIED", { member_id: member.id, member_username: member.username || null });
          const noUsernameNote = !member.username
            ? `\n\n_💡 Tip: Set a Telegram username in settings so others can verify you._` : "";
          const r = await tgSendMessage({
            chat_id: chat.id,
            text:
              `👋 Welcome, ${m}!\n\n` +
              `This is a *verified-only* group 🛡️\n` +
              `Please verify yourself to stay — it's *FREE* for all Sugar Babies! 💸\n\n` +
              `⚠️ _Anyone asking for money or vouchers first is a scammer._` +
              noUsernameNote,
            reply_markup: verifyButton(req, "🔗 Tap to Verify (FREE)")
          });
          await saveBotMsgId(chat.id, r?.result?.message_id);
        tgSendMessage({
            chat_id: member.id,
            text: `Hi ${member.first_name || ""} 👋\n\nVerify to stay in the group — completely *FREE*! 🎉`,
            reply_markup: verifyButton(req, "✅ Verify Me Now")
          }).catch(() => {});
        }
      }
      return finishOk("NEW_MEMBER_BRANCH_COMPLETE");
    }

    // ══════════════════════════════════════════════════════════
    // (A2) DEPARTURE
    // ══════════════════════════════════════════════════════════
    if (message.left_chat_member) {
      const leaver = message.left_chat_member;
      logBranch("BRANCH_MEMBER_LEFT", {
        leaver_id: leaver.id,
        leaver_username: leaver.username || null,
        leaver_is_bot: !!leaver.is_bot
      });
      if (leaver.is_bot) return finishOk("LEFT_MEMBER_BOT_SKIPPED");

      const fullName  = [leaver.first_name, leaver.last_name].filter(Boolean).join(" ").trim() || "there";
      const firstName = leaver.first_name || fullName;
      const chatTitle = chat.title || "the group";

      tgSendMessage({
        chat_id: leaver.id,
        text:
          `Hey ${firstName} 👋\n\nI noticed you left *${chatTitle}*. We're sorry to see you go! 😔\n\n` +
          `Would you mind sharing why you left? Your feedback helps us improve.\n\n` +
          `Just reply to this message — it goes straight to the admin team. 💬\n\n` +
          `_(You have 48 hours to reply. Completely private.)_`
      }).then(async dmResult => {
        if (dmResult?.ok) {
          await setFeedbackPending(leaver.id, {
            chatId: chat.id, chatTitle: chat.title || "", leftAt: Date.now(),
            username: leaver.username || null, name: fullName
          });
        }
      }).catch(() => {});

      return finishOk("LEFT_MEMBER_FEEDBACK_REQUESTED");
    }

    // ══════════════════════════════════════════════════════════
    // (B) ADMIN CMD: /verify @username sugarbaby|sugardaddy
    // ══════════════════════════════════════════════════════════
    const adminCmd = parseAdminVerifyCommand(message.text);
    if (adminCmd) {
      logBranch("COMMAND_ADMIN_VERIFY", adminCmd);
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only group admins can assign verification tags.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_ADMIN_VERIFY_REJECTED_NON_ADMIN", adminCmd);
      }
      const { username, role } = adminCmd;
      const targetUserId = await getUserIdByUsername(username);
      if (!targetUserId) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⚠️ *User not found in cache*\n\n${formatUsername(username)} hasn't sent a message here yet.\nAsk them to send one message, then retry.`,
          reply_to_message_id: message.message_id
        });
        return finishOk("COMMAND_ADMIN_VERIFY_TARGET_NOT_FOUND", adminCmd);
      }
      const result = await assignVerifiedTitle(chat.id, targetUserId, role);
      if (result?.ok) {
        const emoji = role === "sugardaddy" ? "💎" : "🌸";
        const label = role === "sugardaddy" ? "Verified SugarDaddy" : "Verified SugarBaby";
        await addRepScore(targetUserId, REP_GAINS.GOT_VERIFIED, "Completed verification");
        const r = await tgSendMessage({
          chat_id: chat.id,
          text:
            `${emoji} *Verification Tag Assigned!*\n\n` +
            `👤 ${formatUsername(username)}\n` +
            `🏷️ Title: *${label}*\n` +
            `⭐ +${REP_GAINS.GOT_VERIFIED} reputation awarded ✅`,
          reply_to_message_id: message.message_id
        });
        await saveBotMsgId(chat.id, r?.result?.message_id);
      } else {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `❌ *Could not assign title*\n\n` +
            `Make sure:\n• The bot has Admin rights\n• ${formatUsername(username)} is still in the group\n• Bot rank is higher than the target\n\n` +
            `_Error: ${result?.description || "Unknown"}_`,
          reply_to_message_id: message.message_id
        });
      }
      return finishOk("COMMAND_ADMIN_VERIFY_COMPLETE", {
        ...adminCmd,
        target_user_id: targetUserId,
        assign_ok: !!result?.ok
      });
    }

    // ══════════════════════════════════════════════════════════
    // (C) PUBLIC LOOKUP: /verify @username
    // ══════════════════════════════════════════════════════════
    const verifyTarget = parsePublicVerifyCommand(message.text);
    if (verifyTarget) {
      logBranch("COMMAND_PUBLIC_VERIFY", { verify_target: verifyTarget });
      const v = await verifyUsernameApi(verifyTarget, req);
      let reply, markup;
      if (v?.verified) {
        reply =
          `✅ *Verified Member*\n\n` +
          `👤 ${formatUsername(verifyTarget)}\n` +
          `📛 Name: ${v?.name || verifyTarget}\n` +
          `🪪 ID: ${v?.public_id || "N/A"}\n` +
          `🎭 Role: ${v?.role || "N/A"}\n` +
          `🏅 Badge: ${v?.badge || "✨"}`;
      } else {
        const blacklisted = await isBlacklisted(verifyTarget);
        if (blacklisted) {
          reply = `🚫 *CONFIRMED SCAMMER* — ${formatUsername(verifyTarget)}\n\n⛔ On the global blacklist. Do NOT engage. Block immediately.`;
        } else {
          const score = await getStrikeScore(verifyTarget);
          const reports = await getScamReports(verifyTarget);
          reply =
            `❌ *Not Verified* — ${formatUsername(verifyTarget)}\n\n⚠️ Proceed with caution.` +
            (score > 0 ? `\n\n📊 *Report Score:* ${score} pts from ${reports.length} report(s)` : "");
          markup = verifyButton(req, "🔗 Verify This Profile");
        }
      }
      const r = await tgSendMessage({ chat_id: chat.id, text: reply, reply_to_message_id: message.message_id, reply_markup: markup });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_PUBLIC_VERIFY_COMPLETE", {
        verify_target: verifyTarget,
        verified: !!v?.verified
      });
    }

    // ══════════════════════════════════════════════════════════
    // (D) /scam
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/scam(@\S+)?$/i)) {
      logBranch("COMMAND_SCAM");
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `🚨 *Scam Warning*\n\n` +
          `*Never* send money, gift cards, or vouchers to anyone here.\n\n` +
          `Real Sugar Daddies *give* — they never ask you to pay first.\n\n` +
          `📣 Report: reply to their message and type /report [reason]\n` +
          `Or: /report @username [reason]\n\nBlock & report immediately. 🚫`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_SCAM_COMPLETE");
    }

    // ══════════════════════════════════════════════════════════
    // (E) /rules
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/rules(@\S+)?$/i)) {
      logBranch("COMMAND_RULES");
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📋 *Group Rules*\n\n` +
          `1️⃣ Verified members only — get verified to stay\n` +
          `2️⃣ No asking for money, vouchers, or advance payments\n` +
          `3️⃣ No spam, self-promotion, or links\n` +
          `4️⃣ *No forwarded messages* — posts only, no forwards 🚫\n` +
          `5️⃣ Zero tolerance for illegal or harmful content 🔨\n` +
          `6️⃣ Respect all members\n` +
          `7️⃣ For genuine SD connections → ${formatUsername(ADMIN_USERNAME)}\n` +
          `8️⃣ Report scammers: /report @username [reason]\n\n` +
          `_Breaking rules = restriction or ban. No appeals. 🔒_`,
        reply_to_message_id: message.message_id,
        reply_markup: verifyButton(req, "✅ Verify Now (FREE)")
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_RULES_COMPLETE");
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /rep [optional @username]
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/rep(?:@\S+)?(?:\s+@?[a-zA-Z0-9_]+)?$/i)) {
      logBranch("COMMAND_REP");
      const repMatch = message.text.trim().match(/^\/rep(?:@\S+)?(?:\s+@?([a-zA-Z0-9_]{4,32}))?$/i);
      const lookupUsername = repMatch?.[1] || from.username;
      const lookupUserId   = repMatch?.[1] ? await getUserIdByUsername(repMatch[1]) : from.id;

      if (!lookupUserId) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⚠️ ${formatUsername(repMatch?.[1] || "?")} not found in cache. Ask them to send a message first.`,
          reply_to_message_id: message.message_id
        });
        return finishOk("COMMAND_REP_TARGET_NOT_FOUND", { lookup_username: repMatch?.[1] || null });
      }

      const score    = await getRepScore(lookupUserId);
      const tier     = getRepTier(score);
      const nextTier = getNextTier(score);
      const history  = (await getRepHistory(lookupUserId)).slice(-5).reverse();

      const progressBar = (() => {
        if (!nextTier) return "MAX LEVEL 💎";
        const currentMin = tier.min || 0;
        const range    = nextTier.min - currentMin;
        const progress = score - currentMin;
        const pct      = Math.min(Math.floor((progress / range) * 10), 10);
        return "▓".repeat(pct) + "░".repeat(10 - pct) + ` ${nextTier.min - score} pts to next`;
      })();

      const historyLines = history.length
        ? history.map(h => `  ${h.delta >= 0 ? "+" : ""}${h.delta} — ${h.reason}`).join("\n")
        : "  No activity yet";

      const isSelf = !repMatch?.[1] || repMatch[1].toLowerCase() === from.username?.toLowerCase();
      const displayName = lookupUsername ? formatUsername(lookupUsername) : `User ${lookupUserId}`;

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `${tier.emoji} *Reputation Profile*\n\n` +
          `👤 ${isSelf ? "You" : displayName}\n` +
          `🏅 Tier: *${tier.label}* ${tier.emoji}\n` +
          `⭐ Score: *${score} pts*\n` +
          `📈 Progress: ${progressBar}\n\n` +
          `📜 *Recent Activity:*\n${historyLines}\n\n` +
          `_💡 Earn rep: be active daily, report scammers accurately, help members._`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_REP_COMPLETE", {
        lookup_username: lookupUsername || null,
        lookup_user_id: lookupUserId,
        score
      });
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /leaderboard
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/leaderboard(@\S+)?$/i)) {
      logBranch("COMMAND_LEADERBOARD");
      const top = await getTopRepUsers(10);
      if (!top.length) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⭐ *Reputation Leaderboard*\n\nNo scores yet — be the first to earn rep! 🏆`,
          reply_to_message_id: message.message_id
        });
        return finishOk("COMMAND_LEADERBOARD_EMPTY");
      }
      const medals = ["🥇", "🥈", "🥉"];
      const lines = top.map((u, i) => {
        const t    = getRepTier(u.score);
        const medal = medals[i] || `${i + 1}.`;
        const name  = u.username ? formatUsername(u.username) : `User ${u.userId}`;
        return `${medal} ${name} — ${t.emoji} *${u.score} pts* (${t.label})`;
      });
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `🏆 *Reputation Leaderboard*\n\n` +
          lines.join("\n") +
          `\n\n_Check yours: /rep | Earn rep: be helpful, stay active 🌟_`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_LEADERBOARD_COMPLETE", { top_count: top.length });
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /giverep @username [points] [reason] — Admin only
    // ══════════════════════════════════════════════════════════
    const giveRepCmd = parseGiveRepCommand(message.text);
    if (giveRepCmd) {
      logBranch("COMMAND_GIVE_REP", giveRepCmd);
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only admins can award reputation.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_GIVE_REP_REJECTED_NON_ADMIN", giveRepCmd);
      }
      const targetUserId = await getUserIdByUsername(giveRepCmd.username);
      if (!targetUserId) {
        await tgSendMessage({ chat_id: chat.id, text: `⚠️ ${formatUsername(giveRepCmd.username)} not found in cache.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_GIVE_REP_TARGET_NOT_FOUND", giveRepCmd);
      }
      const result = await addRepScore(targetUserId, giveRepCmd.points, `Admin award: ${giveRepCmd.reason}`);
      const tier   = result.newTier;
      let text =
        `⭐ *Reputation Awarded!*\n\n` +
        `👤 ${formatUsername(giveRepCmd.username)}\n` +
        `💫 +${giveRepCmd.points} pts — _${giveRepCmd.reason}_\n` +
        `📊 New score: *${result.newScore} pts* — ${tier.emoji} ${tier.label}`;
      if (result.tierChanged) text += `\n\n🎉 *Tier Up!* Now *${tier.label}* ${tier.emoji}`;
      const r = await tgSendMessage({ chat_id: chat.id, text, reply_to_message_id: message.message_id });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_GIVE_REP_COMPLETE", {
        ...giveRepCmd,
        target_user_id: targetUserId,
        new_score: result.newScore
      });
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /takerep @username [points] [reason] — Admin only
    // ══════════════════════════════════════════════════════════
    const takeRepCmd = parseTakeRepCommand(message.text);
    if (takeRepCmd) {
      logBranch("COMMAND_TAKE_REP", takeRepCmd);
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only admins can adjust reputation.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_TAKE_REP_REJECTED_NON_ADMIN", takeRepCmd);
      }
      const targetUserId = await getUserIdByUsername(takeRepCmd.username);
      if (!targetUserId) {
        await tgSendMessage({ chat_id: chat.id, text: `⚠️ ${formatUsername(takeRepCmd.username)} not found in cache.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_TAKE_REP_TARGET_NOT_FOUND", takeRepCmd);
      }
      const result = await addRepScore(targetUserId, -takeRepCmd.points, `Admin penalty: ${takeRepCmd.reason}`);
      const tier   = result.newTier;
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📉 *Reputation Deducted*\n\n` +
          `👤 ${formatUsername(takeRepCmd.username)}\n` +
          `💔 -${takeRepCmd.points} pts — _${takeRepCmd.reason}_\n` +
          `📊 New score: *${result.newScore} pts* — ${tier.emoji} ${tier.label}`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_TAKE_REP_COMPLETE", {
        ...takeRepCmd,
        target_user_id: targetUserId,
        new_score: result.newScore
      });
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /promote @username — Admin only (requires 50+ pts)
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/promote(?:@\S+)?\s+@?[a-zA-Z0-9_]{4,32}$/i)) {
      logBranch("COMMAND_PROMOTE");
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only admins can promote members.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_PROMOTE_REJECTED_NON_ADMIN");
      }
      const promoteMatch  = message.text.trim().match(/^\/promote(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})$/i);
      const promoUsername = promoteMatch?.[1];
      const targetUserId  = await getUserIdByUsername(promoUsername);
      if (!targetUserId) {
        await tgSendMessage({ chat_id: chat.id, text: `⚠️ ${formatUsername(promoUsername)} not found.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_PROMOTE_TARGET_NOT_FOUND", { promo_username: promoUsername || null });
      }
      const score = await getRepScore(targetUserId);
      const tier  = getRepTier(score);
      if (score < 50) {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `⚠️ *Insufficient Reputation*\n\n` +
            `${formatUsername(promoUsername)} has *${score} pts* (${tier.label}).\n\n` +
            `A minimum of *50 pts (🛡️ Community Helper)* is required.\n` +
            `They need ${50 - score} more points.`,
          reply_to_message_id: message.message_id
        });
        return finishOk("COMMAND_PROMOTE_INSUFFICIENT_REP", { promo_username: promoUsername, score });
      }
      const promoteRes = await tgApi("promoteChatMember", {
        chat_id: chat.id, user_id: targetUserId,
        is_anonymous: false, can_manage_chat: true,
        can_delete_messages: true, can_restrict_members: true,
        can_invite_users: true, can_pin_messages: false,
        can_change_info: false, can_promote_members: false,
        can_manage_video_chats: false
      });
      if (!promoteRes?.ok) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `❌ Promotion failed: ${promoteRes?.description || "Unknown error"}`,
          reply_to_message_id: message.message_id
        });
        return finishOk("COMMAND_PROMOTE_FAILED", {
          promo_username: promoUsername,
          description: promoteRes?.description || "Unknown error"
        });
      }
      await new Promise(r => setTimeout(r, 1500));
      await tgApi("setChatAdministratorCustomTitle", {
        chat_id: chat.id, user_id: targetUserId, custom_title: "Community Moderator"
      });
      await addRepScore(targetUserId, 25, "Promoted to Community Moderator");
      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text:
            `🎖️ *[PROMOTION]*\n\n${formatUsername(promoUsername)} promoted to Community Moderator\n` +
            `By: ${from.username ? formatUsername(from.username) : String(from.id)}\nRep: ${score} pts (${tier.label})\nDate: ${new Date().toUTCString()}`
        });
      }
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `🎖️ *Promotion Announcement!*\n\n` +
          `🎉 Congratulations ${formatUsername(promoUsername)}!\n\n` +
          `Based on your outstanding reputation of *${score} pts* (${tier.emoji} ${tier.label}), ` +
          `you've been promoted to *Community Moderator*! 🛡️\n\n` +
          `⭐ +25 bonus rep awarded\n\n` +
          `_Thank you for keeping this group safe and helpful. The community appreciates you! 💛_`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_PROMOTE_COMPLETE", {
        promo_username: promoUsername,
        target_user_id: targetUserId,
        score
      });
    }

    // ══════════════════════════════════════════════════════════
    // (H) /report
    // ══════════════════════════════════════════════════════════
    const reportCmd = parseReportCommand(message.text);
    if (reportCmd !== null) {
      logBranch("COMMAND_REPORT", reportCmd);
      let targetUsername = reportCmd.targetUsername;
      let reason         = reportCmd.reason;
      let evidenceMsgId  = null;

      if (message.reply_to_message) {
        const replyFrom = message.reply_to_message.from;
        evidenceMsgId   = message.reply_to_message.message_id;
        if (!replyFrom?.username) {
          await tgSendMessage({
            chat_id: chat.id,
            text: `⚠️ The user you replied to has no username.\nTry: /report @username [reason]`,
            reply_to_message_id: message.message_id
          });
          return finishOk("COMMAND_REPORT_REPLY_TARGET_NO_USERNAME");
        }
        targetUsername = replyFrom.username;
        const rawReason = message.text?.trim().match(/^\/report(?:@\S+)?(?:\s+(.+))?$/i);
        reason = rawReason?.[1]?.trim() || null;
      }

      if (!targetUsername) {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `ℹ️ *How to report*\n\n` +
            `Option 1 — Reply to their message:\n/report [reason]\n\n` +
            `Option 2 — Use username:\n/report @username [reason]`,
          reply_to_message_id: message.message_id
        });
        return finishOk("COMMAND_REPORT_USAGE_SHOWN");
      }

      if (targetUsername.toLowerCase() === from?.username?.toLowerCase()) {
        await tgSendMessage({ chat_id: chat.id, text: `🤨 You can't report yourself.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_REPORT_SELF_REJECTED", { target_username: targetUsername });
      }
      if (targetUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 You cannot report the group admin.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_REPORT_ADMIN_REJECTED", { target_username: targetUsername });
      }

      let reporterVerified = false;
      if (from?.username) {
        const rv = await verifyUsernameApi(from.username, req);
        reporterVerified = rv?.verified === true;
      }

      const { alreadyReported, newScore } = await fileScamReport({
        targetUsername, reporterId: from.id, reporterUsername: from.username,
        reporterVerified, reason, chatId: chat.id, evidenceMsgId
      });
      logBranch("COMMAND_REPORT_FILED", {
        target_username: targetUsername,
        reporter_verified: reporterVerified,
        already_reported: alreadyReported,
        new_score: newScore
      });

      if (alreadyReported) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `ℹ️ You've already reported *${formatUsername(targetUsername)}*.\nAdmins are monitoring the situation.`,
          reply_to_message_id: message.message_id
        });
        return finishOk("COMMAND_REPORT_DUPLICATE", { target_username: targetUsername, new_score: newScore });
      }

      const reports = await getScamReports(targetUsername);
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📋 *Report Received*\n\n` +
          `👤 User: ${formatUsername(targetUsername)}\n` +
          `📝 Reason: ${reason || "Not specified"}\n` +
          `🔢 Total reports: ${reports.length}\n\n` +
          `_Admins notified. The report is anonymous. 🔒_`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);

      tgSendMessage({
        chat_id: from.id,
        text:
          `✅ *Report received*\n\nYou reported ${formatUsername(targetUsername)}.\n` +
          `If confirmed, you'll earn *+${REP_GAINS.ACCURATE_REPORT} reputation*! 🛡️`
      }).catch(() => {});

      // Strike threshold actions
      if (newScore >= BAN_STRIKE_THRESHOLD) {
        logBranch("COMMAND_REPORT_BAN_THRESHOLD_REACHED", { target_username: targetUsername, new_score: newScore });
        const targetV = await verifyUsernameApi(targetUsername, req);
        if (!targetV?.verified) {
          const targetUserId = await getUserIdByUsername(targetUsername);
          if (targetUserId) {
            await banUser(chat.id, targetUserId);
            await addToBlacklist(targetUsername, { reason: "Auto-banned: community reports", chatId: chat.id, score: newScore });
            const banMsg = await tgSendMessage({
              chat_id: chat.id,
              text:
                `⛔ *User Auto-Banned*\n\n` +
                `${formatUsername(targetUsername)} removed from the group.\n` +
                `📊 Strike score: *${newScore}* — threshold exceeded.\n` +
                `🌐 Added to global blacklist. 🔐`
            });
            await saveBotMsgId(chat.id, banMsg?.result?.message_id);
            if (ADMIN_LOG_CHAT_ID) {
              await tgSendMessage({
                chat_id: ADMIN_LOG_CHAT_ID,
                text:
                  `⛔ *[AUTO-BAN]* ${formatUsername(targetUsername)}\n` +
                  `Score: ${newScore} | Reports: ${reports.length}\n` +
                  `Use /clearreport ${formatUsername(targetUsername)} to reverse if false positive.`
              });
            }
          }
        }
      } else if (newScore >= MUTE_STRIKE_THRESHOLD) {
        logBranch("COMMAND_REPORT_MUTE_THRESHOLD_REACHED", { target_username: targetUsername, new_score: newScore });
        const targetUserId = await getUserIdByUsername(targetUsername);
        if (targetUserId) {
          await muteUser(chat.id, targetUserId);
          const muteMsg = await tgSendMessage({
            chat_id: chat.id,
            text:
              `🔇 *User Muted Pending Review*\n\n` +
              `${formatUsername(targetUsername)} muted for *1 hour* while admins review.\n` +
              `📊 Strike score: *${newScore}*\n\n` +
              `_Admins: /clearreport ${formatUsername(targetUsername)} to dismiss._`
          });
          await saveBotMsgId(chat.id, muteMsg?.result?.message_id);
        }
      }

      return finishOk("COMMAND_REPORT_COMPLETE", { target_username: targetUsername, new_score: newScore });
    }

    // ══════════════════════════════════════════════════════════
    // (I) /scamreports — Admin only
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/scamreports(@\S+)?$/i)) {
      logBranch("COMMAND_SCAMREPORTS");
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Admins only.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_SCAMREPORTS_REJECTED_NON_ADMIN");
      }
      const topReported = await getTopReported(10);
      if (!topReported.length) {
        await tgSendMessage({ chat_id: chat.id, text: `📊 *Scam Reports*\n\nNo reports filed yet. ✅`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_SCAMREPORTS_EMPTY");
      }
      const lines = topReported.map((u, i) => {
        const status = u.confirmed ? "⛔ CONFIRMED" : `⚠️ Score: ${u.score}`;
        return `${i + 1}. ${formatUsername(u.username)} — ${status} | ${u.reportCount} report(s)`;
      });
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📊 *Top Reported Users*\n\n` +
          lines.join("\n") +
          `\n\n_/clearreport @user to dismiss | /confirmscam @user [tactics] to action_`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_SCAMREPORTS_COMPLETE", { top_reported_count: topReported.length });
    }

    // ══════════════════════════════════════════════════════════
    // (J) /clearreport @username — Admin only
    // ══════════════════════════════════════════════════════════
    const clearTarget = parseClearReportCommand(message.text);
    if (clearTarget) {
      logBranch("COMMAND_CLEARREPORT", { clear_target: clearTarget });
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Admins only.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_CLEARREPORT_REJECTED_NON_ADMIN", { clear_target: clearTarget });
      }
      await removeFromBlacklist(clearTarget);
      const targetUserId = await getUserIdByUsername(clearTarget);
      if (targetUserId) {
        await tgApi("restrictChatMember", {
          chat_id: chat.id, user_id: targetUserId,
          permissions: {
            can_send_messages: true, can_send_audios: true, can_send_documents: true,
            can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
            can_send_voice_notes: true, can_send_polls: true,
            can_send_other_messages: true, can_add_web_page_previews: true
          }
        });
      }
      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text: `✅ *[CLEARED]* Reports against ${formatUsername(clearTarget)} dismissed by ${from.username ? formatUsername(from.username) : String(from.id)}`
        });
      }
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `✅ *Reports Cleared*\n\n` +
          `All reports against ${formatUsername(clearTarget)} dismissed.\n` +
          `If restricted, they can now speak again. 🔓`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_CLEARREPORT_COMPLETE", {
        clear_target: clearTarget,
        target_user_id: targetUserId || null
      });
    }

    // ══════════════════════════════════════════════════════════
    // (K) /confirmscam @username [tactics] — Admin only
    // ══════════════════════════════════════════════════════════
    const confirmCmd = parseConfirmScammerCommand(message.text);
    if (confirmCmd) {
      logBranch("COMMAND_CONFIRMSCAM", confirmCmd);
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Admins only.`, reply_to_message_id: message.message_id });
        return finishOk("COMMAND_CONFIRMSCAM_REJECTED_NON_ADMIN", confirmCmd);
      }

      const { username: scammerUsername, tactics } = confirmCmd;
      await addToBlacklist(scammerUsername, {
        confirmedBy: from.username || from.id, tactics: tactics || "Not specified", chatId: chat.id
      });

      const targetUserId = await getUserIdByUsername(scammerUsername);
      if (targetUserId) await banUser(chat.id, targetUserId);

      // Reward reporters who got it right
      const reporters = await getReportersForTarget(scammerUsername);
      for (const reporterId of reporters) {
        const repResult = await addRepScore(reporterId, REP_GAINS.ACCURATE_REPORT, `Accurate report: @${scammerUsername} confirmed`);
        tgSendMessage({
          chat_id: reporterId,
          text:
            `🏆 *Report Confirmed!*\n\n` +
            `Your report of ${formatUsername(scammerUsername)} has been confirmed by admins.\n\n` +
            `⭐ You've earned *+${REP_GAINS.ACCURATE_REPORT} reputation points*!\n` +
            `📊 New score: *${repResult.newScore} pts* — ${repResult.newTier.emoji} ${repResult.newTier.label}\n\n` +
            `_Thank you for keeping the community safe! 🛡️_`
        }).catch(() => {});
      }

      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text:
            `⛔ *[CONFIRMED SCAMMER]*\n${formatUsername(scammerUsername)}\n` +
            `By: ${from.username ? formatUsername(from.username) : String(from.id)}\n` +
            `Tactics: ${tactics || "Not specified"}\n` +
            `Reporters rewarded: ${reporters.length}\n` +
            `Date: ${new Date().toUTCString()}`
        });
      }

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `⛔ *CONFIRMED SCAMMER*\n\n` +
          `👤 ${formatUsername(scammerUsername)}\n` +
          `🎭 Tactics: ${tactics || "Not specified"}\n` +
          `📅 ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}\n` +
          `🌐 Status: *Global blacklist — banned on entry*\n\n` +
          `⭐ ${reporters.length} member(s) who reported this user have been rewarded.\n\n` +
          `⚠️ _If this person contacts you anywhere, block and ignore them._`
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return finishOk("COMMAND_CONFIRMSCAM_COMPLETE", {
        scammer_username: scammerUsername,
        reporters_rewarded: reporters.length
      });
    }

    // ══════════════════════════════════════════════════════════
    // (F) HOURLY SCHEDULED BROADCAST
    // ══════════════════════════════════════════════════════════
    const schedCheckKey = `sched:lastcheck:${chat.id}`;
    const schedIndexKey = `sched:index:${chat.id}`;
    const lastCheckTs   = await redis.get(schedCheckKey);
    const nowTs         = Math.floor(Date.now() / 1000);
    const secSinceCheck = lastCheckTs ? nowTs - parseInt(lastCheckTs, 10) : SCHEDULED_CHECK_SEC + 1;

    if (secSinceCheck >= SCHEDULED_CHECK_SEC) {
      logBranch("SCHEDULED_BROADCAST_ELIGIBLE", { sec_since_check: secSinceCheck });
      await redis.set(schedCheckKey, nowTs);
      const lastBotMsgId = await getLastBotMsgId(chat.id);
      const msgGap       = lastBotMsgId ? currentMsgId - lastBotMsgId : SCHEDULED_MIN_MSG_GAP + 1;
      logBranch("SCHEDULED_BROADCAST_GAP_CHECK", {
        last_bot_message_id: lastBotMsgId || null,
        message_gap: msgGap
      });
      if (msgGap >= SCHEDULED_MIN_MSG_GAP) {
        const idx       = parseInt((await redis.get(schedIndexKey)) || "0", 10);
        const scheduled = SCHEDULED_MESSAGES[idx % SCHEDULED_MESSAGES.length];
        await redis.set(schedIndexKey, (idx + 1) % SCHEDULED_MESSAGES.length);
        const markup = scheduled.button ? verifyButton(req, scheduled.button) : undefined;
        const r = await tgSendMessage({ chat_id: chat.id, text: scheduled.text, reply_markup: markup });
        await saveBotMsgId(chat.id, r?.result?.message_id);
        return finishOk("SCHEDULED_BROADCAST_SENT", {
          scheduled_index: idx % SCHEDULED_MESSAGES.length,
          button: scheduled.button || null
        });
      }
      logBranch("SCHEDULED_BROADCAST_SKIPPED_GAP_TOO_SMALL", { message_gap: msgGap });
    }

    return finishOk("NO_ACTION_MATCHED");

  } catch (e) {
    log.error("UNHANDLED_EXCEPTION", { message: e.message, stack: e.stack });
    return res.status(200).send("ok");
  }
}
