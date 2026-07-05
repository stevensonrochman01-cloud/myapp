import { Redis } from "@upstash/redis";
import {
  PAYMENT_SERVICE_FEE,
  buildPaymentRecord,
  clearOwnerPaymentDraft,
  getOwnerPaymentDraft,
  getPaymentRecord,
  markPaymentCompleted,
  parseAmountInput,
  parsePaymentCompletionText,
  saveOwnerPaymentDraft,
  savePaymentRecord
} from "./_paymentStore.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || process.env.ADMIN_LOG_CHAT_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || process.env.ADMIN_USERNAME || "GoldenSugarAdmin";
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || "https://golden-sugar-daddy.vercel.app").replace(/\/+$/, "");

const SESSION_TTL_SECONDS = 60 * 60 * 6;
const OWNER_CHAT_ID_NORMALIZED = String(OWNER_CHAT_ID || "");

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
  languagePrompt: "Choose your language to begin.\n\nI will guide you through the profile form one answer at a time.",
  selectedLanguage: "Language selected. Let's make this easy.",
  welcome:
    "Welcome to Golden Sugar Daddy.\n\n" +
    "Golden Sugar Daddy, founded in 2023, is presented as a verified platform for Sugar Daddies and Sugar Babies. Sugar Daddies go through detailed verification, and Sugar Babies go through a liveness check.\n\n" +
    "Important:\n" +
    "- Sugar Babies do not pay during the process.\n" +
    "- The Sugar Daddy is responsible for the service fee.\n\n" +
    "I will guide you through everything one step at a time.",
  questionIntro: "Please answer this:",
  textHint: "Type your answer below.",
  choiceHint: "Choose one option below.",
  photoHint: "Send a photo now, or tap Skip if you would rather leave it out.",
  invalidText: "Please send a text reply so I can continue.",
  invalidPhoto: "Please send a photo for this part, or tap Skip if you want to leave it out.",
  commandHint: "You can send /start at any time to restart the form.",
  restartNotice: "The form has been restarted. Please choose your language again.",
  notAgreed: "No problem. Because you did not agree to the terms, your profile was not submitted. If you want to start again, send /start.",
  success: `Thank you. Your profile has been submitted successfully to @${OWNER_USERNAME}.`,
  groupWelcome:
    "Hello {name}, welcome to Golden Sugar Daddy.\n\n" +
    "To find a Sugar Daddy or Sugar Baby, please submit your form in private by opening this bot and sending /start.",
  ownerPaymentStart:
    "Payment request mode is ready.\n\n<b>Question 1</b>\nAmount for name?",
  ownerPaymentAskPayer: "<b>Question 2</b>\nPerson who has to pay?",
  ownerPaymentAskAmount: `<b>Question 3</b>\nWhat is the amount?\n\n<i>I will automatically add the $${PAYMENT_SERVICE_FEE} service fee.</i>`,
  ownerPaymentInvalidAmount: "Please send a valid amount like 500 or 500.00.",
  ownerPaymentCreated:
    "Payment request created successfully.\n\n" +
    "<b>Reference:</b> {reference}\n" +
    "<b>Amount For Name:</b> {recipient}\n" +
    "<b>Person Who Has To Pay:</b> {payer}\n" +
    "<b>Amount:</b> ${amount}\n" +
    `<b>Service Fee:</b> $${PAYMENT_SERVICE_FEE}\n` +
    "<b>Total:</b> ${total}\n\n" +
    "<b>Payment Link:</b>\n{paymentUrl}\n\n" +
    "<i>When payment is received, send {reference} DONE to mark it complete.</i>",
  ownerPaymentCompleted:
    "Payment marked as completed.\n\n<b>Reference:</b> {reference}\n<b>Total:</b> ${total}\n<b>Status:</b> Completed",
  ownerPaymentNotFound: "I could not find that payment reference.",
  ownerPaymentOnly: "This payment command is only available for the owner account.",
  ownerPaymentHint: "Send /payment to create a payment request.",
  ownerTitle: "New Sugar Baby profile submission",
  ownerStartedTitle: "Profile form started",
  ownerIncompleteTitle: "Incomplete profile form",
  ownerPhotoCaption: "Submitted photo",
  ownerLanguage: "Language",
  ownerUser: "User",
  ownerUsername: "Username",
  ownerUserId: "User ID",
  ownerChatId: "Chat ID",
  ownerSubmittedAt: "Submitted At",
  ownerStatusAt: "Updated At",
  ownerPendingQuestion: "Pending Question",
  ownerResponses: "Responses",
  termsPrompt: "Please read the sample terms first.\n\nWhen you are ready, choose Yes if you agree and want to submit your profile.",
  termsLinkLabel: "Read Terms",
  skipLabel: "Skip",
  yes: "Yes",
  no: "No",
  unknownCommand: "Send /start to restart the guided profile form."
};

const COPY = {
  en: { ...BASE_COPY },
  es: { ...BASE_COPY, selectedLanguage: "Idioma seleccionado. Vamos a hacerlo facil.", questionIntro: "Por favor responde esto:", yes: "Si", skipLabel: "Omitir", languagePrompt: "Elige tu idioma para comenzar.\n\nTe guiare por el formulario una respuesta a la vez.", welcome: "Bienvenida a Golden Sugar Daddy.\n\nGolden Sugar Daddy, fundado en 2023, se presenta como una plataforma verificada para Sugar Daddies y Sugar Babies. Los Sugar Daddies pasan por una verificacion detallada y las Sugar Babies por una prueba de vida.\n\nImportante:\n- Las Sugar Babies no pagan durante el proceso.\n- El Sugar Daddy cubre la tarifa del servicio.\n\nTe guiare paso a paso.", textHint: "Escribe tu respuesta abajo.", choiceHint: "Elige una opcion abajo.", photoHint: "Envia una foto ahora o toca Omitir si prefieres no ponerla.", invalidText: "Por favor envia una respuesta en texto para continuar.", invalidPhoto: "Por favor envia una foto para esta parte o toca Omitir si quieres dejarla fuera.", commandHint: "Puedes enviar /start en cualquier momento para reiniciar el formulario.", restartNotice: "El formulario se reinicio. Elige tu idioma otra vez.", notAgreed: "No pasa nada. Como no aceptaste los terminos, tu perfil no fue enviado. Si quieres empezar otra vez, envia /start.", success: `Gracias. Tu perfil fue enviado correctamente a @${OWNER_USERNAME}.`, termsPrompt: "Por favor lee primero los terminos de ejemplo.\n\nCuando estes lista, elige Si si estas de acuerdo y quieres enviar tu perfil.", termsLinkLabel: "Leer Terminos", unknownCommand: "Envia /start para reiniciar el formulario guiado." },
  fr: { ...BASE_COPY, selectedLanguage: "Langue selectionnee. Restons simples.", questionIntro: "Merci de repondre a ceci :", yes: "Oui", no: "Non", skipLabel: "Passer", languagePrompt: "Choisissez votre langue pour commencer.\n\nJe vous guiderai dans le formulaire, une reponse a la fois.", welcome: "Bienvenue sur Golden Sugar Daddy.\n\nGolden Sugar Daddy, fonde en 2023, est presente comme une plateforme verifiee pour Sugar Daddies et Sugar Babies. Les Sugar Daddies passent par une verification detaillee et les Sugar Babies par un controle de vivacite.\n\nImportant :\n- Les Sugar Babies ne paient rien pendant le processus.\n- Le Sugar Daddy prend en charge les frais de service.\n\nJe vous guiderai etape par etape.", textHint: "Tapez votre reponse ci-dessous.", choiceHint: "Choisissez une option ci-dessous.", photoHint: "Envoyez une photo maintenant ou touchez Passer si vous preferez ne pas l'ajouter.", invalidText: "Merci d'envoyer une reponse texte pour continuer.", invalidPhoto: "Merci d'envoyer une photo pour cette partie ou touchez Passer si vous voulez l'ignorer.", commandHint: "Vous pouvez envoyer /start a tout moment pour recommencer le formulaire.", notAgreed: "Aucun souci. Comme vous n'avez pas accepte les conditions, votre profil n'a pas ete envoye. Si vous voulez recommencer, envoyez /start.", success: `Merci. Votre profil a ete envoye avec succes a @${OWNER_USERNAME}.`, termsPrompt: "Merci de lire d'abord les conditions d'exemple.\n\nQuand vous etes prete, choisissez Oui si vous acceptez et souhaitez envoyer votre profil.", termsLinkLabel: "Lire les Conditions" },
  ru: { ...BASE_COPY, selectedLanguage: "Язык выбран. Сделаем все просто.", questionIntro: "Пожалуйста, ответьте на это:", yes: "Да", no: "Нет", skipLabel: "Пропустить", languagePrompt: "Выберите язык, чтобы начать.\n\nЯ проведу вас по форме шаг за шагом.", welcome: "Добро пожаловать в Golden Sugar Daddy.\n\nGolden Sugar Daddy, основанный в 2023 году, представлен как проверенная платформа для Sugar Daddies и Sugar Babies. Sugar Daddies проходят детальную проверку, а Sugar Babies проходят проверку живости.\n\nВажно:\n- Sugar Babies не платят в процессе.\n- Sugar Daddy оплачивает сервисный сбор.\n\nЯ проведу вас по форме шаг за шагом.", textHint: "Введите ответ ниже.", choiceHint: "Выберите один вариант ниже.", photoHint: "Отправьте фото сейчас или нажмите Пропустить, если не хотите добавлять его.", invalidText: "Пожалуйста, отправьте текстовый ответ, чтобы продолжить.", invalidPhoto: "Пожалуйста, отправьте фото для этой части или нажмите Пропустить, если хотите пропустить ее.", commandHint: "Вы можете отправить /start в любой момент, чтобы начать форму заново.", notAgreed: "Хорошо. Так как вы не согласились с условиями, ваш профиль не был отправлен. Если хотите начать заново, отправьте /start.", success: `Спасибо. Ваш профиль успешно отправлен @${OWNER_USERNAME}.`, termsPrompt: "Пожалуйста, сначала прочитайте пример условий.\n\nКогда будете готовы, выберите Да, если согласны и хотите отправить профиль.", termsLinkLabel: "Читать Условия", unknownCommand: "Отправьте /start, чтобы заново открыть форму." },
  hi: { ...BASE_COPY, selectedLanguage: "Language select ho gayi. Chaliye isse easy rakhte hain.", questionIntro: "Please is sawaal ka jawab dein:", languagePrompt: "Shuru karne ke liye apni language chuniye.\n\nMain aapko profile form ek-ek answer ke saath guide karunga.", welcome: "Welcome to Golden Sugar Daddy.\n\nGolden Sugar Daddy, 2023 mein founded, ek verified platform ke roop mein present kiya jata hai jahan Sugar Daddies ka detailed verification hota hai aur Sugar Babies ka liveness check hota hai.\n\nImportant:\n- Sugar Babies process mein kuch bhi pay nahi karti.\n- Service fee Sugar Daddy cover karta hai.\n\nMain aapko har step par guide karunga.", textHint: "Apna answer neeche type kijiye.", choiceHint: "Neeche se ek option choose kijiye.", photoHint: "Ab photo bhejiye, ya Skip dabaiye agar aap ise chhodna chahen.", invalidText: "Please continue karne ke liye text answer bhejiye.", invalidPhoto: "Please is part ke liye photo bhejiye, ya agar chhodna ho to Skip dabaiye.", commandHint: "Aap kabhi bhi /start bhej kar form restart kar sakte hain.", notAgreed: "Koi baat nahi. Aapne terms agree nahi kiye, isliye profile submit nahi hua. Dobara shuru karna ho to /start bhejiye.", success: `Thank you. Aapka profile safalta se @${OWNER_USERNAME} ko submit ho gaya hai.`, termsPrompt: "Please pehle sample terms padh lijiye.\n\nJab aap ready hon, agar agree karte hain aur profile submit karna chahte hain to Yes choose kijiye.", termsLinkLabel: "Terms Padhein", unknownCommand: "Guided profile form restart karne ke liye /start bhejiye." },
  fa: { ...BASE_COPY, selectedLanguage: "زبان انتخاب شد. بیایید این را ساده پیش ببریم.", questionIntro: "لطفا به این سوال پاسخ دهید:", yes: "بله", no: "خیر", skipLabel: "رد کردن", languagePrompt: "برای شروع زبان خود را انتخاب کنید.\n\nمن فرم پروفایل را مرحله به مرحله با شما پیش می برم.", welcome: "به Golden Sugar Daddy خوش آمدید.\n\nGolden Sugar Daddy که در سال 2023 تاسیس شده، به عنوان یک پلتفرم تایید شده برای Sugar Daddies و Sugar Babies معرفی می شود. Sugar Daddies بررسی دقیق می شوند و Sugar Babies بررسی زنده بودن را پشت سر می گذارند.\n\nمهم:\n- Sugar Baby ها در این فرایند چیزی پرداخت نمی کنند.\n- هزینه خدمات بر عهده Sugar Daddy است.\n\nمن شما را مرحله به مرحله راهنمایی می کنم.", textHint: "پاسخ خود را پایین تایپ کنید.", choiceHint: "یکی از گزینه های زیر را انتخاب کنید.", photoHint: "اکنون یک عکس بفرستید یا اگر نمی خواهید آن را اضافه کنید روی رد کردن بزنید.", invalidText: "لطفا برای ادامه یک پاسخ متنی ارسال کنید.", invalidPhoto: "لطفا برای این بخش یک عکس ارسال کنید یا اگر می خواهید از آن بگذرید روی رد کردن بزنید.", commandHint: "هر زمان خواستید می توانید با /start فرم را از اول شروع کنید.", notAgreed: "اشکالی ندارد. چون با شرایط موافقت نکردید، پروفایل شما ارسال نشد. اگر خواستید دوباره شروع کنید /start را بفرستید.", success: `متشکرم. پروفایل شما با موفقیت برای @${OWNER_USERNAME} ارسال شد.`, termsPrompt: "لطفا ابتدا شرایط نمونه را بخوانید.\n\nوقتی آماده بودید، اگر موافق هستید و می خواهید پروفایل را ارسال کنید، بله را انتخاب کنید.", termsLinkLabel: "مطالعه شرایط", unknownCommand: "برای شروع دوباره فرم پروفایل، /start را ارسال کنید." },
  it: { ...BASE_COPY, selectedLanguage: "Lingua selezionata. Facciamolo in modo semplice.", questionIntro: "Per favore rispondi a questo:", yes: "Si", skipLabel: "Salta", languagePrompt: "Scegli la tua lingua per iniziare.\n\nTi guidero nel modulo del profilo una risposta alla volta.", welcome: "Benvenuta su Golden Sugar Daddy.\n\nGolden Sugar Daddy, fondato nel 2023, viene presentato come una piattaforma verificata per Sugar Daddies e Sugar Babies. I Sugar Daddies passano una verifica dettagliata e le Sugar Babies un controllo di presenza reale.\n\nImportante:\n- Le Sugar Babies non pagano durante il processo.\n- Il Sugar Daddy copre la commissione di servizio.\n\nTi guidero passo dopo passo.", textHint: "Scrivi la tua risposta qui sotto.", choiceHint: "Scegli un'opzione qui sotto.", photoHint: "Invia una foto adesso oppure tocca Salta se preferisci non aggiungerla.", invalidText: "Per continuare, invia una risposta testuale.", invalidPhoto: "Per questa parte invia una foto oppure tocca Salta se vuoi saltarla.", commandHint: "Puoi inviare /start in qualsiasi momento per ricominciare il modulo.", notAgreed: "Nessun problema. Poiche non hai accettato i termini, il tuo profilo non e stato inviato. Se vuoi ricominciare, invia /start.", success: `Grazie. Il tuo profilo e stato inviato con successo a @${OWNER_USERNAME}.`, termsPrompt: "Per favore leggi prima i termini di esempio.\n\nQuando sei pronta, scegli Si se sei d'accordo e vuoi inviare il tuo profilo.", termsLinkLabel: "Leggi i Termini", unknownCommand: "Invia /start per riaprire il modulo guidato." },
  de: { ...BASE_COPY, selectedLanguage: "Sprache ausgewaehlt. Wir halten es einfach.", questionIntro: "Bitte beantworte das:", yes: "Ja", no: "Nein", skipLabel: "Ueberspringen", languagePrompt: "Waehle deine Sprache, um zu beginnen.\n\nIch fuehre dich durch das Profilformular, eine Antwort nach der anderen.", welcome: "Willkommen bei Golden Sugar Daddy.\n\nGolden Sugar Daddy, gegruendet im Jahr 2023, wird als verifizierte Plattform fuer Sugar Daddies und Sugar Babies dargestellt. Sugar Daddies durchlaufen eine detaillierte Verifizierung und Sugar Babies einen Liveness-Check.\n\nWichtig:\n- Sugar Babies zahlen waehrend des Prozesses nichts.\n- Der Sugar Daddy uebernimmt die Servicegebuehr.\n\nIch begleite dich Schritt fuer Schritt.", textHint: "Schreibe deine Antwort unten.", choiceHint: "Waehle unten eine Option aus.", photoHint: "Sende jetzt ein Foto oder tippe auf Ueberspringen, wenn du es lieber weglassen moechtest.", invalidText: "Bitte sende eine Textantwort, damit ich fortfahren kann.", invalidPhoto: "Bitte sende fuer diesen Teil ein Foto oder tippe auf Ueberspringen, wenn du ihn auslassen moechtest.", commandHint: "Du kannst jederzeit /start senden, um das Formular neu zu starten.", notAgreed: "Kein Problem. Da du den Bedingungen nicht zugestimmt hast, wurde dein Profil nicht gesendet. Wenn du neu beginnen moechtest, sende /start.", success: `Danke. Dein Profil wurde erfolgreich an @${OWNER_USERNAME} gesendet.`, termsPrompt: "Bitte lies zuerst die Musterbedingungen.\n\nWenn du bereit bist, waehle Ja, wenn du zustimmst und dein Profil absenden moechtest.", termsLinkLabel: "AGB lesen", unknownCommand: "Sende /start, um das gefuehrte Profilformular neu zu starten." }
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

function getEnglishQuestion(stepId) {
  const questions = {
    firstTime: "Is this your first time being a Sugar Baby?",
    name: "What is your name?",
    age: "How old are you?",
    location: "Where are you located?",
    height: "What is your height?",
    weight: "What is your weight?",
    breastSize: "What is your breast size?",
    buttSize: "What is your butt size?",
    ethnicity: "What is your ethnicity?",
    occupation: "Are you working or studying?",
    arrangement: "What type of arrangement are you looking for?",
    arrangementOther: "Please tell me what kind of arrangement you want.",
    allowance: "What is your allowance expectation?",
    boundaries: "What are your boundaries or restrictions?\n\nPlease mention anything you do not want, do not allow, or are not comfortable with.",
    facePhoto: "Please send a clear face photo.",
    fullBodyPhoto: "Please send a full-body photo.",
    extraPhoto: "Would you like to add one more photo?",
    terms: "Please read the sample terms first.\n\nWhen you are ready, choose Yes if you agree and want to submit your profile."
  };

  return questions[stepId] || null;
}

function getStepQuestion(step, languageCode) {
  if (!step) {
    return "";
  }

  if (languageCode === "en") {
    return getEnglishQuestion(step.id) || getStepLabel(step, languageCode);
  }

  return `${getCopy(languageCode).questionIntro}\n${getStepLabel(step, languageCode)}`;
}

function getOptionLabel(stepId, option, languageCode) {
  return OPTION_LABELS?.[stepId]?.[option]?.[languageCode] || OPTION_LABELS?.[stepId]?.[option]?.en || option;
}

function formatUserDisplayName(user = {}) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (user.id && fullName) {
    return `<a href="tg://user?id=${user.id}">${escapeHtml(fullName)}</a>`;
  }
  if (user.id && user.username) {
    return `<a href="tg://user?id=${user.id}">${escapeHtml(`@${user.username}`)}</a>`;
  }
  return escapeHtml(fullName || user.username || "there");
}

export function buildGroupWelcomeMessage(user, languageCode = "en") {
  const copy = getCopy(languageCode);
  return `<b>Golden Sugar Daddy</b>\n\n${copy.groupWelcome.replace("{name}", formatUserDisplayName(user))}`;
}

function formatQuestionCard(question, hint = "") {
  return hint ? `<b>${question}</b>\n\n<i>${hint}</i>` : `<b>${question}</b>`;
}

function getButtonLabel(kind, copy, optionLabel = "") {
  if (kind === "yes") {
    return `✅ ${copy.yes}`;
  }

  if (kind === "no") {
    return `❌ ${copy.no}`;
  }

  if (kind === "skip") {
    return `⏭ ${copy.skipLabel}`;
  }

  if (kind === "terms") {
    return `📄 ${copy.termsLinkLabel}`;
  }

  if (kind === "choice" && optionLabel) {
    return `🔹 ${optionLabel}`;
  }

  return optionLabel;
}

export function getTermsUrl(languageCode = "en") {
  return `${PUBLIC_APP_URL}/terms?lang=${encodeURIComponent(languageCode)}`;
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

function isOwnerUser(user = {}) {
  const matchesId = OWNER_CHAT_ID_NORMALIZED && String(user?.id || "") === OWNER_CHAT_ID_NORMALIZED;
  const matchesUsername = OWNER_USERNAME && String(user?.username || "").toLowerCase() === String(OWNER_USERNAME).replace(/^@/, "").toLowerCase();
  return Boolean(matchesId || matchesUsername);
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function buildOwnerPaymentCreatedMessage(record) {
  return COPY.en.ownerPaymentCreated
    .replaceAll("{reference}", escapeHtml(record.reference))
    .replace("{recipient}", escapeHtml(record.recipientName))
    .replace("{payer}", escapeHtml(record.payerName))
    .replace("{amount}", formatMoney(record.amount))
    .replace("{total}", formatMoney(record.totalAmount))
    .replace("{paymentUrl}", escapeHtml(record.paymentUrl));
}

function buildOwnerPaymentCompletedMessage(record) {
  return COPY.en.ownerPaymentCompleted
    .replace("{reference}", escapeHtml(record.reference))
    .replace("{total}", formatMoney(record.totalAmount));
}

export function buildLanguagePrompt() {
  return `<b>Golden Sugar Daddy</b>\n\n${COPY.en.languagePrompt}\n\n<i>${COPY.en.commandHint}</i>`;
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
  const copy = getCopy(languageCode);
  return `<b>Golden Sugar Daddy</b>\n\n${copy.welcome}\n\n<i>${copy.commandHint}</i>`;
}

export function buildStepPrompt(session) {
  const languageCode = session?.languageCode || "en";
  const copy = getCopy(languageCode);
  const step = getStepDefinition(session?.stepIndex || 0);

  if (!step) {
    return copy.unknownCommand;
  }

  const question = getStepQuestion(step, languageCode);

  let hint = copy.textHint;
  if (step.kind === "choice" || step.kind === "yesno") {
    hint = copy.choiceHint;
  } else if (step.kind === "photo_optional") {
    hint = copy.photoHint;
  } else if (step.kind === "terms") {
    hint = copy.termsPrompt;
  }

  if (step.kind === "terms") {
    return formatQuestionCard(question);
  }

  return formatQuestionCard(question, hint);
}

export function buildStepKeyboard(step, languageCode) {
  const copy = getCopy(languageCode);

  if (!step) {
    return undefined;
  }

  if (step.kind === "yesno") {
    return {
      inline_keyboard: [[
        { text: getButtonLabel("yes", copy), callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:yes` },
        { text: getButtonLabel("no", copy), callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:no` }
      ]]
    };
  }

  if (step.kind === "choice") {
    return {
      inline_keyboard: step.options.map((option) => ([{
        text: getButtonLabel("choice", copy, getOptionLabel(step.id, option, languageCode)),
        callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:${option}`
      }]))
    };
  }

  if (step.kind === "photo_optional") {
    return {
      inline_keyboard: [[{ text: getButtonLabel("skip", copy), callback_data: `${CALLBACK_PREFIXES.skip}:${step.id}` }]]
    };
  }

  if (step.kind === "terms") {
    return {
      inline_keyboard: [
        [{ text: getButtonLabel("terms", copy), url: getTermsUrl(languageCode) }],
        [
          { text: getButtonLabel("yes", copy), callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:yes` },
          { text: getButtonLabel("no", copy), callback_data: `${CALLBACK_PREFIXES.choice}:${step.id}:no` }
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
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra
  });
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

async function startForm(chatId, languageCode, sourceMessage = null) {
  const existingSession = await getSession(chatId);
  if (existingSession) {
    await notifyOwnerAboutIncompleteForm(existingSession, sourceMessage || { chat: { id: chatId } });
  }

  const session = createInitialSession(languageCode);
  await saveSession(chatId, session);
  await sendMessage(chatId, buildWelcomeMessage(languageCode));
  await notifyOwnerAboutStartedForm(session, sourceMessage || { chat: { id: chatId } });
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

function buildOwnerSessionStatusMessage(session, message, title, includePending = false) {
  const languageCode = session?.languageCode || "en";
  const copy = getCopy(languageCode);
  const from = message?.from || {};
  const usernameLine = from.username ? `@${from.username}` : "No username";
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim() || "Unknown";
  const pendingStep = getStepDefinition(session?.stepIndex || 0);

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

  const lines = [
    `<b>${escapeHtml(title)}</b>`,
    "",
    `<b>${escapeHtml(copy.ownerLanguage)}:</b> ${escapeHtml(languageCode)}`,
    `<b>${escapeHtml(copy.ownerUser)}:</b> ${escapeHtml(displayName)}`,
    `<b>${escapeHtml(copy.ownerUsername)}:</b> ${escapeHtml(usernameLine)}`,
    `<b>${escapeHtml(copy.ownerUserId)}:</b> ${escapeHtml(from.id ?? "Unknown")}`,
    `<b>${escapeHtml(copy.ownerChatId)}:</b> ${escapeHtml(message?.chat?.id ?? "Unknown")}`,
    `<b>${escapeHtml(copy.ownerStatusAt)}:</b> ${escapeHtml(new Date().toISOString())}`
  ];

  if (includePending && pendingStep) {
    lines.push(`<b>${escapeHtml(copy.ownerPendingQuestion)}:</b> ${escapeHtml(getStepLabel(pendingStep, languageCode))}`);
  }

  lines.push("", `<b>${escapeHtml(copy.ownerResponses)}:</b>`);
  lines.push(responseLines.length ? responseLines.join("\n") : "No answers yet");

  return lines.join("\n");
}

async function notifyOwnerAboutStartedForm(session, message) {
  if (!OWNER_CHAT_ID) {
    return;
  }

  await sendMessage(
    OWNER_CHAT_ID,
    buildOwnerSessionStatusMessage(session, message, getCopy(session.languageCode).ownerStartedTitle, true),
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );
}

async function notifyOwnerAboutIncompleteForm(session, message) {
  if (!OWNER_CHAT_ID || !session) {
    return;
  }

  await sendMessage(
    OWNER_CHAT_ID,
    buildOwnerSessionStatusMessage(session, message, getCopy(session.languageCode).ownerIncompleteTitle, true),
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );
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
      await notifyOwnerAboutIncompleteForm(updatedSession, message);
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

async function startOwnerPaymentFlow(chatId) {
  await clearOwnerPaymentDraft(chatId);
  await saveOwnerPaymentDraft(chatId, {
    step: "recipientName",
    data: {}
  });
  await sendMessage(chatId, COPY.en.ownerPaymentStart);
}

async function completeOwnerPaymentFlow(chatId, draft, text) {
  if (draft.step === "recipientName") {
    await saveOwnerPaymentDraft(chatId, {
      step: "payerName",
      data: {
        recipientName: text
      }
    });
    await sendMessage(chatId, COPY.en.ownerPaymentAskPayer);
    return true;
  }

  if (draft.step === "payerName") {
    await saveOwnerPaymentDraft(chatId, {
      step: "amount",
      data: {
        ...draft.data,
        payerName: text
      }
    });
    await sendMessage(chatId, COPY.en.ownerPaymentAskAmount);
    return true;
  }

  if (draft.step === "amount") {
    const parsedAmount = parseAmountInput(text);
    if (parsedAmount === null) {
      await sendMessage(chatId, COPY.en.ownerPaymentInvalidAmount);
      return true;
    }

    const record = buildPaymentRecord({
      recipientName: draft.data?.recipientName,
      payerName: draft.data?.payerName,
      amount: parsedAmount
    });
    await savePaymentRecord(record);
    await clearOwnerPaymentDraft(chatId);
    await sendMessage(chatId, buildOwnerPaymentCreatedMessage(record));
    return true;
  }

  await clearOwnerPaymentDraft(chatId);
  return false;
}

async function handleOwnerTextMessage(message) {
  const chatId = message?.chat?.id;
  const text = (message?.text || "").trim();

  if (!chatId || !text || !isOwnerUser(message?.from)) {
    return false;
  }

  const completionReference = parsePaymentCompletionText(text);
  if (completionReference) {
    const completedRecord = await markPaymentCompleted(completionReference);
    if (!completedRecord) {
      await sendMessage(chatId, COPY.en.ownerPaymentNotFound);
      return true;
    }
    await clearOwnerPaymentDraft(chatId);
    await sendMessage(chatId, buildOwnerPaymentCompletedMessage(completedRecord));
    return true;
  }

  if (/^\/payment(?:@\S+)?$/i.test(text)) {
    await startOwnerPaymentFlow(chatId);
    return true;
  }

  const ownerDraft = await getOwnerPaymentDraft(chatId);
  if (!ownerDraft) {
    return false;
  }

  await completeOwnerPaymentFlow(chatId, ownerDraft, text);
  return true;
}

async function handleCommand(message) {
  const chatId = message?.chat?.id;
  if (!chatId) {
    return;
  }

  const text = (message?.text || "").trim();
  if (/^\/payment(?:@\S+)?$/i.test(text)) {
    if (!isOwnerUser(message?.from)) {
      await sendMessage(chatId, COPY.en.ownerPaymentOnly);
      return;
    }
    await startOwnerPaymentFlow(chatId);
    return;
  }

  const existingSession = await getSession(chatId);
  if (existingSession) {
    await notifyOwnerAboutIncompleteForm(existingSession, message);
  }
  await clearSession(chatId);
  if (existingSession) {
    await sendMessage(chatId, COPY.en.restartNotice);
  }
  await sendMessage(chatId, buildLanguagePrompt(), {
    reply_markup: buildLanguageKeyboard()
  });
}

async function handleNewChatMembers(message) {
  const chatId = message?.chat?.id;
  const languageCode = "en";
  const newMembers = Array.isArray(message?.new_chat_members)
    ? message.new_chat_members.filter((member) => !member?.is_bot)
    : [];

  if (!chatId || !newMembers.length) {
    return;
  }

  for (const member of newMembers) {
    await sendMessage(chatId, buildGroupWelcomeMessage(member, languageCode));
  }
}

async function handleIncomingMessage(message) {
  const chatId = message?.chat?.id;
  if (!chatId) {
    return;
  }

  if (message?.new_chat_members?.length) {
    await handleNewChatMembers(message);
    return;
  }

  if (message?.text && await handleOwnerTextMessage(message)) {
    return;
  }

  if (message?.text && isTelegramCommand(message.text)) {
    await handleCommand(message);
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
    await startForm(chatId, parsed.stepId, {
      chat: { id: chatId },
      from: callbackQuery?.from
    });
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
