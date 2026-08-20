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
    description: "Validation is in progress while the final delivery confirmation is pending."
  },
  delivered: {
    label: "Delivered",
    description: "Amount delivered."
  }
};

const PAYOUT_METHODS = {
  bank_transfer: {
    code: "bank_transfer",
    label: "Bank Transfer",
    providerLabel: "Bank name",
    providerRequired: true,
    destinationLabel: "Bank account",
    destinationPlaceholder: "Checking or savings account number",
    hint: "Traditional payout routed to a checking or savings account."
  },
  paypal: {
    code: "paypal",
    label: "PayPal",
    providerLabel: "",
    providerRequired: false,
    destinationLabel: "PayPal email",
    destinationPlaceholder: "name@example.com",
    hint: "Popular email-based payout to a PayPal account."
  },
  zelle: {
    code: "zelle",
    label: "Zelle",
    providerLabel: "",
    providerRequired: false,
    destinationLabel: "Zelle email or phone",
    destinationPlaceholder: "name@example.com or +1 555 123 4567",
    hint: "Fast domestic payout using a Zelle-linked email or phone number."
  },
  venmo: {
    code: "venmo",
    label: "Venmo",
    providerLabel: "",
    providerRequired: false,
    destinationLabel: "Venmo username",
    destinationPlaceholder: "@username",
    hint: "Use the receiver's public Venmo username."
  },
  cash_app: {
    code: "cash_app",
    label: "Cash App",
    providerLabel: "",
    providerRequired: false,
    destinationLabel: "Cash App tag",
    destinationPlaceholder: "$cashtag",
    hint: "Popular instant payout using a Cash App $Cashtag."
  },
  wise: {
    code: "wise",
    label: "Wise",
    providerLabel: "",
    providerRequired: false,
    destinationLabel: "Wise email",
    destinationPlaceholder: "name@example.com",
    hint: "Useful for cross-border payouts through Wise."
  }
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

function getPayoutMethodConfig(methodCode = "bank_transfer") {
  return PAYOUT_METHODS[methodCode] || null;
}

function maskGenericHandle(value, prefix = "") {
  const compact = String(value || "").trim();
  if (!compact) {
    return "";
  }

  const visibleStart = compact.length <= 6 ? 1 : 2;
  const visibleEnd = compact.length <= 6 ? 1 : 2;
  const maskedCore = compact.length <= visibleStart + visibleEnd
    ? compact
    : `${compact.slice(0, visibleStart)}***${compact.slice(-visibleEnd)}`;

  return `${prefix}${maskedCore}`;
}

function maskEmailAddress(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) {
    return normalized;
  }

  return `${maskGenericHandle(localPart)}@${domain}`;
}

function maskPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.length <= 4) {
    return digits;
  }

  return `***-***-${digits.slice(-4)}`;
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeProviderName(rawValue) {
  return String(rawValue || "").trim();
}

function normalizeDestinationForMethod(methodCode, rawValue) {
  const value = String(rawValue || "").trim();

  switch (methodCode) {
    case "bank_transfer": {
      const compact = value.replace(/[^0-9A-Za-z]/g, "");
      if (compact.length < 6) {
        throw new PaymentStoreError(400, "Bank account number must be at least 6 characters.");
      }
      return compact;
    }
    case "paypal":
    case "wise": {
      const email = value.toLowerCase();
      if (!isLikelyEmail(email)) {
        throw new PaymentStoreError(400, `${getPayoutMethodConfig(methodCode).label} requires a valid email address.`);
      }
      return email;
    }
    case "zelle": {
      if (isLikelyEmail(value)) {
        return value.toLowerCase();
      }

      const digits = value.replace(/\D/g, "");
      if (digits.length < 10) {
        throw new PaymentStoreError(400, "Zelle requires a valid email address or phone number.");
      }
      return digits;
    }
    case "venmo": {
      const handle = value.replace(/^@+/, "");
      if (!/^[A-Za-z0-9_.-]{3,30}$/.test(handle)) {
        throw new PaymentStoreError(400, "Venmo requires a valid username.");
      }
      return handle;
    }
    case "cash_app": {
      const handle = value.replace(/^\$+/, "");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) {
        throw new PaymentStoreError(400, "Cash App requires a valid $Cashtag.");
      }
      return handle;
    }
    default:
      throw new PaymentStoreError(400, "Unsupported payout method.");
  }
}

function maskDestinationForMethod(methodCode, normalizedValue) {
  switch (methodCode) {
    case "bank_transfer":
      return maskBankAccountNumber(normalizedValue);
    case "paypal":
    case "wise":
      return maskEmailAddress(normalizedValue);
    case "zelle":
      return isLikelyEmail(normalizedValue)
        ? maskEmailAddress(normalizedValue)
        : maskPhoneNumber(normalizedValue);
    case "venmo":
      return maskGenericHandle(normalizedValue.replace(/^@+/, ""), "@");
    case "cash_app":
      return maskGenericHandle(normalizedValue.replace(/^\$+/, ""), "$");
    default:
      return String(normalizedValue || "");
  }
}

export function getPublicPayoutMethods() {
  return Object.values(PAYOUT_METHODS).map((method) => ({
    code: method.code,
    label: method.label,
    providerLabel: method.providerLabel,
    providerRequired: method.providerRequired,
    destinationLabel: method.destinationLabel,
    destinationPlaceholder: method.destinationPlaceholder,
    hint: method.hint
  }));
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

export function parsePaymentDeliveredText(text = "") {
  const match = String(text).trim().match(/^([A-Z0-9-]{4,})\s+DELIVERED$/i);
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
  const deliveredDate = schedule.deliveredAt
    ? startOfUtcDay(schedule.deliveredAt)
    : addUtcDays(startDate, 7);
  const currentStageKey = schedule.deliveredAt
    ? "delivered"
    : today < startDate
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
    validation: formatDateOnly(validationDate),
    delivered: formatDateOnly(deliveredDate)
  };

  const order = ["scheduled", "received", "dispatched", "validation", "delivered"];
  const currentIndex = order.indexOf(currentStageKey);
  const stages = order.map((key, index) => ({
    key,
    label: SCHEDULER_STAGE_COPY[key].label,
    description: SCHEDULER_STAGE_COPY[key].description,
    date: stageDates[key],
    state: index < currentIndex ? "complete" : index === currentIndex ? "active" : "upcoming"
  }));

  const nextStageKey = currentStageKey === "delivered"
    ? null
    : order[Math.min(currentIndex + 1, order.length - 1)];

  const payoutMethod = schedule.payoutMethod || "bank_transfer";
  const methodConfig = getPayoutMethodConfig(payoutMethod) || PAYOUT_METHODS.bank_transfer;
  const providerName = schedule.providerName || schedule.bankName || "";
  const destinationMasked = schedule.destinationMasked || schedule.bankAccountMasked || "";

  return {
    payoutMethod,
    payoutMethodLabel: schedule.payoutMethodLabel || methodConfig.label,
    providerLabel: methodConfig.providerLabel,
    providerName,
    destinationLabel: schedule.destinationLabel || methodConfig.destinationLabel,
    destinationMasked,
    accountHolder: schedule.accountHolder,
    startDate: schedule.startDate,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
    deliveredAt: schedule.deliveredAt || null,
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
    publicNote: schedule.deliveredAt
      ? `Delivered was manually confirmed by the admin on ${stageDates.delivered}.`
      : `Delivered will remain pending until the admin manually marks the payout as delivered.`
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
      supportedMethods: getPublicPayoutMethods(),
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

export async function markPaymentDelivered(reference, now = new Date()) {
  const existing = await getPaymentRecord(reference);
  if (!existing || existing.status !== "completed" || !existing.schedule) {
    return null;
  }

  const timestamp = new Date(now).toISOString();
  const updated = {
    ...existing,
    schedule: {
      ...existing.schedule,
      deliveredAt: existing.schedule.deliveredAt || timestamp,
      updatedAt: timestamp
    }
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

  const payoutMethod = String(
    scheduleInput.method ||
    record.schedule?.payoutMethod ||
    "bank_transfer"
  ).trim().toLowerCase();
  const methodConfig = getPayoutMethodConfig(payoutMethod);
  const providerName = normalizeProviderName(scheduleInput.providerName);
  const accountHolder = String(scheduleInput.accountHolder || "").trim();
  const destinationValue = String(scheduleInput.destinationValue || "").trim();
  const startDate = validateScheduleStartDate(scheduleInput.startDate, now);
  const existingScheduleMethod = record.schedule?.payoutMethod || (record.schedule?.bankAccountMasked ? "bank_transfer" : "");
  const existingDestinationMasked = existingScheduleMethod === payoutMethod
    ? (record.schedule?.destinationMasked || record.schedule?.bankAccountMasked || "")
    : "";

  if (!methodConfig) {
    throw new PaymentStoreError(400, "Unsupported payout method.");
  }

  if (methodConfig.providerRequired && providerName.length < 2) {
    throw new PaymentStoreError(400, `${methodConfig.providerLabel} is required.`);
  }

  if (accountHolder.length < 2) {
    throw new PaymentStoreError(400, "Account holder name is required.");
  }

  if (!destinationValue && !existingDestinationMasked) {
    throw new PaymentStoreError(400, `${methodConfig.destinationLabel} is required.`);
  }

  const destinationMasked = destinationValue
    ? maskDestinationForMethod(payoutMethod, normalizeDestinationForMethod(payoutMethod, destinationValue))
    : existingDestinationMasked;

  const timestamp = new Date(now).toISOString();
  const updated = {
    ...record,
    schedule: {
      payoutMethod,
      payoutMethodLabel: methodConfig.label,
      providerName,
      destinationLabel: methodConfig.destinationLabel,
      destinationMasked,
      accountHolder,
      startDate,
      scheduledAmount: formatMoneyNumber(record.amount),
      recipientName: record.recipientName,
      createdAt: record.schedule?.createdAt || timestamp,
      updatedAt: timestamp,
      deliveredAt: record.schedule?.deliveredAt || null
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
