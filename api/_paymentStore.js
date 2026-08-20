import { Redis } from "@upstash/redis";

const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || "https://golden-sugar-daddy.vercel.app").replace(/\/+$/, "");
const PAYMENT_CARD_URL = process.env.PAYMENT_CARD_URL || "";

export const PAYMENT_SERVICE_FEE = 120;
const PAYMENT_TTL_SECONDS = 60 * 60 * 24 * 30;
const OWNER_DRAFT_TTL_SECONDS = 60 * 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEDULER_STAGE_COPY = {
  scheduled: {
    label: "Scheduled",
    description: "Your payout plan is saved and waiting for its start date."
  },
  received: {
    label: "Payment Received",
    description: "Funds have been received and set aside for the receiver."
  },
  dispatched: {
    label: "Dispatched",
    description: "The scheduled payout has been dispatched for internal processing."
  },
  validation: {
    label: "Validation",
    description: "Validation is in progress. Public tracking remains locked on this stage."
  }
};

const HIDDEN_STAGE_COPY = {
  key: "delivered",
  label: "Delivered",
  description: "This internal final stage stays hidden from the public portal."
};

export class PaymentStoreError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "PaymentStoreError";
    this.statusCode = statusCode;
  }
}

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

function startOfUtcDay(dateLike = new Date()) {
  const date = new Date(dateLike);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + (days * DAY_MS));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatMoneyNumber(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function maskBankAccountNumber(value) {
  const compact = String(value || "").replace(/[^0-9A-Za-z]/g, "");
  if (!compact) {
    return "";
  }
  if (compact.length <= 4) {
    return compact;
  }
  return `•••• ${compact.slice(-4)}`;
}

export function buildPaymentReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `X${random}`;
}

export function buildScheduleVerificationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
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

export function buildCardCheckoutUrl(reference, totalAmount) {
  return PAYMENT_CARD_URL ? applyTemplate(PAYMENT_CARD_URL, reference, totalAmount) : "";
}

export function buildPaymentRecord({ recipientName, payerName, amount }) {
  const baseAmount = formatMoneyNumber(amount);
  const totalAmount = formatMoneyNumber(baseAmount + PAYMENT_SERVICE_FEE);
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
    cardCheckoutUrl: buildCardCheckoutUrl(reference, totalAmount),
    createdAt: new Date().toISOString(),
    completedAt: null,
    scheduleVerificationCode: null,
    scheduleVerificationIssuedAt: null,
    schedule: null
  };
}

export function parsePaymentCompletionText(text = "") {
  const match = String(text).trim().match(/^([A-Z0-9-]{4,})\s+DONE$/i);
  if (!match) {
    return null;
  }
  return match[1].toUpperCase();
}

export function normalizeScheduleVerificationCode(rawValue = "") {
  return String(rawValue || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function isScheduleVerificationCodeValid(record, rawCode) {
  const provided = normalizeScheduleVerificationCode(rawCode);
  const expected = normalizeScheduleVerificationCode(record?.scheduleVerificationCode || "");
  return Boolean(provided && expected && provided === expected);
}

export function validateScheduleStartDate(rawValue, now = new Date()) {
  const date = parseDateOnly(rawValue);
  if (!date) {
    throw new PaymentStoreError(400, "Start date must use YYYY-MM-DD.");
  }

  const today = startOfUtcDay(now);
  if (date < today) {
    throw new PaymentStoreError(400, "Start date must be today or later.");
  }

  return formatDateOnly(date);
}

export function buildScheduleStatus(schedule, now = new Date()) {
  if (!schedule) {
    return null;
  }

  const startDate = parseDateOnly(schedule.startDate);
  if (!startDate) {
    return null;
  }

  const today = startOfUtcDay(now);
  const receivedDate = startDate;
  const dispatchedDate = addUtcDays(startDate, 3);
  const validationDate = addUtcDays(startDate, 5);
  const currentStageKey = today < startDate
    ? "scheduled"
    : today >= validationDate
      ? "validation"
      : today >= dispatchedDate
        ? "dispatched"
        : "received";

  const stageDates = {
    scheduled: schedule.createdAt ? schedule.createdAt.slice(0, 10) : formatDateOnly(today),
    received: formatDateOnly(receivedDate),
    dispatched: formatDateOnly(dispatchedDate),
    validation: formatDateOnly(validationDate)
  };

  const order = ["scheduled", "received", "dispatched", "validation"];
  const currentIndex = order.indexOf(currentStageKey);
  const stages = order.map((key, index) => ({
    key,
    label: SCHEDULER_STAGE_COPY[key].label,
    description: SCHEDULER_STAGE_COPY[key].description,
    date: stageDates[key],
    state: index < currentIndex ? "complete" : index === currentIndex ? "active" : "upcoming"
  }));

  const nextStageKey = currentStageKey === "validation"
    ? null
    : order[Math.min(currentIndex + 1, order.length - 1)];

  return {
    bankName: schedule.bankName,
    accountHolder: schedule.accountHolder,
    bankAccountMasked: schedule.bankAccountMasked,
    startDate: schedule.startDate,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
    scheduledAmount: schedule.scheduledAmount,
    recipientName: schedule.recipientName,
    currentStage: {
      key: currentStageKey,
      label: SCHEDULER_STAGE_COPY[currentStageKey].label,
      description: SCHEDULER_STAGE_COPY[currentStageKey].description,
      date: stageDates[currentStageKey]
    },
    nextStage: nextStageKey
      ? {
          key: nextStageKey,
          label: SCHEDULER_STAGE_COPY[nextStageKey].label,
          date: stageDates[nextStageKey]
        }
      : null,
    stages,
    hiddenStage: HIDDEN_STAGE_COPY,
    publicNote: "Public tracking intentionally stops at Validation. The hidden Delivered stage is never shown as complete here."
  };
}

export function buildPublicPaymentRecord(record, now = new Date()) {
  const scheduleStatus = buildScheduleStatus(record?.schedule, now);

  return {
    reference: record.reference,
    recipientName: record.recipientName,
    payerName: record.payerName,
    amount: record.amount,
    serviceFee: record.serviceFee,
    totalAmount: record.totalAmount,
    status: record.status,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    paymentUrl: record.paymentUrl,
    cardCheckoutUrl: record.cardCheckoutUrl || "",
    scheduler: {
      available: record.status === "completed",
      verificationIssuedAt: record.scheduleVerificationIssuedAt || record.completedAt || null,
      payoutRecipient: record.recipientName,
      payoutAmount: record.amount,
      retainedFee: record.serviceFee,
      totalCollected: record.totalAmount,
      hasSchedule: Boolean(scheduleStatus),
      schedule: scheduleStatus
    }
  };
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
    completedAt: existing.completedAt || new Date().toISOString(),
    scheduleVerificationCode: existing.scheduleVerificationCode || buildScheduleVerificationCode(),
    scheduleVerificationIssuedAt: existing.scheduleVerificationIssuedAt || new Date().toISOString()
  };

  await savePaymentRecord(updated);
  return updated;
}

export async function verifyScheduleAccess(reference, verificationCode) {
  const record = await getPaymentRecord(reference);
  if (!record) {
    throw new PaymentStoreError(404, "Payment request not found.");
  }

  if (record.status !== "completed") {
    throw new PaymentStoreError(409, "Payment must be approved before scheduling can begin.");
  }

  if (!isScheduleVerificationCodeValid(record, verificationCode)) {
    throw new PaymentStoreError(401, "Verification code is invalid.");
  }

  return record;
}

export async function upsertPaymentSchedule(reference, scheduleInput = {}, now = new Date()) {
  const record = await verifyScheduleAccess(reference, scheduleInput.verificationCode);

  const bankName = String(scheduleInput.bankName || "").trim();
  const accountHolder = String(scheduleInput.accountHolder || "").trim();
  const accountNumber = String(scheduleInput.accountNumber || "").replace(/[^0-9A-Za-z]/g, "");
  const startDate = validateScheduleStartDate(scheduleInput.startDate, now);

  if (bankName.length < 2) {
    throw new PaymentStoreError(400, "Bank name is required.");
  }

  if (accountHolder.length < 2) {
    throw new PaymentStoreError(400, "Account holder name is required.");
  }

  if (!accountNumber && !record.schedule?.bankAccountMasked) {
    throw new PaymentStoreError(400, "Bank account number is required.");
  }

  if (accountNumber && accountNumber.length < 6) {
    throw new PaymentStoreError(400, "Bank account number must be at least 6 characters.");
  }

  const timestamp = new Date(now).toISOString();
  const updated = {
    ...record,
    schedule: {
      bankName,
      accountHolder,
      bankAccountMasked: accountNumber
        ? maskBankAccountNumber(accountNumber)
        : record.schedule?.bankAccountMasked || "",
      startDate,
      scheduledAmount: formatMoneyNumber(record.amount),
      recipientName: record.recipientName,
      createdAt: record.schedule?.createdAt || timestamp,
      updatedAt: timestamp
    }
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
