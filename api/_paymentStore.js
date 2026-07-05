import { Redis } from "@upstash/redis";

const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || "https://golden-sugar-daddy.vercel.app").replace(/\/+$/, "");
const PAYMENT_PAYPAL_URL = process.env.PAYMENT_PAYPAL_URL || "https://www.paypal.com/";
const PAYMENT_CARD_URL = process.env.PAYMENT_CARD_URL || "https://www.visa.com/";

export const PAYMENT_SERVICE_FEE = 120;
const PAYMENT_TTL_SECONDS = 60 * 60 * 24 * 30;
const OWNER_DRAFT_TTL_SECONDS = 60 * 30;

function createKvStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const redis = new Redis({ url, token });
    return {
      async get(key) {
        return redis.get(key);
      },
      async set(key, value, ttlSeconds) {
        return redis.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
      },
      async del(key) {
        return redis.del(key);
      }
    };
  }

  const memoryStore = globalThis.__goldenSugarPaymentStore || new Map();
  globalThis.__goldenSugarPaymentStore = memoryStore;

  return {
    async get(key) {
      return memoryStore.get(key) || null;
    },
    async set(key, value) {
      memoryStore.set(key, value);
      return true;
    },
    async del(key) {
      memoryStore.delete(key);
      return true;
    }
  };
}

const kvStore = createKvStore();

function paymentKey(reference) {
  return `payment-request:${String(reference).toUpperCase()}`;
}

function ownerDraftKey(chatId) {
  return `payment-draft:${chatId}`;
}

function applyTemplate(url, reference, amount) {
  return String(url)
    .replace(/\{ref\}/gi, encodeURIComponent(reference))
    .replace(/\{amount\}/gi, encodeURIComponent(amount.toFixed(2)));
}

export function buildPaymentReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `X${random}`;
}

export function parseAmountInput(rawValue) {
  const normalized = String(rawValue || "").replace(/[^0-9.]/g, "");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

export function buildPaymentLink(reference) {
  return `${PUBLIC_APP_URL}/payment?ref=${encodeURIComponent(reference)}`;
}

export function buildCheckoutUrls(reference, totalAmount) {
  return {
    paypal: applyTemplate(PAYMENT_PAYPAL_URL, reference, totalAmount),
    card: applyTemplate(PAYMENT_CARD_URL, reference, totalAmount)
  };
}

export function buildPaymentRecord({ recipientName, payerName, amount }) {
  const baseAmount = Math.round(amount * 100) / 100;
  const totalAmount = Math.round((baseAmount + PAYMENT_SERVICE_FEE) * 100) / 100;
  const reference = buildPaymentReference();

  return {
    reference,
    recipientName: String(recipientName || "").trim(),
    payerName: String(payerName || "").trim(),
    amount: baseAmount,
    serviceFee: PAYMENT_SERVICE_FEE,
    totalAmount,
    status: "pending",
    paymentUrl: buildPaymentLink(reference),
    checkoutUrls: buildCheckoutUrls(reference, totalAmount),
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

export function parsePaymentCompletionText(text = "") {
  const match = String(text).trim().match(/^([A-Z0-9-]{4,})\s+DONE$/i);
  if (!match) {
    return null;
  }
  return match[1].toUpperCase();
}

export async function getPaymentRecord(reference) {
  if (!reference) {
    return null;
  }
  return kvStore.get(paymentKey(reference));
}

export async function savePaymentRecord(record) {
  await kvStore.set(paymentKey(record.reference), record, PAYMENT_TTL_SECONDS);
  return record;
}

export async function markPaymentCompleted(reference) {
  const existing = await getPaymentRecord(reference);
  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    status: "completed",
    completedAt: existing.completedAt || new Date().toISOString()
  };

  await savePaymentRecord(updated);
  return updated;
}

export async function getOwnerPaymentDraft(chatId) {
  return kvStore.get(ownerDraftKey(chatId));
}

export async function saveOwnerPaymentDraft(chatId, draft) {
  return kvStore.set(ownerDraftKey(chatId), draft, OWNER_DRAFT_TTL_SECONDS);
}

export async function clearOwnerPaymentDraft(chatId) {
  return kvStore.del(ownerDraftKey(chatId));
}
