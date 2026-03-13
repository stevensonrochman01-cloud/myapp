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

const ADMIN_LOG_CHAT_ID = process.env.ADMIN_LOG_CHAT_ID || null;

// ─── Strike / mute / ban thresholds ──────────────────────────────
const MUTE_STRIKE_THRESHOLD   = 3;
const BAN_STRIKE_THRESHOLD    = 5;
const MUTE_DURATION_SEC       = 3600;

// ─── Scheduled broadcast config ──────────────────────────────────
const SCHEDULED_CHECK_SEC     = 3600;
const SCHEDULED_MIN_MSG_GAP   = 10;

// ══════════════════════════════════════════════════════════════════
// 🚨 CP / ILLEGAL CONTENT DETECTION
// ══════════════════════════════════════════════════════════════════
// Text keywords that indicate CP or illegal content sharing.
// Case-insensitive, partial-match scan on every incoming message.
const ILLEGAL_KEYWORDS = [
  // CP explicit
  "cp link", "cp vid", "cp video", "cp photo", "cp pics", "cp collection",
  "child porn", "kiddie porn", "loli porn", "shota", "preteen nude",
  "underage nude", "underage sex", "underage porn", "minor porn",
  "jailbait", "pedo", "paedophile", "paedophilia", "pedophilia",
  "kids nude", "girls nude young", "boys nude young",
  // Distribution signals
  "selling cp", "buy cp", "trade cp", "swap cp", "cp for sale",
  "cp channel", "cp group", "cp telegram",
  // CSAM (child sexual abuse material)
  "csam", "child abuse material",
  // Illegal drug dealing in chats
  "selling meth", "selling heroin", "selling fentanyl",
  // General "illegal content" self-identification
  "illegal vid", "illegal video", "illegal content",
];

// Media types that, when forwarded from unknown sources, get auto-deleted.
// (All forwarded messages are deleted anyway — this is used for the ban logic.)
const ILLEGAL_MEDIA_TYPES = ["photo", "video", "document", "animation", "video_note"];

/**
 * Scans a message for CP / illegal keywords.
 * Returns the matched keyword, or null.
 */
function detectIllegalKeyword(text = "") {
  const lower = text.toLowerCase();
  for (const kw of ILLEGAL_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

/**
 * Returns true if the message is a forwarded message.
 * Covers both legacy (forward_from / forward_from_chat) and
 * new (forward_origin) Telegram Bot API fields.
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
  { min: 0,   label: "New Member",        emoji: "🆕" },
  { min: 10,  label: "Regular",           emoji: "👤" },
  { min: 25,  label: "Trusted Member",    emoji: "🌟" },
  { min: 50,  label: "Community Helper",  emoji: "🛡️" },
  { min: 100, label: "Senior Helper",     emoji: "👑" },
  { min: 200, label: "Elite Guardian",    emoji: "💎" },
];

const REP_GAINS = {
  VERIFIED_JOIN:        2,   // User joins already verified
  GOT_VERIFIED:         5,   // User completes verification after joining
  ACCURATE_REPORT:      10,  // A report they filed was /confirmscam'd
  DAILY_ACTIVE:         1,   // First message of the day
  HELPFUL_REPLY:        3,   // Admin manually awards for a helpful reply (/giverep)
  ADMIN_GRANT:          null,// Custom amount — admin sets via /giverep @user [n]
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
  return null; // Already at max
}

// ─── Redis: Reputation storage ────────────────────────────────────
// rep:score:<userId>       → numeric score
// rep:history:<userId>     → JSON array of {reason, delta, ts}
// rep:daily:<userId>       → "1" with TTL until midnight UTC (daily-active gate)
// rep:reporters:<scammer>  → JSON array of reporter userIds

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

    // Append to history (keep last 50 events)
    const raw = await redis.get(`rep:history:${userId}`);
    const history = raw ? JSON.parse(raw) : [];
    history.push({ reason, delta, ts: Date.now() });
    if (history.length > 50) history.splice(0, history.length - 50);
    await redis.set(`rep:history:${userId}`, JSON.stringify(history), { ex: 60 * 60 * 24 * 90 });

    log.ok("REP_UPDATED", { userId, delta, reason, newScore });
    return { newScore, oldScore: current, tierChanged: getRepTier(current).label !== getRepTier(newScore).label, newTier: getRepTier(newScore) };
  } catch (e) {
    log.error("REP_UPDATE_FAILED", { userId, error: e.message });
    return { newScore: 0, oldScore: 0, tierChanged: false, newTier: REP_TIERS[0] };
  }
}

async function getRepHistory(userId) {
  try {
    const raw = await redis.get(`rep:history:${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function isDailyRepClaimed(userId) {
  try {
    const v = await redis.get(`rep:daily:${userId}`);
    return !!v;
  } catch { return false; }
}

async function claimDailyRep(userId) {
  try {
    // Expire at the next midnight UTC
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const ttl = Math.floor((midnight - now) / 1000);
    await redis.set(`rep:daily:${userId}`, "1", { ex: ttl });
  } catch {}
}

// Track who filed reports that later got confirmed (for rep rewards)
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

// Top N by reputation
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
  } catch (e) {
    log.error("GET_TOP_REP_FAILED", { error: e.message });
    return [];
  }
}

// Cache username → userId mapping AND userId → username for leaderboard
async function storeRepName(userId, username) {
  if (!userId || !username) return;
  try {
    await redis.set(`repname:${userId}`, username, { ex: 60 * 60 * 24 * 30 });
  } catch {}
}

// ══════════════════════════════════════════════════════════════════
// ROTATING BROADCAST MESSAGES
// ══════════════════════════════════════════════════════════════════
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
  },
  {
    text:
      `⭐ <b>Community Reputation System</b>\n\n` +
      `Active, helpful members earn <b>reputation points</b>!\n\n` +
      `🆕 New Member → 👤 Regular → 🌟 Trusted → 🛡️ Helper → 👑 Senior → 💎 Elite\n\n` +
      `Check your rank: <code>/rep</code>\n` +
      `Top members may be promoted to <b>moderators</b>! 🎖️`,
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
  if (json?.ok) log.ok(`TG_RESPONSE ← ${method}`, json);
  else log.error(`TG_RESPONSE ← ${method}`, json);
  return json;
}

async function tgSendMessage({ chat_id, text, reply_to_message_id, parse_mode = "HTML", reply_markup }) {
  return tgApi("sendMessage", {
    chat_id, text, parse_mode,
    disable_web_page_preview: true,
    ...(reply_to_message_id ? { reply_to_message_id } : {}),
    ...(reply_markup ? { reply_markup } : {})
  });
}

async function tgDeleteMessage(chat_id, message_id) {
  log.info("DELETE_MESSAGE", { chat_id, message_id });
  return tgApi("deleteMessage", { chat_id, message_id });
}

// ─── Verify API ───────────────────────────────────────────────────
async function verifyUsernameApi(username) {
  const url = `${VERIFY_API_BASE}?username=${encodeURIComponent(username)}`;
  try {
    const r = await fetch(url, { method: "GET" });
    const json = await r.json();
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

// ══════════════════════════════════════════════════════════════════
// SCAM REPORTING SYSTEM (unchanged from original)
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

async function muteUser(chatId, userId, durationSec = MUTE_DURATION_SEC) {
  const untilDate = Math.floor(Date.now() / 1000) + durationSec;
  return tgApi("restrictChatMember", {
    chat_id: chatId, user_id: userId, until_date: untilDate,
    permissions: {
      can_send_messages: false, can_send_audios: false, can_send_documents: false,
      can_send_photos: false, can_send_videos: false, can_send_video_notes: false,
      can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false,
      can_add_web_page_previews: false
    }
  });
}

async function banUser(chatId, userId) {
  return tgApi("banChatMember", { chat_id: chatId, user_id: userId });
}

async function forwardEvidence(fromChatId, messageId) {
  if (!ADMIN_LOG_CHAT_ID) return null;
  return tgApi("forwardMessage", { chat_id: ADMIN_LOG_CHAT_ID, from_chat_id: fromChatId, message_id: messageId });
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
  if (alreadyReported) return { alreadyReported: true, newScore: await getStrikeScore(targetUsername), muteTriggered: false, banTriggered: false };

  const weight = reporterVerified ? 2 : 1;
  const reportEntry = {
    reporterId, reporterUsername: reporterUsername || null, reporterVerified, weight,
    reason: reason || "No reason given", chatId, evidenceMsgId: evidenceMsgId || null, ts: Date.now()
  };
  reports.push(reportEntry);
  await saveScamReports(targetUsername, reports);

  const oldScore = await getStrikeScore(targetUsername);
  const newScore = oldScore + weight;
  await setStrikeScore(targetUsername, newScore, reports.length);

  // Track reporter for later rep reward on confirmation
  if (reporterId) await storeReporterForTarget(targetUsername, reporterId);

  if (evidenceMsgId && ADMIN_LOG_CHAT_ID) {
    const note = `🚨 <b>Report Evidence</b>\n👤 Reported: @${escapeHtml(targetUsername)}\n📋 Reason: ${escapeHtml(reason || "None")}\n⚖️ Reporter: @${escapeHtml(reporterUsername || "unknown")} (${reporterVerified ? "✅ Verified" : "⚠️ Unverified"})\n📊 New strike score: ${newScore}`;
    await tgSendMessage({ chat_id: ADMIN_LOG_CHAT_ID, text: note });
    await forwardEvidence(chatId, evidenceMsgId);
  }

  return { alreadyReported: false, newScore, muteTriggered: false, banTriggered: false };
}

// ─── Command parsers ──────────────────────────────────────────────
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

/**
 * Parses /giverep @username [points] [reason]
 * Examples:
 *   /giverep @alice 10 helped a new member
 *   /giverep @alice           ← awards default 3 pts
 */
function parseGiveRepCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/giverep(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})(?:\s+(\d+))?(?:\s+(.+))?$/i);
  if (!m) return null;
  return {
    username: m[1],
    points: m[2] ? parseInt(m[2], 10) : REP_GAINS.HELPFUL_REPLY,
    reason: m[3]?.trim() || "Awarded by admin"
  };
}

/**
 * Parses /takerep @username [points] [reason]  (penalty / abuse)
 */
function parseTakeRepCommand(text) {
  if (!text) return null;
  const m = text.trim().match(/^\/takerep(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})(?:\s+(\d+))?(?:\s+(.+))?$/i);
  if (!m) return null;
  return {
    username: m[1],
    points: m[2] ? parseInt(m[2], 10) : 5,
    reason: m[3]?.trim() || "Penalised by admin"
  };
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
    if (!message) return res.status(200).send("ok");

    const chat = message.chat;
    const from = message.from;

    if (!chat || from?.is_bot) return res.status(200).send("ok");

    // ══════════════════════════════════════════════════════════
    // (PRIVATE) DEPARTURE FEEDBACK
    // ══════════════════════════════════════════════════════════
    if (chat.type === "private" && from?.id && message.text) {
      const pending = await getFeedbackPending(from.id);
      if (pending) {
        await clearFeedbackPending(from.id);
        const firstName = escapeHtml(from.first_name || "");
        await tgSendMessage({
          chat_id: from.id,
          text: `💛 Thank you for your feedback, ${firstName}!\n\nOur team will review it. We hope to see you back someday! 🙏`
        });
        if (ADMIN_LOG_CHAT_ID) {
          const lastName = escapeHtml(from.last_name || "");
          const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
          await tgSendMessage({
            chat_id: ADMIN_LOG_CHAT_ID,
            text:
              `📩 <b>Departure Feedback</b>\n\n` +
              `👤 Name: ${displayName}\n` +
              `🔗 Username: ${from.username ? `@${escapeHtml(from.username)}` : "(none)"}\n` +
              `🪪 User ID: <code>${from.id}</code>\n` +
              `🏘️ Left: ${escapeHtml(pending.chatTitle || "Unknown")}\n\n` +
              `💬 <b>Reason:</b>\n${escapeHtml(message.text)}`
          });
        }
        return res.status(200).send("ok");
      }
      return res.status(200).send("ok");
    }

    if (chat.type !== "group" && chat.type !== "supergroup") return res.status(200).send("ok");

    const currentMsgId = message.message_id;

    // Cache user IDs
    if (from?.username && from?.id) {
      await storeUserId(from.username, from.id);
      await storeRepName(from.id, from.username);
    }

    // ══════════════════════════════════════════════════════════
    // 🚨 SECURITY LAYER 1: CP / ILLEGAL CONTENT — TEXT SCAN
    // Runs FIRST on every group message before anything else.
    // ══════════════════════════════════════════════════════════
    const msgText = message.text || message.caption || "";
    const illegalKw = detectIllegalKeyword(msgText);

    if (illegalKw) {
      log.warn("ILLEGAL_KEYWORD_DETECTED", { from_id: from.id, from_username: from.username, keyword: illegalKw, chat_id: chat.id });

      // 1. Delete the offending message immediately
      await tgDeleteMessage(chat.id, message.message_id);

      // 2. Ban the sender permanently
      await banUser(chat.id, from.id);

      // 3. Add to global blacklist
      const username = from.username || String(from.id);
      await addToBlacklist(username, {
        reason: `Auto-banned: illegal keyword "${illegalKw}"`,
        chatId: chat.id,
        bannedAt: Date.now()
      });

      // 4. Public notice
      const m = from.username ? `@${from.username}` : `<a href="tg://user?id=${from.id}">${escapeHtml(from.first_name || "User")}</a>`;
      await tgSendMessage({
        chat_id: chat.id,
        text:
          `🚨 <b>User Removed — Illegal Content</b>\n\n` +
          `${m} has been <b>permanently banned</b> for sharing or attempting to share illegal/prohibited content.\n\n` +
          `🔐 Added to global blacklist.\n` +
          `<i>Zero tolerance. This group is safe space. 🛡️</i>`
      });

      // 5. Alert admin log with full details
      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text:
            `🚨 <b>[ILLEGAL CONTENT BAN]</b>\n\n` +
            `👤 User: ${m}\n` +
            `🪪 ID: <code>${from.id}</code>\n` +
            `🔑 Trigger: <code>${escapeHtml(illegalKw)}</code>\n` +
            `💬 Message snippet: <code>${escapeHtml(msgText.slice(0, 200))}</code>\n` +
            `🏘️ Group: ${escapeHtml(chat.title || String(chat.id))}\n` +
            `📅 ${new Date().toUTCString()}`
        });
      }

      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // 🚨 SECURITY LAYER 2: FORWARDED MESSAGE AUTO-DELETE
    // All forwarded messages are removed. Admins are exempt.
    // ══════════════════════════════════════════════════════════
    if (isForwardedMessage(message)) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);

      if (!senderIsAdmin) {
        log.warn("FORWARDED_MSG_DELETED", { from_id: from.id, msg_id: message.message_id });

        await tgDeleteMessage(chat.id, message.message_id);

        // Silently warn the user via a short temp message
        const warning = await tgSendMessage({
          chat_id: chat.id,
          text:
            `⚠️ ${mentionUser(from)} Forwarded messages are not allowed in this group.\n` +
            `<i>Please share content directly — no forwards. 🚫</i>`
        });

        // Auto-delete the warning after 8 seconds to keep chat clean
        if (warning?.result?.message_id) {
          setTimeout(() => {
            tgDeleteMessage(chat.id, warning.result.message_id).catch(() => {});
          }, 8000);
        }

        return res.status(200).send("ok");
      } else {
        log.info("FORWARDED_MSG_ADMIN_EXEMPT", { from_id: from.id });
      }
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ REPUTATION: Daily Active Bonus
    // Award 1 point for first message of the day (per user)
    // ══════════════════════════════════════════════════════════
    if (from?.id && !(await isDailyRepClaimed(from.id))) {
      await claimDailyRep(from.id);
      const result = await addRepScore(from.id, REP_GAINS.DAILY_ACTIVE, "Daily activity");

      // Announce tier-up in chat (not for daily point, only on tier change)
      if (result.tierChanged) {
        const m = from.username ? `@${from.username}` : `<a href="tg://user?id=${from.id}">${escapeHtml(from.first_name || "Member")}</a>`;
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `${result.newTier.emoji} <b>Reputation Tier Up!</b>\n\n` +
            `Congratulations ${m}! You've reached <b>${result.newTier.label}</b> 🎉\n` +
            `Current score: <b>${result.newScore} pts</b>\n\n` +
            `<i>Keep being helpful to climb higher! 🚀</i>`
        });
      }
    }

    // ══════════════════════════════════════════════════════════
    // (A) WELCOME — new members joining
    // ══════════════════════════════════════════════════════════
    if (message.new_chat_members?.length) {
      for (const member of message.new_chat_members) {
        if (member.is_bot) continue;
        if (member.username && member.id) {
          await storeUserId(member.username, member.id);
          await storeRepName(member.id, member.username);
        }

        const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || "there";
        const displayName = member.username ? `@${member.username}` : `<b>${escapeHtml(fullName)}</b>`;
        const m = member.username
          ? `@${member.username}`
          : `<a href="tg://user?id=${member.id}">${escapeHtml(fullName)}</a>`;

        // Blacklist check on join
        if (member.username) {
          const blacklisted = await isBlacklisted(member.username);
          if (blacklisted) {
            await banUser(chat.id, member.id);
            await tgSendMessage({
              chat_id: chat.id,
              text: `🚫 <b>Banned on Entry</b>\n\n${displayName} is on the global scammer/offender blacklist and has been automatically removed. 🔐`
            });
            continue;
          }
        }

        let isVerified = false;
        if (member.username) {
          const v = await verifyUsernameApi(member.username);
          isVerified = v?.verified === true;
        }

        if (isVerified) {
          // Award rep for joining already-verified
          await addRepScore(member.id, REP_GAINS.VERIFIED_JOIN, "Joined as verified member");

          const r = await tgSendMessage({
            chat_id: chat.id,
            text: `👑 Welcome ${m}! You're already <b>verified</b> — enjoy the group! ✅\n⭐ <b>+${REP_GAINS.VERIFIED_JOIN} reputation</b> awarded for joining verified.`
          });
          await saveBotMsgId(chat.id, r?.result?.message_id);
        } else {
          const noUsernameNote = !member.username
            ? `\n\n<i>💡 Tip: Set a Telegram username in settings so others can verify you.</i>` : "";
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

          tgSendMessage({
            chat_id: member.id,
            text: `Hi ${escapeHtml(member.first_name || "")} 👋\n\nVerify to stay in the group — completely <b>FREE</b>! 🎉`,
            reply_markup: verifyButton("✅ Verify Me Now")
          }).catch(() => {});
        }
      }
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (A2) DEPARTURE — member left or was removed
    // ══════════════════════════════════════════════════════════
    if (message.left_chat_member) {
      const leaver = message.left_chat_member;
      if (leaver.is_bot) return res.status(200).send("ok");

      const fullName  = [leaver.first_name, leaver.last_name].filter(Boolean).join(" ").trim() || "there";
      const firstName = escapeHtml(leaver.first_name || fullName);
      const chatTitle = escapeHtml(chat.title || "the group");

      tgSendMessage({
        chat_id: leaver.id,
        text:
          `Hey ${firstName} 👋\n\nI noticed you left <b>${chatTitle}</b>. We're sorry to see you go! 😔\n\n` +
          `Would you mind sharing why you left? Your feedback helps us improve.\n\n` +
          `Just reply to this message — it goes straight to the admin team. 💬\n\n` +
          `<i>(You have 48 hours to reply. Completely private.)</i>`
      }).then(async dmResult => {
        if (dmResult?.ok) {
          await setFeedbackPending(leaver.id, {
            chatId: chat.id, chatTitle: chat.title || "", leftAt: Date.now(),
            username: leaver.username || null, name: fullName
          });
        }
      }).catch(() => {});

      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (B) ADMIN COMMAND: /verify @username sugarbaby|sugardaddy
    // ══════════════════════════════════════════════════════════
    const adminCmd = parseAdminVerifyCommand(message.text);
    if (adminCmd) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only group admins can assign verification tags.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }

      const { username, role } = adminCmd;
      const targetUserId = await getUserIdByUsername(username);
      if (!targetUserId) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⚠️ <b>User not found in cache</b>\n\n@${escapeHtml(username)} hasn't sent a message here yet.\nAsk them to send one message, then retry.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const result = await assignVerifiedTitle(chat.id, targetUserId, role);
      if (result?.ok) {
        const emoji = role === "sugardaddy" ? "💎" : "🌸";
        const label = role === "sugardaddy" ? "Verified SugarDaddy" : "Verified SugarBaby";

        // Award rep for completing verification
        await addRepScore(targetUserId, REP_GAINS.GOT_VERIFIED, "Completed verification");

        const r = await tgSendMessage({
          chat_id: chat.id,
          text:
            `${emoji} <b>Verification Tag Assigned!</b>\n\n` +
            `👤 @${escapeHtml(username)}\n` +
            `🏷️ Title: <b>${label}</b>\n` +
            `⭐ +${REP_GAINS.GOT_VERIFIED} reputation awarded for getting verified ✅`,
          reply_to_message_id: message.message_id
        });
        await saveBotMsgId(chat.id, r?.result?.message_id);
      } else {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `❌ <b>Could not assign title</b>\n\n` +
            `Make sure:\n• The bot has Admin rights\n• @${escapeHtml(username)} is still in the group\n• Bot rank is higher than the target\n\n` +
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
    if (verifyTarget) {
      const v = await verifyUsernameApi(verifyTarget);
      let reply, markup;

      if (v?.verified) {
        const name = escapeHtml(v?.name || verifyTarget);
        reply =
          `✅ <b>Verified Member</b>\n\n` +
          `👤 @${escapeHtml(verifyTarget)}\n` +
          `📛 Name: ${name}\n` +
          `🪪 ID: <code>${escapeHtml(v?.public_id || "N/A")}</code>\n` +
          `🎭 Role: ${escapeHtml(v?.role || "N/A")}\n` +
          `🏅 Badge: ${escapeHtml(v?.badge || "✨")}`;
      } else {
        const blacklisted = await isBlacklisted(verifyTarget);
        if (blacklisted) {
          reply = `🚫 <b>CONFIRMED SCAMMER/OFFENDER</b> — @${escapeHtml(verifyTarget)}\n\n⛔ This user is on the global blacklist.\nDo NOT engage. Block immediately.`;
        } else {
          const score = await getStrikeScore(verifyTarget);
          const reports = await getScamReports(verifyTarget);
          reply =
            `❌ <b>Not Verified</b> — @${escapeHtml(verifyTarget)}\n\n⚠️ Proceed with caution.` +
            (score > 0 ? `\n\n📊 <b>Report Score:</b> ${score} pts from ${reports.length} report(s)` : "");
          markup = verifyButton("🔗 Verify This Profile");
        }
      }

      const r = await tgSendMessage({ chat_id: chat.id, text: reply, reply_to_message_id: message.message_id, reply_markup: markup });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (D) /scam
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/scam(@\S+)?$/i)) {
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `🚨 <b>Scam Warning</b>\n\n` +
          `<b>Never</b> send money, gift cards, or vouchers to anyone here.\n\n` +
          `Real Sugar Daddies <b>give</b> — they never ask you to pay first.\n\n` +
          `📣 Report: reply to their message and type <code>/report [reason]</code>\n` +
          `Or: <code>/report @username [reason]</code>\n\nBlock & report immediately. 🚫`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (E) /rules
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/rules(@\S+)?$/i)) {
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📋 <b>Group Rules</b>\n\n` +
          `1️⃣ Verified members only — get verified to stay\n` +
          `2️⃣ No asking for money, vouchers, or advance payments\n` +
          `3️⃣ No spam, self-promotion, or links\n` +
          `4️⃣ <b>No forwarded messages</b> — posts only, no forwards 🚫\n` +
          `5️⃣ Zero tolerance for illegal or harmful content — instant ban 🔨\n` +
          `6️⃣ Respect all members\n` +
          `7️⃣ For genuine SD connections → @${ADMIN_USERNAME}\n` +
          `8️⃣ Report scammers: /report @username [reason]\n\n` +
          `<i>Breaking rules = instant ban. No appeals. 🔒</i>`,
        reply_to_message_id: message.message_id,
        reply_markup: verifyButton()
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /rep — Check your own or another user's reputation
    //   Usage: /rep           → your own rep
    //          /rep @username → check someone else
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/rep(?:@\S+)?(?:\s+@?[a-zA-Z0-9_]+)?$/i)) {
      const repMatch = message.text.trim().match(/^\/rep(?:@\S+)?(?:\s+@?([a-zA-Z0-9_]{4,32}))?$/i);
      const lookupUsername = repMatch?.[1] || from.username;
      const lookupUserId   = repMatch?.[1]
        ? await getUserIdByUsername(repMatch[1])
        : from.id;

      if (!lookupUserId) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⚠️ User @${escapeHtml(repMatch?.[1] || "?")} not found in cache. Ask them to send a message first.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const score    = await getRepScore(lookupUserId);
      const tier     = getRepTier(score);
      const nextTier = getNextTier(score);
      const history  = (await getRepHistory(lookupUserId)).slice(-5).reverse();

      const progressBar = (() => {
        if (!nextTier) return "MAX LEVEL 💎";
        const range = nextTier.min - (REP_TIERS.find(t => t.label === tier.label)?.min || 0);
        const progress = score - (REP_TIERS.find(t => t.label === tier.label)?.min || 0);
        const pct = Math.min(Math.floor((progress / range) * 10), 10);
        return "▓".repeat(pct) + "░".repeat(10 - pct) + ` ${nextTier.min - score} pts to next`;
      })();

      const historyLines = history.length
        ? history.map(h => `  ${h.delta >= 0 ? "+" : ""}${h.delta} — ${escapeHtml(h.reason)}`).join("\n")
        : "  No activity yet";

      const isSelf = !repMatch?.[1] || repMatch[1].toLowerCase() === from.username?.toLowerCase();
      const displayName = lookupUsername ? `@${escapeHtml(lookupUsername)}` : `User ${lookupUserId}`;

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `${tier.emoji} <b>Reputation Profile</b>\n\n` +
          `👤 ${isSelf ? "You" : displayName}\n` +
          `🏅 Tier: <b>${tier.label}</b> ${tier.emoji}\n` +
          `⭐ Score: <b>${score} pts</b>\n` +
          `📈 Progress: ${progressBar}\n\n` +
          `📜 <b>Recent Activity:</b>\n${historyLines}\n\n` +
          `<i>💡 Earn rep: be active daily, report scammers accurately, help members.</i>`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /leaderboard — Top 10 members by reputation (public)
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/leaderboard(@\S+)?$/i)) {
      const top = await getTopRepUsers(10);

      if (!top.length) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⭐ <b>Reputation Leaderboard</b>\n\nNo scores yet — be the first to earn rep! 🏆`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const medals = ["🥇", "🥈", "🥉"];
      const lines = top.map((u, i) => {
        const tier  = getRepTier(u.score);
        const medal = medals[i] || `${i + 1}.`;
        const name  = u.username ? `@${escapeHtml(u.username)}` : `User ${u.userId}`;
        return `${medal} ${name} — ${tier.emoji} <b>${u.score} pts</b> (${tier.label})`;
      });

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `🏆 <b>Reputation Leaderboard</b>\n\n` +
          lines.join("\n") +
          `\n\n<i>Check yours: /rep | Earn rep: be helpful, stay active 🌟</i>`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /giverep @username [points] [reason]  — Admin only
    // ══════════════════════════════════════════════════════════
    const giveRepCmd = parseGiveRepCommand(message.text);
    if (giveRepCmd) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only admins can award reputation.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }

      const targetUserId = await getUserIdByUsername(giveRepCmd.username);
      if (!targetUserId) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⚠️ @${escapeHtml(giveRepCmd.username)} not found in cache.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const result = await addRepScore(targetUserId, giveRepCmd.points, `Admin award: ${giveRepCmd.reason}`);
      const tier   = result.newTier;

      let text =
        `⭐ <b>Reputation Awarded!</b>\n\n` +
        `👤 @${escapeHtml(giveRepCmd.username)}\n` +
        `💫 +${giveRepCmd.points} pts — <i>${escapeHtml(giveRepCmd.reason)}</i>\n` +
        `📊 New score: <b>${result.newScore} pts</b> — ${tier.emoji} ${tier.label}`;

      if (result.tierChanged) {
        text += `\n\n🎉 <b>Tier Up!</b> Now <b>${tier.label}</b> ${tier.emoji}`;
      }

      const r = await tgSendMessage({ chat_id: chat.id, text, reply_to_message_id: message.message_id });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /takerep @username [points] [reason]  — Admin only (penalty)
    // ══════════════════════════════════════════════════════════
    const takeRepCmd = parseTakeRepCommand(message.text);
    if (takeRepCmd) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only admins can adjust reputation.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }

      const targetUserId = await getUserIdByUsername(takeRepCmd.username);
      if (!targetUserId) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `⚠️ @${escapeHtml(takeRepCmd.username)} not found in cache.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const result = await addRepScore(targetUserId, -takeRepCmd.points, `Admin penalty: ${takeRepCmd.reason}`);
      const tier   = result.newTier;

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📉 <b>Reputation Deducted</b>\n\n` +
          `👤 @${escapeHtml(takeRepCmd.username)}\n` +
          `💔 -${takeRepCmd.points} pts — <i>${escapeHtml(takeRepCmd.reason)}</i>\n` +
          `📊 New score: <b>${result.newScore} pts</b> — ${tier.emoji} ${tier.label}`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // ⭐ /promote @username — Admin promotes top rep user to mod
    //   Awards a "Community Moderator" custom title
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/promote(?:@\S+)?\s+@?[a-zA-Z0-9_]{4,32}$/i)) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Only admins can promote members.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }

      const promoteMatch = message.text.trim().match(/^\/promote(?:@\S+)?\s+@?([a-zA-Z0-9_]{4,32})$/i);
      const promoUsername = promoteMatch?.[1];
      const targetUserId  = await getUserIdByUsername(promoUsername);

      if (!targetUserId) {
        await tgSendMessage({ chat_id: chat.id, text: `⚠️ @${escapeHtml(promoUsername)} not found.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }

      const score = await getRepScore(targetUserId);
      const tier  = getRepTier(score);

      // Require at least "Community Helper" tier (50 pts) to be promoted
      if (score < 50) {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `⚠️ <b>Insufficient Reputation</b>\n\n` +
            `@${escapeHtml(promoUsername)} has <b>${score} pts</b> (${tier.label}).\n\n` +
            `A minimum of <b>50 pts (🛡️ Community Helper)</b> is required for promotion.\n` +
            `They need ${50 - score} more points.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      // Promote with minimal rights + moderator title
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
          text: `❌ Promotion failed: ${escapeHtml(promoteRes?.description || "Unknown error")}`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      await new Promise(r => setTimeout(r, 1500));
      await tgApi("setChatAdministratorCustomTitle", {
        chat_id: chat.id, user_id: targetUserId, custom_title: "Community Moderator"
      });

      // Bonus rep for being promoted
      await addRepScore(targetUserId, 25, "Promoted to Community Moderator");

      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text:
            `🎖️ <b>[PROMOTION]</b>\n\n` +
            `@${escapeHtml(promoUsername)} promoted to Community Moderator\n` +
            `By: @${escapeHtml(from.username || String(from.id))}\n` +
            `Rep score: ${score} pts (${tier.label})\n` +
            `Date: ${new Date().toUTCString()}`
        });
      }

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `🎖️ <b>Promotion Announcement!</b>\n\n` +
          `🎉 Congratulations @${escapeHtml(promoUsername)}!\n\n` +
          `Based on your outstanding reputation of <b>${score} pts</b> (${tier.emoji} ${tier.label}), ` +
          `you've been promoted to <b>Community Moderator</b>! 🛡️\n\n` +
          `⭐ +25 bonus rep awarded\n\n` +
          `<i>Thank you for keeping this group safe and helpful. The community appreciates you! 💛</i>`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (H) /report
    // ══════════════════════════════════════════════════════════
    const reportCmd = parseReportCommand(message.text);
    if (reportCmd !== null) {
      let targetUsername = reportCmd.targetUsername;
      let reason         = reportCmd.reason;
      let evidenceMsgId  = null;

      if (message.reply_to_message) {
        const replyFrom = message.reply_to_message.from;
        evidenceMsgId   = message.reply_to_message.message_id;
        if (!replyFrom?.username) {
          await tgSendMessage({
            chat_id: chat.id,
            text: `⚠️ The user you replied to has no username.\nTry: <code>/report @username [reason]</code>`,
            reply_to_message_id: message.message_id
          });
          return res.status(200).send("ok");
        }
        targetUsername = replyFrom.username;
        const rawReason = message.text?.trim().match(/^\/report(?:@\S+)?(?:\s+(.+))?$/i);
        reason = rawReason?.[1]?.trim() || null;
      }

      if (!targetUsername) {
        await tgSendMessage({
          chat_id: chat.id,
          text:
            `ℹ️ <b>How to report</b>\n\n` +
            `Option 1 — Reply to their message:\n<code>/report [reason]</code>\n\n` +
            `Option 2 — Use username:\n<code>/report @username [reason]</code>`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      if (targetUsername.toLowerCase() === from?.username?.toLowerCase()) {
        await tgSendMessage({ chat_id: chat.id, text: `🤨 You can't report yourself.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }
      if (targetUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 You cannot report the group admin.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }

      let reporterVerified = false;
      if (from?.username) {
        const rv = await verifyUsernameApi(from.username);
        reporterVerified = rv?.verified === true;
      }

      const { alreadyReported, newScore } = await fileScamReport({
        targetUsername, reporterId: from.id, reporterUsername: from.username,
        reporterVerified, reason, chatId: chat.id, evidenceMsgId
      });

      if (alreadyReported) {
        await tgSendMessage({
          chat_id: chat.id,
          text: `ℹ️ You've already reported <b>@${escapeHtml(targetUsername)}</b>.\nAdmins are monitoring the situation.`,
          reply_to_message_id: message.message_id
        });
        return res.status(200).send("ok");
      }

      const reports = await getScamReports(targetUsername);
      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `📋 <b>Report Received</b>\n\n` +
          `👤 User: @${escapeHtml(targetUsername)}\n` +
          `📝 Reason: ${escapeHtml(reason || "Not specified")}\n` +
          `🔢 Total reports: ${reports.length}\n\n` +
          `<i>Admins notified. The report is anonymous. 🔒</i>`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);

      tgSendMessage({
        chat_id: from.id,
        text: `✅ <b>Report received</b>\n\nYou reported @${escapeHtml(targetUsername)}.\nIf confirmed, you'll earn <b>+${REP_GAINS.ACCURATE_REPORT} reputation</b>! 🛡️`
      }).catch(() => {});

      // Strike threshold actions
      if (newScore >= BAN_STRIKE_THRESHOLD) {
        const targetV = await verifyUsernameApi(targetUsername);
        if (!targetV?.verified) {
          const targetUserId = await getUserIdByUsername(targetUsername);
          if (targetUserId) {
            await banUser(chat.id, targetUserId);
            await addToBlacklist(targetUsername, { reason: "Auto-banned: community reports", chatId: chat.id, score: newScore });
            const banMsg = await tgSendMessage({
              chat_id: chat.id,
              text:
                `⛔ <b>User Auto-Banned</b>\n\n` +
                `@${escapeHtml(targetUsername)} removed from the group.\n` +
                `📊 Strike score: <b>${newScore}</b> — threshold exceeded.\n` +
                `🌐 Added to global blacklist. 🔐`
            });
            await saveBotMsgId(chat.id, banMsg?.result?.message_id);
            if (ADMIN_LOG_CHAT_ID) {
              await tgSendMessage({
                chat_id: ADMIN_LOG_CHAT_ID,
                text: `⛔ <b>[AUTO-BAN]</b> @${escapeHtml(targetUsername)}\nScore: ${newScore} | Reports: ${reports.length}\nUse /clearreport to reverse if false positive.`
              });
            }
          }
        }
      } else if (newScore >= MUTE_STRIKE_THRESHOLD) {
        const targetUserId = await getUserIdByUsername(targetUsername);
        if (targetUserId) {
          await muteUser(chat.id, targetUserId);
          const muteMsg = await tgSendMessage({
            chat_id: chat.id,
            text:
              `🔇 <b>User Muted Pending Review</b>\n\n` +
              `@${escapeHtml(targetUsername)} muted for <b>1 hour</b> while admins review.\n` +
              `📊 Strike score: <b>${newScore}</b>\n\n` +
              `<i>Admins: /clearreport @${escapeHtml(targetUsername)} to dismiss.</i>`
          });
          await saveBotMsgId(chat.id, muteMsg?.result?.message_id);
        }
      }

      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (I) /scamreports — Admin only
    // ══════════════════════════════════════════════════════════
    if (message.text?.match(/^\/scamreports(@\S+)?$/i)) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Admins only.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }
      const topReported = await getTopReported(10);
      if (!topReported.length) {
        await tgSendMessage({ chat_id: chat.id, text: `📊 <b>Scam Reports</b>\n\nNo reports filed yet. ✅`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }
      const lines = topReported.map((u, i) => {
        const status = u.confirmed ? "⛔ CONFIRMED" : `⚠️ Score: ${u.score}`;
        return `${i + 1}. @${escapeHtml(u.username)} — ${status} | ${u.reportCount} report(s)`;
      });
      const r = await tgSendMessage({
        chat_id: chat.id,
        text: `📊 <b>Top Reported Users</b>\n\n` + lines.join("\n") + `\n\n<i>/clearreport @user to dismiss | /confirmscam @user [tactics] to action</i>`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (J) /clearreport @username — Admin only
    // ══════════════════════════════════════════════════════════
    const clearTarget = parseClearReportCommand(message.text);
    if (clearTarget) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Admins only.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }
      await removeFromBlacklist(clearTarget);
      const targetUserId = await getUserIdByUsername(clearTarget);
      if (targetUserId) {
        await tgApi("restrictChatMember", {
          chat_id: chat.id, user_id: targetUserId,
          permissions: {
            can_send_messages: true, can_send_audios: true, can_send_documents: true,
            can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
            can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
            can_add_web_page_previews: true
          }
        });
      }
      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({ chat_id: ADMIN_LOG_CHAT_ID, text: `✅ <b>[CLEARED]</b> Reports against @${escapeHtml(clearTarget)} dismissed by @${escapeHtml(from.username || String(from.id))}` });
      }
      const r = await tgSendMessage({
        chat_id: chat.id,
        text: `✅ <b>Reports Cleared</b>\n\nAll reports against @${escapeHtml(clearTarget)} dismissed.\nIf muted, they can speak again. 🔓`,
        reply_to_message_id: message.message_id
      });
      await saveBotMsgId(chat.id, r?.result?.message_id);
      return res.status(200).send("ok");
    }

    // ══════════════════════════════════════════════════════════
    // (K) /confirmscam @username [tactics] — Admin only
    // ══════════════════════════════════════════════════════════
    const confirmCmd = parseConfirmScammerCommand(message.text);
    if (confirmCmd) {
      const senderIsAdmin = await isGroupAdmin(chat.id, from.id);
      if (!senderIsAdmin) {
        await tgSendMessage({ chat_id: chat.id, text: `🚫 Admins only.`, reply_to_message_id: message.message_id });
        return res.status(200).send("ok");
      }

      const { username: scammerUsername, tactics } = confirmCmd;
      await addToBlacklist(scammerUsername, { confirmedBy: from.username || from.id, tactics: tactics || "Not specified", chatId: chat.id });

      const targetUserId = await getUserIdByUsername(scammerUsername);
      if (targetUserId) await banUser(chat.id, targetUserId);

      // Reward reporters who got it right
      const reporters = await getReportersForTarget(scammerUsername);
      for (const reporterId of reporters) {
        const repResult = await addRepScore(reporterId, REP_GAINS.ACCURATE_REPORT, `Accurate report: @${scammerUsername} confirmed scammer`);
        // DM the reporter about their reward
        tgSendMessage({
          chat_id: reporterId,
          text:
            `🏆 <b>Report Confirmed!</b>\n\n` +
            `Your earlier report of @${escapeHtml(scammerUsername)} has been confirmed by admins.\n\n` +
            `⭐ You've earned <b>+${REP_GAINS.ACCURATE_REPORT} reputation points</b>!\n` +
            `📊 New score: <b>${repResult.newScore} pts</b> — ${repResult.newTier.emoji} ${repResult.newTier.label}\n\n` +
            `Thank you for keeping the community safe! 🛡️`
        }).catch(() => {});
      }

      if (ADMIN_LOG_CHAT_ID) {
        await tgSendMessage({
          chat_id: ADMIN_LOG_CHAT_ID,
          text:
            `⛔ <b>[CONFIRMED SCAMMER]</b>\n@${escapeHtml(scammerUsername)}\n` +
            `By: @${escapeHtml(from.username || String(from.id))}\n` +
            `Tactics: ${escapeHtml(tactics || "Not specified")}\n` +
            `Reporters rewarded: ${reporters.length}\n` +
            `Date: ${new Date().toUTCString()}`
        });
      }

      const r = await tgSendMessage({
        chat_id: chat.id,
        text:
          `⛔ <b>CONFIRMED SCAMMER</b>\n\n` +
          `👤 @${escapeHtml(scammerUsername)}\n` +
          `🎭 Tactics: ${escapeHtml(tactics || "Not specified")}\n` +
          `📅 ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}\n` +
          `🌐 Status: <b>Global blacklist — banned on entry</b>\n\n` +
          `⭐ ${reporters.length} member(s) who reported this user have been rewarded with reputation points.\n\n` +
          `⚠️ <i>If this person contacts you anywhere, block and ignore them.</i>`
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

    if (secSinceCheck >= SCHEDULED_CHECK_SEC) {
      await redis.set(schedCheckKey, nowTs);
      const lastBotMsgId = await getLastBotMsgId(chat.id);
      const msgGap       = lastBotMsgId ? currentMsgId - lastBotMsgId : SCHEDULED_MIN_MSG_GAP + 1;

      if (msgGap >= SCHEDULED_MIN_MSG_GAP) {
        const idx       = parseInt((await redis.get(schedIndexKey)) || "0", 10);
        const scheduled = SCHEDULED_MESSAGES[idx % SCHEDULED_MESSAGES.length];
        await redis.set(schedIndexKey, (idx + 1) % SCHEDULED_MESSAGES.length);
        const markup = scheduled.button ? verifyButton(scheduled.button) : undefined;
        const r = await tgSendMessage({ chat_id: chat.id, text: scheduled.text, reply_markup: markup });
        await saveBotMsgId(chat.id, r?.result?.message_id);
        return res.status(200).send("ok");
      }
    }

    return res.status(200).send("ok");

  } catch (e) {
    log.error("UNHANDLED_EXCEPTION", { message: e.message, stack: e.stack });
    return res.status(200).send("ok");
  }
}
