const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || process.env.ADMIN_LOG_CHAT_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || process.env.ADMIN_USERNAME || "GoldenSugarAdmin";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "ru", label: "Russkiy" },
  { code: "ar", label: "Arabic" }
];

const LANGUAGE_COPY = {
  en: {
    languagePrompt:
      "Please choose your language first so the form is easy to understand.",
    intro:
      "Golden Sugar Daddy, founded in 2023, is presented as a verified Sugar Daddy and Sugar Baby platform with detailed verification for Sugar Daddies and liveness checks for Sugar Babies.\n\n" +
      "If you are a Sugar Baby, you do not pay anything during the process. The Sugar Daddy is responsible for the service fee, so it is completely free for Sugar Babies.\n\n" +
      "We focus on privacy, screening, and reducing fake profiles so genuine members can connect with more confidence.",
    instruction:
      "Please copy this short form, fill it out honestly, and send it back in one message.",
    formTitle: "Sugar Baby Profile Form",
    form:
      "Name/Nickname:\n" +
      "Age:\n" +
      "Location:\n" +
      "Height:\n" +
      "Weight:\n" +
      "Body Type:\n" +
      "Breast Size:\n" +
      "Butt Size: Small / Medium / Large\n" +
      "Ethnicity:\n" +
      "Tattoos/Piercings: Yes / No\n" +
      "Occupation/Student:\n" +
      "Open to Travel: Yes / No\n" +
      "Can do Video Call: Yes / No\n" +
      "Preferred Arrangement:\n" +
      "Allowance Expectation:\n" +
      "Preferred Communication: Text / Calls / Video / In-person\n" +
      "Boundaries/Restrictions:\n" +
      "Clear Face Photo:\n" +
      "Full-Body Photo:\n" +
      "Optional Extra Photos:\n" +
      "Terms Agreement: Yes / No",
    terms:
      "Read the Golden Sugar Daddy Terms and Conditions carefully. Only submit this form if you agree.",
    submitHint:
      "To submit successfully, end your form with: Terms Agreement: Yes",
    missingAgreement:
      "I could not submit that yet. Please send the completed form again and end it with: Terms Agreement: Yes",
    declinedAgreement:
      "No problem. Since you selected No for the terms, I have not submitted your form. If you change your mind, resend the form with: Terms Agreement: Yes",
    success:
      `Thanks. Your form has been submitted successfully to @${OWNER_USERNAME}.`,
    unknownCommand:
      "Send /start to choose a language and receive the form."
  },
  es: {
    languagePrompt:
      "Primero elige tu idioma para que el formulario sea facil de entender.",
    intro:
      "Golden Sugar Daddy, fundado en 2023, se presenta como una plataforma verificada para Sugar Daddies y Sugar Babies, con verificacion detallada para Sugar Daddies y control de vida real para Sugar Babies.\n\n" +
      "Si eres una Sugar Baby, no pagas nada durante todo el proceso. El Sugar Daddy es responsable de la tarifa del servicio, asi que es completamente gratis para Sugar Babies.\n\n" +
      "La prioridad es la privacidad, el filtro de perfiles y reducir cuentas falsas para que los miembros reales conecten con mas confianza.",
    instruction:
      "Copia este formulario corto, completalo con honestidad y envialo en un solo mensaje.",
    formTitle: "Formulario de Perfil Sugar Baby",
    form:
      "Nombre o Apodo:\n" +
      "Edad:\n" +
      "Ubicacion:\n" +
      "Altura:\n" +
      "Peso:\n" +
      "Tipo de Cuerpo:\n" +
      "Tamano de Pecho:\n" +
      "Tamano de Gluteos: Pequeno / Mediano / Grande\n" +
      "Etnia:\n" +
      "Tatuajes o Piercings: Si / No\n" +
      "Ocupacion o Estudiante:\n" +
      "Disponible para Viajar: Si / No\n" +
      "Puede hacer Videollamada: Si / No\n" +
      "Tipo de Arreglo Preferido:\n" +
      "Expectativa de Asignacion:\n" +
      "Comunicacion Preferida: Texto / Llamadas / Video / En persona\n" +
      "Limites o Restricciones:\n" +
      "Foto Clara del Rostro:\n" +
      "Foto de Cuerpo Completo:\n" +
      "Fotos Adicionales Opcionales:\n" +
      "Acepta los Terminos: Si / No",
    terms:
      "Lee con cuidado los Terminos y Condiciones de Golden Sugar Daddy. Solo envia el formulario si estas de acuerdo.",
    submitHint:
      "Para enviar con exito, termina tu formulario con: Acepta los Terminos: Si",
    missingAgreement:
      "Todavia no puedo enviarlo. Vuelve a mandar el formulario completo y termina con: Acepta los Terminos: Si",
    declinedAgreement:
      "No hay problema. Como elegiste No en los terminos, no envie tu formulario. Si cambias de opinion, reenvialo con: Acepta los Terminos: Si",
    success:
      `Gracias. Tu formulario fue enviado correctamente a @${OWNER_USERNAME}.`,
    unknownCommand:
      "Envia /start para elegir un idioma y recibir el formulario."
  },
  ru: {
    languagePrompt:
      "Snachala vyberite yazyk, chtoby forma byla ponyatnoy.",
    intro:
      "Golden Sugar Daddy, osnovannyy v 2023 godu, predstavlyaetsya kak proverennaya platforma dlya Sugar Daddy i Sugar Baby s detalnoy proverkoй Sugar Daddy i proverkoй liveness dlya Sugar Baby.\n\n" +
      "Esli vy Sugar Baby, vy nichego ne platite vo vremya vsego protsessa. Oplatu servisa beret na sebya Sugar Daddy, poetomu dlya Sugar Baby eto polnostyu besplatno.\n\n" +
      "Aktsent delaetsya na privatnosti, proverke i umenshenii chisla feykovykh profiley, chtoby nastoyashchim uchastnikam bylo proshche doveryat drug drugu.",
    instruction:
      "Skopiruyte etu korotkuyu formu, chestno zapolnite ee i otpravte odnim soobshcheniem.",
    formTitle: "Forma Profilya Sugar Baby",
    form:
      "Imya ili Nik:\n" +
      "Vozrast:\n" +
      "Mestopolozhenie:\n" +
      "Rost:\n" +
      "Ves:\n" +
      "Tip Tela:\n" +
      "Razmer Grudi:\n" +
      "Razmer Yagodits: Malenkiy / Sredniy / Bolshoy\n" +
      "Etnichnost:\n" +
      "Tatuirovki ili Pirsing: Da / Net\n" +
      "Rabota ili Ucheba:\n" +
      "Gotovy k Poezdke: Da / Net\n" +
      "Mozhete sdelat Videozvonok: Da / Net\n" +
      "Predpochtitelnyy Format Otnosheniy:\n" +
      "Ozidanie po Allowance:\n" +
      "Predpochtitelnoe Obshchenie: Tekst / Zvonki / Video / Lichno\n" +
      "Granitsy i Ogranicheniya:\n" +
      "Yasnoye Foto Litsa:\n" +
      "Foto v Polnyy Rost:\n" +
      "Dopolnitelnye Foto po Zhelaniyu:\n" +
      "Soglasie s Usloviyami: Da / Net",
    terms:
      "Vnimatelno prochitayte usloviya Golden Sugar Daddy. Otpavlyayte formu tolko esli soglasny.",
    submitHint:
      "Dlya uspeshnoy otpravki zakanchivayte formu strokoy: Soglasie s Usloviyami: Da",
    missingAgreement:
      "Ya poka ne mogu otpravit eto. Pozhaluysta, otpravte zapolnennuyu formu eshche raz i zakanchivayte ee strokoy: Soglasie s Usloviyami: Da",
    declinedAgreement:
      "Khorosho. Tak kak vy vybrali Net, forma ne byla otpravlena. Esli peredumaete, otpravte ee s: Soglasie s Usloviyami: Da",
    success:
      `Spasibo. Vasha forma uspeshno otpravlena @${OWNER_USERNAME}.`,
    unknownCommand:
      "Otpravte /start, chtoby vybrat yazyk i poluchit formu."
  },
  ar: {
    languagePrompt:
      "Please choose your language first so the form is easy to understand.",
    intro:
      "Golden Sugar Daddy, founded in 2023, is presented as a verified Sugar Daddy and Sugar Baby platform with detailed verification for Sugar Daddies and liveness checks for Sugar Babies.\n\n" +
      "If you are a Sugar Baby, you do not pay anything during the process. The Sugar Daddy is responsible for the service fee, so it is completely free for Sugar Babies.\n\n" +
      "We focus on privacy, screening, and reducing fake profiles so genuine members can connect with more confidence.",
    instruction:
      "Please copy this short form, fill it out honestly, and send it back in one message.",
    formTitle: "Sugar Baby Profile Form",
    form:
      "Name/Nickname:\n" +
      "Age:\n" +
      "Location:\n" +
      "Height:\n" +
      "Weight:\n" +
      "Body Type:\n" +
      "Breast Size:\n" +
      "Butt Size: Small / Medium / Large\n" +
      "Ethnicity:\n" +
      "Tattoos/Piercings: Yes / No\n" +
      "Occupation/Student:\n" +
      "Open to Travel: Yes / No\n" +
      "Can do Video Call: Yes / No\n" +
      "Preferred Arrangement:\n" +
      "Allowance Expectation:\n" +
      "Preferred Communication: Text / Calls / Video / In-person\n" +
      "Boundaries/Restrictions:\n" +
      "Clear Face Photo:\n" +
      "Full-Body Photo:\n" +
      "Optional Extra Photos:\n" +
      "Terms Agreement: Yes / No",
    terms:
      "Read the Golden Sugar Daddy Terms and Conditions carefully. Only submit this form if you agree.",
    submitHint:
      "To submit successfully, end your form with: Terms Agreement: Yes",
    missingAgreement:
      "I could not submit that yet. Please send the completed form again and end it with: Terms Agreement: Yes",
    declinedAgreement:
      "No problem. Since you selected No for the terms, I have not submitted your form. If you change your mind, resend the form with: Terms Agreement: Yes",
    success:
      `Thanks. Your form has been submitted successfully to @${OWNER_USERNAME}.`,
    unknownCommand:
      "Send /start to choose a language and receive the form."
  }
};

const LANGUAGE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: "English", callback_data: "lang:en" },
      { text: "Espanol", callback_data: "lang:es" }
    ],
    [
      { text: "Russkiy", callback_data: "lang:ru" },
      { text: "Arabic", callback_data: "lang:ar" }
    ]
  ]
};

const YES_WORDS = ["yes", "y", "si", "sí", "da", "oui", "نعم"];
const NO_WORDS = ["no", "net", "non", "لا"];

function getCopy(languageCode = "en") {
  return LANGUAGE_COPY[languageCode] || LANGUAGE_COPY.en;
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
  return `${LANGUAGE_COPY.en.languagePrompt}\n\nChoose one below:`;
}

export function buildLocalizedFormMessage(languageCode = "en") {
  const copy = getCopy(languageCode);

  return [
    copy.intro,
    "",
    copy.instruction,
    "",
    copy.formTitle,
    copy.form,
    "",
    copy.terms,
    copy.submitHint
  ].join("\n");
}

export function detectAgreement(text = "") {
  const normalized = String(text).toLowerCase();
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const agreementLine = [...lines].reverse().find((line) =>
    /(terms|agreement|agree|terminos|soglasie|услов|yes\s*\/\s*no|si\s*\/\s*no|da\s*\/\s*net)/i.test(line)
  );

  if (!agreementLine) {
    return "missing";
  }

  if (YES_WORDS.some((word) => agreementLine.includes(`: ${word}`) || agreementLine.endsWith(` ${word}`) || agreementLine.endsWith(word))) {
    return "yes";
  }

  if (NO_WORDS.some((word) => agreementLine.includes(`: ${word}`) || agreementLine.endsWith(` ${word}`) || agreementLine.endsWith(word))) {
    return "no";
  }

  return "missing";
}

export function guessLanguageFromText(text = "") {
  const normalized = String(text).toLowerCase();

  if (/[а-яё]/i.test(normalized) || /soglasie|forma profilya/.test(normalized)) {
    return "ru";
  }

  if (/formulario|ubicacion|acepta los terminos|videollamada/.test(normalized)) {
    return "es";
  }

  if (/نعم|لا/.test(normalized)) {
    return "ar";
  }

  return "en";
}

export function buildOwnerSubmissionMessage(message) {
  const from = message?.from || {};
  const submittedText = (message?.text || "").trim();
  const submittedAt = new Date().toISOString();
  const usernameLine = from.username ? `@${from.username}` : "No username";
  const firstName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim() || "Unknown";

  return [
    "<b>New bot form submission</b>",
    "",
    `<b>Name:</b> ${escapeHtml(firstName)}`,
    `<b>Username:</b> ${escapeHtml(usernameLine)}`,
    `<b>User ID:</b> ${escapeHtml(from.id ?? "Unknown")}`,
    `<b>Chat ID:</b> ${escapeHtml(message?.chat?.id ?? "Unknown")}`,
    `<b>Submitted At:</b> ${escapeHtml(submittedAt)}`,
    "",
    "<b>Form Response:</b>",
    escapeHtml(submittedText)
  ].join("\n");
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
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {})
  });
}

async function notifyOwnerOfSubmission(message) {
  if (!OWNER_CHAT_ID) {
    throw new Error("Missing OWNER_CHAT_ID or ADMIN_LOG_CHAT_ID");
  }

  await sendMessage(OWNER_CHAT_ID, buildOwnerSubmissionMessage(message), {
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function sendLanguagePicker(chatId) {
  await sendMessage(chatId, buildLanguagePrompt(), {
    reply_markup: LANGUAGE_KEYBOARD
  });
}

async function sendLocalizedForm(chatId, languageCode) {
  await sendMessage(chatId, buildLocalizedFormMessage(languageCode), {
    disable_web_page_preview: true
  });
}

async function handleCommand(chatId, command) {
  if (command === "/start" || command === "/form" || command === "/help") {
    await sendLanguagePicker(chatId);
    return;
  }

  await sendMessage(chatId, LANGUAGE_COPY.en.unknownCommand);
}

async function handleTextMessage(message) {
  const chatId = message?.chat?.id;
  const text = (message?.text || "").trim();

  if (!chatId || !text) {
    return;
  }

  if (isTelegramCommand(text)) {
    const command = text.split(/\s+/)[0].toLowerCase();
    await handleCommand(chatId, command);
    return;
  }

  const languageCode = guessLanguageFromText(text);
  const copy = getCopy(languageCode);
  const agreement = detectAgreement(text);

  if (agreement === "no") {
    await sendMessage(chatId, copy.declinedAgreement);
    return;
  }

  if (agreement !== "yes") {
    await sendMessage(chatId, copy.missingAgreement);
    return;
  }

  await notifyOwnerOfSubmission(message);
  await sendMessage(chatId, copy.success);
}

async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery?.data || "";
  const chatId = callbackQuery?.message?.chat?.id;
  const callbackQueryId = callbackQuery?.id;

  if (!chatId || !callbackQueryId) {
    return;
  }

  if (data.startsWith("lang:")) {
    const languageCode = data.slice(5);
    await answerCallbackQuery(callbackQueryId, "Language selected.");
    await sendLocalizedForm(chatId, languageCode);
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
    const message = update.message || update.edited_message;
    const callbackQuery = update.callback_query;

    if (callbackQuery) {
      await handleCallbackQuery(callbackQuery);
    } else if (message?.text) {
      await handleTextMessage(message);
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
