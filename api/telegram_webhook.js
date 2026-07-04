import { Redis } from "@upstash/redis";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || process.env.ADMIN_LOG_CHAT_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || process.env.ADMIN_USERNAME || "GoldenSugarAdmin";
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || "https://golden-sugar-daddy.vercel.app").replace(/\/+$/, "");

const SESSION_TTL_SECONDS = 60 * 60 * 6;

const LANGUAGE_OPTIONS = [
  { code: "en", label: "🇬🇧 English" },
  { code: "es", label: "🇪🇸 Español" },
  { code: "fr", label: "🇫🇷 Français" },
  { code: "ru", label: "🇷🇺 Русский" },
  { code: "hi", label: "🇮🇳 हिन्दी" },
  { code: "fa", label: "🇮🇷 فارسی" },
  { code: "it", label: "🇮🇹 Italiano" },
  { code: "de", label: "🇩🇪 Deutsch" }
];

const BASE_COPY = {
  languagePrompt: "Choose your language to begin. The bot will guide you step by step.",
  selectedLanguage: "Language selected. Let's keep this simple.",
  welcome:
    "Golden Sugar Daddy, founded in 2023, is described as a verified Sugar Daddy and Sugar Baby platform with detailed verification for Sugar Daddies and liveness checks for Sugar Babies.\n\n" +
    "If you are a Sugar Baby, you do not pay anything during the process. The Sugar Daddy is responsible for the service fee, so it is completely free for Sugar Babies.\n\n" +
    "Just answer one small question at a time.",
  textHint: "Type a quick answer below.",
  choiceHint: "Tap one option below.",
  photoHint: "Send a photo now, or tap Skip if you want.",
  invalidText: "Please type your answer so I can continue.",
  invalidPhoto: "Please send a photo for this step, or tap Skip if you want to skip it.",
  commandHint: "Send /start anytime to restart the form.",
  restartNotice: "The form has been restarted. Please choose your language again.",
  notAgreed: "No problem. Since you did not agree to the terms, your form was not submitted. Send /start if you want to begin again.",
  success: `Thanks. Your profile has been submitted successfully to @${OWNER_USERNAME}.`,
  ownerTitle: "New Sugar Baby profile submission",
  ownerPhotoCaption: "Submitted photo",
  ownerLanguage: "Language",
  ownerUser: "User",
  ownerUsername: "Username",
  ownerUserId: "User ID",
  ownerChatId: "Chat ID",
  ownerSubmittedAt: "Submitted At",
  ownerResponses: "Responses",
  termsPrompt: "Please read the sample terms first, then tell me if you agree and want to submit.",
  termsLinkLabel: "Read Terms",
  skipLabel: "Skip",
  yes: "Yes",
  no: "No",
  unknownCommand: "Send /start to restart the guided form."
};

const COPY = {
  en: { ...BASE_COPY },
  es: { ...BASE_COPY, selectedLanguage: "Idioma seleccionado. Vamos a hacerlo facil.", yes: "Si", skipLabel: "Omitir", languagePrompt: "Elige tu idioma para comenzar. El bot te guiara paso a paso.", restartNotice: "El formulario se reinicio. Elige tu idioma otra vez.", termsLinkLabel: "Leer Terminos" },
  fr: { ...BASE_COPY, selectedLanguage: "Langue selectionnee. Restons simples.", yes: "Oui", no: "Non", skipLabel: "Passer", languagePrompt: "Choisissez votre langue pour commencer. Le bot vous guidera etape par etape.", termsLinkLabel: "Lire les Conditions" },
  ru: { ...BASE_COPY, selectedLanguage: "Язык выбран. Сделаем все просто.", yes: "Да", no: "Нет", skipLabel: "Пропустить", languagePrompt: "Выберите язык, чтобы начать. Бот проведет вас шаг за шагом.", termsLinkLabel: "Читать Условия" },
  hi: { ...BASE_COPY, selectedLanguage: "Language select ho gayi. Chaliye simple rakhte hain.", languagePrompt: "Shuru karne ke liye apni language chuniye. Bot aapko step by step guide karega.", termsLinkLabel: "Terms Padhein" },
  fa: { ...BASE_COPY, selectedLanguage: "زبان انتخاب شد. بیایید ساده پیش برویم.", yes: "بله", no: "خیر", skipLabel: "رد کردن", languagePrompt: "برای شروع زبان خود را انتخاب کنید. ربات شما را مرحله به مرحله راهنمایی می کند.", termsLinkLabel: "مطالعه شرایط" },
  it: { ...BASE_COPY, selectedLanguage: "Lingua selezionata. Facciamolo in modo semplice.", yes: "Si", skipLabel: "Salta", languagePrompt: "Scegli la tua lingua per iniziare. Il bot ti guidera passo dopo passo.", termsLinkLabel: "Leggi i Termini" },
  de: { ...BASE_COPY, selectedLanguage: "Sprache ausgewaehlt. Wir halten es einfach.", yes: "Ja", no: "Nein", skipLabel: "Ueberspringen", languagePrompt: "Waehle deine Sprache, um zu beginnen. Der Bot fuehrt dich Schritt fuer Schritt.", termsLinkLabel: "AGB lesen" }
};

const STEP_DEFINITIONS = [
  { id: "firstTime", kind: "yesno", labels: { en: "Are you being a Sugar Baby for the first time?", es: "Es tu primera vez como Sugar Baby?", fr: "Est-ce votre premiere fois comme Sugar Baby ?", ru: "Это ваш первый раз как Sugar Baby?", hi: "Kya aap pehli baar Sugar Baby ban rahi hain?", fa: "آیا این اولین بار شما به عنوان Sugar Baby است؟", it: "E la tua prima volta come Sugar Baby?", de: "Ist es dein erstes Mal als Sugar Baby?" } },
  { id: "name", kind: "text", labels: { en: "Name/Nickname", es: "Nombre o Apodo", fr: "Nom ou Surnom", ru: "Имя или Ник", hi: "Name/Nickname", fa: "نام یا لقب", it: "Nome o Soprannome", de: "Name/Spitzname" } },
  { id: "age", kind: "text", labels: { en: "Age", es: "Edad", fr: "Age", ru: "Возраст", hi: "Age", fa: "سن", it: "Eta", de: "Alter" } },
  { id: "location", kind: "text", labels: { en: "Location", es: "Ubicacion", fr: "Localisation", ru: "Локация", hi: "Location", fa: "موقعیت", it: "Posizione", de: "Standort" } },
  { id: "height", kind: "text", labels: { en: "Height", es: "Altura", fr: "Taille", ru: "Рост", hi: "Height", fa: "قد", it: "Altezza", de: "Groesse" } },
  { id: "weight", kind: "text", labels: { en: "Weight", es: "Peso", fr: "Poids", ru: "Вес", hi: "Weight", fa: "وزن", it: "Peso", de: "Gewicht" } },
  { id: "breastSize", kind: "text", labels: { en: "Breast Size", es: "Tamano de Pecho", fr: "Taille de Poitrine", ru: "Размер груди", hi: "Breast Size", fa: "سایز سینه", it: "Taglia del Seno", de: "Brustgroesse" } },
  { id: "buttSize", kind: "choice", options: ["small", "medium", "large"], labels: { en: "Butt Size", es: "Tamano de Gluteos", fr: "Taille des Fesses", ru: "Размер ягодиц", hi: "Butt Size", fa: "اندازه باسن", it: "Taglia dei Glutei", de: "Po-Groesse" } },
  { id: "ethnicity", kind: "text", labels: { en: "Ethnicity", es: "Etnia", fr: "Origine Ethnique", ru: "Этничность", hi: "Ethnicity", fa: "قومیت", it: "Etnia", de: "Ethnie" } },
  { id: "occupation", kind: "text", labels: { en: "Occupation/Student", es: "Ocupacion/Estudiante", fr: "Profession/Etudiante", ru: "Работа/Учеба", hi: "Occupation/Student", fa: "شغل/دانشجو", it: "Occupazione/Studentessa", de: "Beruf/Studentin" } },
  { id: "arrangement", kind: "choice", options: ["short_term", "long_term", "others"], labels: { en: "Preferred Type of Arrangement", es: "Tipo de Arreglo Preferido", fr: "Type d'Arrangement Prefere", ru: "Предпочитаемый формат отношений", hi: "Preferred Type of Arrangement", fa: "نوع ترجیحی رابطه", it: "Tipo di Accordo Preferito", de: "Bevorzugte Art der Vereinbarung" } },
  { id: "arrangementOther", kind: "text", labels: { en: "If Others, please type it", es: "Si es Otro, escribelo", fr: "Si autre, ecrivez-le", ru: "Если другое, напишите", hi: "Agar Others hai to type kijiye", fa: "اگر مورد دیگر است، بنویسید", it: "Se Altro, scrivilo", de: "Wenn Andere, bitte schreiben" } },
  { id: "allowance", kind: "text", labels: { en: "Allowance Expectation", es: "Expectativa de Asignacion", fr: "Attente d'Allocation", ru: "Ожидание по allowance", hi: "Allowance Expectation", fa: "انتظار مالی", it: "Aspettativa di Allowance", de: "Allowance-Erwartung" } },
  { id: "boundaries", kind: "text", labels: { en: "Boundaries & Restrictions", es: "Limites y Restricciones", fr: "Limites et Restrictions", ru: "Границы и ограничения", hi: "Boundaries & Restrictions", fa: "مرزها و محدودیت ها", it: "Limiti e Restrizioni", de: "Grenzen und Einschraenkungen" } },
  { id: "facePhoto", kind: "photo_optional", labels: { en: "Clear Face Photo", es: "Foto Clara del Rostro", fr: "Photo Claire du Visage", ru: "Четкое фото лица", hi: "Clear Face Photo", fa: "عکس واضح چهره", it: "Foto Chiara del Viso", de: "Klares Gesichtsfoto" } },
  { id: "fullBodyPhoto", kind: "photo_optional", labels: { en: "Full-Body Photo", es: "Foto de Cuerpo Completo", fr: "Photo en Pied", ru: "Фото в полный рост", hi: "Full-Body Photo", fa: "عکس تمام قد", it: "Foto a Figura Intera", de: "Ganzkoerperfoto" } },
  { id: "extraPhoto", kind: "photo_optional", labels: { en: "Optional Additional Photo", es: "Foto Adicional Opcional", fr: "Photo Supplementaire Facultative", ru: "Дополнительное фото", hi: "Optional Additional Photo", fa: "عکس اضافی اختیاری", it: "Foto Aggiuntiva Facoltativa", de: "Optionales Zusatzfoto" } },
  { id: "terms", kind: "terms", labels: { en: "Terms Agreement", es: "Aceptacion de Terminos", fr: "Accord des Conditions", ru: "Согласие с условиями", hi: "Terms Agreement", fa: "توافق با شرایط", it: "Accordo ai Termini", de: "Zustimmung zu den Bedingungen" } }
];

const OPTION_LABELS = {
  buttSize: {
    small: { en: "Small", es: "Pequeno", fr: "Petit", ru: "Маленький", hi: "Small", fa: "کوچک", it: "Piccolo", de: "Klein" },
    medium: { en: "Medium", es: "Mediano", fr: "Moyen", ru: "Средний", hi: "Medium", fa: "متوسط", it: "Medio", de: "Mittel" },
    large: { en: "Large", es: "Grande", fr: "Grand", ru: "Большой", hi: "Large", fa: "بزرگ", it: "Grande", de: "Gross" }
  },
  arrangement: {
    short_term: { en: "Short Term", es: "Corto Plazo", fr: "Court Terme", ru: "Краткосрочно", hi: "Short Term", fa: "کوتاه مدت", it: "Breve Termine", de: "Kurzfristig" },
    long_term: { en: "Long Term", es: "Largo Plazo", fr: "Long Terme", ru: "Долгосрочно", hi: "Long Term", fa: "بلندمدت", it: "Lungo Termine", de: "Langfristig" },
    others: { en: "Others", es: "Otro", fr: "Autre", ru: "Другое", hi: "Others", fa: "سایر", it: "Altro", de: "Andere" }
  }
};

const CALLBACK_PREFIXES = {
  language: "lang",
  choice: "choice",
  skip: "skip"
};

function createSessionStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const redis = new Redis({ url, token });
    return {
      async get(chatId) {
        return redis.get(`form-session:${chatId}`);
      },
      async set(chatId, session) {
        return redis.set(`form-session:${chatId}`, session, { ex: SESSION_TTL_SECONDS });
      },
      async del(chatId) {
        return redis.del(`form-session:${chatId}`);
      }
    };
  }

  const memoryStore = globalThis.__goldenSugarBotSessions || new Map();
  globalThis.__goldenSugarBotSessions = memoryStore;

  return {
    async get(chatId) {
      return memoryStore.get(String(chatId)) || null;
    },
    async set(chatId, session) {
      memoryStore.set(String(chatId), session);
      return true;
    },
    async del(chatId) {
      memoryStore.delete(String(chatId));
      return true;
    }
  };
}

const sessionStore = createSessionStore();

function getCopy(languageCode = "en") {
  return COPY[languageCode] || COPY.en;
}

function getStepDefinition(stepIndex) {
  return STEP_DEFINITIONS[stepIndex] || null;
}

function getStepLabel(step, languageCode) {
  return step?.labels?.[languageCode] || step?.labels?.en || step?.id || "Field";
}

function getOptionLabel(stepId, option, languageCode) {
  return OPTION_LABELS?.[stepId]?.[option]?.[languageCode] || OPTION_LABELS?.[stepId]?.[option]?.en || option;
}

function getTermsUrl() {
  return `${PUBLIC_APP_URL}/terms`;
}

function createInitialSession(languageCode) {
  return {
    languageCode,
    stepIndex: 0,
    answers: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function touchSession(session) {
  return { ...session, updatedAt: new Date().toISOString() };
}

function getNextStepIndex(currentStep, value, currentIndex) {
  if (currentStep?.id === "arrangement" && value !== "others") {
    return currentIndex + 2;
  }
  return currentIndex + 1;
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isTelegramCommand(text = "") {
  return /^\/[a-zA-Z0-9_]+(?:@\S+)?(?:\s|$)/.test(String(text).trim());
}

export function buildLanguagePrompt() {
  return `${COPY.en.languagePrompt}\n\n${COPY.en.commandHint}`;
}

export function buildLanguageKeyboard() {
  const rows = [];
  for (let index = 0; index < LANGUAGE_OPTIONS.length; index += 2) {
    rows.push(
      LANGUAGE_OPTIONS.slice(index, index + 2).map((language) => ({
        text: language.label,
        callback_data: `${CALLBACK_PREFIXES.language}:${language.code}`
      }))
    );
  }
  return { inline_keyboard: rows };
}

export function buildWelcomeMessage(languageCode) {
  return getCopy(languageCode).welcome;
}

export function buildStepPrompt(session) {
  const languageCode = session?.languageCode || "en";
  const copy = getCopy(languageCode);
  const step = getStepDefinition(session?.stepIndex || 0);

  if (!step) {
    return copy.unknownCommand;
  }

  const label = getStepLabel(step, languageCode);

  let hint = copy.textHint;
  if (step.kind === "choice" || step.kind === "yesno") {
    hint = copy.choiceHint;
  } else if (step.kind === "photo_optional") {
    hint = copy.photoHint;
  } else if (step.kind === "terms") {
    hint = copy.termsPrompt;
  }

  return `${label}\n\n${hint}`;
}

export function buildStepKeyboard(step, languageCode) {
  const copy = getCopy(languageCode);

  if (!step) {
    return undefined;
  }

  if (step.kind === "yesno") {
    return {
      inline_keyboard: [[
        { text: copy.yes, callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:yes` },
        { text: copy.no, callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:no` }
      ]]
    };
  }

  if (step.kind === "choice") {
    return {
      inline_keyboard: step.options.map((option) => ([{
        text: getOptionLabel(step.id, option, languageCode),
        callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:${option}`
      }]))
    };
  }

  if (step.kind === "photo_optional") {
    return {
      inline_keyboard: [[{ text: copy.skipLabel, callback_data: `${CALLBACK_PREFIXES.skip}:${step.id}` }]]
    };
  }

  if (step.kind === "terms") {
    return {
      inline_keyboard: [
        [{ text: copy.termsLinkLabel, url: getTermsUrl() }],
        [
          { text: copy.yes, callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:yes` },
          { text: copy.no, callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:no` }
        ]
      ]
    };
  }

  return undefined;
}

function normalizeAnswerValue(step, value, languageCode) {
  if (!step) {
    return value;
  }

  if (step.kind === "yesno" || step.kind === "terms") {
    return value === "yes" ? getCopy(languageCode).yes : getCopy(languageCode).no;
  }

  if (step.kind === "choice") {
    return getOptionLabel(step.id, value, languageCode);
  }

  if (step.kind === "photo_optional" && value === "skipped") {
    return getCopy(languageCode).skipLabel;
  }

  return value;
}

async function getSession(chatId) {
  return sessionStore.get(chatId);
}

async function saveSession(chatId, session) {
  return sessionStore.set(chatId, touchSession(session));
}

async function clearSession(chatId) {
  return sessionStore.del(chatId);
}

async function callTelegram(method, payload) {
  if (!BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await response.json();
  if (!response.ok || !json?.ok) {
    const description = json?.description || `Telegram API request failed for ${method}`;
    throw new Error(description);
  }

  return json;
}

async function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", { chat_id: chatId, text, ...extra });
}

async function sendPhoto(chatId, fileId, extra = {}) {
  return callTelegram("sendPhoto", { chat_id: chatId, photo: fileId, ...extra });
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {})
  });
}

function buildOwnerSubmissionMessage(session, message) {
  const languageCode = session?.languageCode || "en";
  const copy = getCopy(languageCode);
  const from = message?.from || {};
  const usernameLine = from.username ? `@${from.username}` : "No username";
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim() || "Unknown";
  const submittedAt = new Date().toISOString();

  const responseLines = STEP_DEFINITIONS
    .filter((step) => !["facePhoto", "fullBodyPhoto", "extraPhoto"].includes(step.id))
    .map((step) => {
      const rawValue = session?.answers?.[step.id];
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        return null;
      }
      const label = getStepLabel(step, languageCode);
      const value = normalizeAnswerValue(step, rawValue, languageCode);
      return `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;
    })
    .filter(Boolean);

  return [
    `<b>${escapeHtml(copy.ownerTitle)}</b>`,
    "",
    `<b>${escapeHtml(copy.ownerLanguage)}:</b> ${escapeHtml(languageCode)}`,
    `<b>${escapeHtml(copy.ownerUser)}:</b> ${escapeHtml(displayName)}`,
    `<b>${escapeHtml(copy.ownerUsername)}:</b> ${escapeHtml(usernameLine)}`,
    `<b>${escapeHtml(copy.ownerUserId)}:</b> ${escapeHtml(from.id ?? "Unknown")}`,
    `<b>${escapeHtml(copy.ownerChatId)}:</b> ${escapeHtml(message?.chat?.id ?? "Unknown")}`,
    `<b>${escapeHtml(copy.ownerSubmittedAt)}:</b> ${escapeHtml(submittedAt)}`,
    "",
    `<b>${escapeHtml(copy.ownerResponses)}:</b>`,
    responseLines.join("\n")
  ].join("\n");
}

async function sendCurrentStep(chatId, session) {
  const step = getStepDefinition(session?.stepIndex || 0);
  return sendMessage(chatId, buildStepPrompt(session), {
    ...(buildStepKeyboard(step, session?.languageCode || "en") ? { reply_markup: buildStepKeyboard(step, session?.languageCode || "en") } : {})
  });
}

async function startForm(chatId, languageCode) {
  const session = createInitialSession(languageCode);
  await saveSession(chatId, session);
  await sendMessage(chatId, buildWelcomeMessage(languageCode));
  await sendCurrentStep(chatId, session);
}

function storeAnswer(session, stepId, value) {
  return {
    ...session,
    answers: {
      ...(session?.answers || {}),
      [stepId]: value
    }
  };
}

async function finalizeSubmission(chatId, session, message) {
  if (!OWNER_CHAT_ID) {
    throw new Error("Missing OWNER_CHAT_ID or ADMIN_LOG_CHAT_ID");
  }

  const languageCode = session?.languageCode || "en";
  const copy = getCopy(languageCode);

  await sendMessage(OWNER_CHAT_ID, buildOwnerSubmissionMessage(session, message), {
    parse_mode: "HTML",
    disable_web_page_preview: true
  });

  for (const stepId of ["facePhoto", "fullBodyPhoto", "extraPhoto"]) {
    const fileId = session?.answers?.[stepId];
    if (fileId && fileId !== "skipped") {
      const step = STEP_DEFINITIONS.find((entry) => entry.id === stepId);
      await sendPhoto(OWNER_CHAT_ID, fileId, {
        caption: `${copy.ownerPhotoCaption}: ${getStepLabel(step, languageCode)}`
      });
    }
  }

  await clearSession(chatId);
  await sendMessage(chatId, copy.success);
}

async function advanceSession(chatId, session, message, value, providedStep = null) {
  const currentStep = providedStep || getStepDefinition(session?.stepIndex || 0);
  if (!currentStep) {
    return;
  }

  const updatedSession = storeAnswer(session, currentStep.id, value);

  if (currentStep.kind === "terms") {
    if (value !== "yes") {
      await clearSession(chatId);
      await sendMessage(chatId, getCopy(session?.languageCode || "en").notAgreed);
      return;
    }

    await finalizeSubmission(chatId, updatedSession, message);
    return;
  }

  const nextSession = {
    ...updatedSession,
    stepIndex: getNextStepIndex(currentStep, value, session?.stepIndex || 0)
  };

  await saveSession(chatId, nextSession);
  await sendCurrentStep(chatId, nextSession);
}

async function handleTextStep(chatId, session, message) {
  const step = getStepDefinition(session?.stepIndex || 0);
  const copy = getCopy(session?.languageCode || "en");
  const text = (message?.text || "").trim();

  if (!step) {
    await sendMessage(chatId, copy.unknownCommand);
    return;
  }

  if (!text) {
    await sendMessage(chatId, copy.invalidText);
    return;
  }

  if (step.kind !== "text") {
    await sendMessage(chatId, step.kind.includes("photo") ? copy.invalidPhoto : copy.choiceHint);
    return;
  }

  await advanceSession(chatId, session, message, text, step);
}

function getLargestPhotoFileId(message) {
  const photos = Array.isArray(message?.photo) ? message.photo : [];
  return photos.length ? photos[photos.length - 1]?.file_id || null : null;
}

async function handlePhotoStep(chatId, session, message) {
  const step = getStepDefinition(session?.stepIndex || 0);
  const copy = getCopy(session?.languageCode || "en");
  const fileId = getLargestPhotoFileId(message);

  if (!step || !step.kind.includes("photo")) {
    await sendMessage(chatId, copy.invalidText);
    return;
  }

  if (!fileId) {
    await sendMessage(chatId, copy.invalidPhoto);
    return;
  }

  await advanceSession(chatId, session, message, fileId, step);
}

async function handleCommand(chatId) {
  const existingSession = await getSession(chatId);
  await clearSession(chatId);
  if (existingSession) {
    await sendMessage(chatId, COPY.en.restartNotice);
  }
  await sendMessage(chatId, buildLanguagePrompt(), {
    reply_markup: buildLanguageKeyboard()
  });
}

async function handleIncomingMessage(message) {
  const chatId = message?.chat?.id;
  if (!chatId) {
    return;
  }

  if (message?.text && isTelegramCommand(message.text)) {
    await handleCommand(chatId);
    return;
  }

  const session = await getSession(chatId);
  if (!session) {
    await sendMessage(chatId, buildLanguagePrompt(), {
      reply_markup: buildLanguageKeyboard()
    });
    return;
  }

  if (message?.photo?.length) {
    await handlePhotoStep(chatId, session, message);
    return;
  }

  await handleTextStep(chatId, session, message);
}

function parseCallbackData(data = "") {
  const [type, stepId, value] = String(data).split(":");
  return { type, stepId, value };
}

async function handleCallbackQuery(callbackQuery) {
  const callbackQueryId = callbackQuery?.id;
  const chatId = callbackQuery?.message?.chat?.id;
  const data = callbackQuery?.data || "";

  if (!callbackQueryId || !chatId) {
    return;
  }

  const parsed = parseCallbackData(data);

  if (parsed.type === CALLBACK_PREFIXES.language && parsed.stepId) {
    await answerCallbackQuery(callbackQueryId, getCopy(parsed.stepId).selectedLanguage);
    await startForm(chatId, parsed.stepId);
    return;
  }

  const session = await getSession(chatId);
  if (!session) {
    await answerCallbackQuery(callbackQueryId, COPY.en.unknownCommand);
    await sendMessage(chatId, buildLanguagePrompt(), {
      reply_markup: buildLanguageKeyboard()
    });
    return;
  }

  const currentStep = getStepDefinition(session?.stepIndex || 0);
  if (!currentStep) {
    await clearSession(chatId);
    await answerCallbackQuery(callbackQueryId, COPY.en.unknownCommand);
    return;
  }

  if (parsed.type === CALLBACK_PREFIXES.skip) {
    if (currentStep.id !== parsed.stepId || currentStep.kind !== "photo_optional") {
      await answerCallbackQuery(callbackQueryId, getCopy(session.languageCode).choiceHint);
      return;
    }
    await answerCallbackQuery(callbackQueryId);
    await advanceSession(chatId, session, callbackQuery?.message, "skipped", currentStep);
    return;
  }

  if (parsed.type === CALLBACK_PREFIXES.choice) {
    if (currentStep.id !== parsed.stepId) {
      await answerCallbackQuery(callbackQueryId, getCopy(session.languageCode).choiceHint);
      return;
    }
    await answerCallbackQuery(callbackQueryId);
    await advanceSession(chatId, session, callbackQuery?.message, parsed.value, currentStep);
    return;
  }

  await answerCallbackQuery(callbackQueryId);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET) {
    return res.status(500).json({
      ok: false,
      error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET"
    });
  }

  if (req.headers["x-telegram-bot-api-secret-token"] !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const update = req.body || {};

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message || update.edited_message) {
      await handleIncomingMessage(update.message || update.edited_message);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[telegram_webhook] error", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Webhook handler failed"
    });
  }
}
