import { Redis } from "@upstash/redis";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || process.env.ADMIN_LOG_CHAT_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || process.env.ADMIN_USERNAME || "GoldenSugarAdmin";

const MEMORY_SESSION_TTL_SECONDS = 60 * 60 * 6;

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

const COPY = {
  en: {
    languagePrompt: "Choose your language to begin. The form will then guide the user step by step.",
    selectedLanguage: "Language selected. Let's make this easy.",
    welcome:
      "Golden Sugar Daddy, founded in 2023, is described as a verified Sugar Daddy and Sugar Baby platform with detailed verification for Sugar Daddies and liveness checks for Sugar Babies.\n\n" +
      "If you are a Sugar Baby, you do not pay anything during the process. The Sugar Daddy is responsible for the service fee, so it is completely free for Sugar Babies.\n\n" +
      "We focus on privacy, screening, and reducing fake profiles so genuine members can connect with more confidence.",
    startHint: "You will answer one short question at a time. Tap buttons when shown, or type your answer.",
    textHint: "Type your answer below.",
    choiceHint: "Tap one option below.",
    photoHint: "Send a photo now, or tap Skip if it is optional.",
    invalidText: "Please type a text answer so I can continue.",
    invalidPhoto: "Please send a photo for this step, or tap Skip if the step is optional.",
    commandHint: "Send /start at any time to restart the form.",
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
    termsPrompt: "Read the Golden Sugar Daddy terms carefully. Do you agree and want to submit this form?",
    skipLabel: "Skip",
    yes: "Yes",
    no: "No",
    unknownCommand: "Send /start to restart the guided form."
  },
  es: {
    languagePrompt: "Elige tu idioma para comenzar. Luego el formulario guiara al usuario paso a paso.",
    selectedLanguage: "Idioma seleccionado. Vamos a hacerlo facil.",
    welcome:
      "Golden Sugar Daddy, fundado en 2023, se describe como una plataforma verificada para Sugar Daddies y Sugar Babies, con verificacion detallada para Sugar Daddies y prueba de vida para Sugar Babies.\n\n" +
      "Si eres una Sugar Baby, no pagas nada durante el proceso. El Sugar Daddy cubre la tarifa del servicio, asi que es totalmente gratis para Sugar Babies.\n\n" +
      "La prioridad es la privacidad, el filtro de perfiles y reducir cuentas falsas para que los miembros reales conecten con mas confianza.",
    startHint: "Responderas una pregunta corta a la vez. Toca los botones cuando aparezcan o escribe tu respuesta.",
    textHint: "Escribe tu respuesta abajo.",
    choiceHint: "Toca una opcion abajo.",
    photoHint: "Envia una foto ahora o toca Omitir si es opcional.",
    invalidText: "Escribe una respuesta en texto para continuar.",
    invalidPhoto: "Envia una foto para este paso o toca Omitir si es opcional.",
    commandHint: "Envia /start en cualquier momento para reiniciar el formulario.",
    restartNotice: "El formulario se reinicio. Elige tu idioma otra vez.",
    notAgreed: "No pasa nada. Como no aceptaste los terminos, tu formulario no fue enviado. Envia /start si quieres empezar de nuevo.",
    success: `Gracias. Tu perfil fue enviado correctamente a @${OWNER_USERNAME}.`,
    ownerTitle: "Nueva solicitud de perfil Sugar Baby",
    ownerPhotoCaption: "Foto enviada",
    ownerLanguage: "Idioma",
    ownerUser: "Usuario",
    ownerUsername: "Username",
    ownerUserId: "ID de usuario",
    ownerChatId: "ID del chat",
    ownerSubmittedAt: "Enviado el",
    ownerResponses: "Respuestas",
    termsPrompt: "Lee cuidadosamente los terminos de Golden Sugar Daddy. Estas de acuerdo y quieres enviar este formulario?",
    skipLabel: "Omitir",
    yes: "Si",
    no: "No",
    unknownCommand: "Envia /start para reiniciar el formulario guiado."
  },
  fr: {
    languagePrompt: "Choisissez votre langue pour commencer. Le formulaire guidera ensuite l'utilisateur etape par etape.",
    selectedLanguage: "Langue selectionnee. On va faire simple.",
    welcome:
      "Golden Sugar Daddy, fonde en 2023, est presente comme une plateforme verifiee pour Sugar Daddies et Sugar Babies, avec une verification detaillee pour les Sugar Daddies et un controle de vivacite pour les Sugar Babies.\n\n" +
      "Si vous etes une Sugar Baby, vous ne payez rien pendant tout le processus. Le Sugar Daddy prend en charge les frais de service, donc c'est totalement gratuit pour les Sugar Babies.\n\n" +
      "L'objectif est la confidentialite, le filtrage et la reduction des faux profils afin que les vrais membres puissent echanger avec plus de confiance.",
    startHint: "Vous repondrez a une courte question a la fois. Touchez les boutons quand ils apparaissent ou tapez votre reponse.",
    textHint: "Tapez votre reponse ci-dessous.",
    choiceHint: "Choisissez une option ci-dessous.",
    photoHint: "Envoyez une photo maintenant ou touchez Passer si c'est facultatif.",
    invalidText: "Merci d'envoyer une reponse texte pour continuer.",
    invalidPhoto: "Merci d'envoyer une photo pour cette etape ou touchez Passer si c'est facultatif.",
    commandHint: "Envoyez /start a tout moment pour recommencer le formulaire.",
    restartNotice: "Le formulaire a ete relance. Choisissez de nouveau votre langue.",
    notAgreed: "Aucun souci. Comme vous n'avez pas accepte les conditions, le formulaire n'a pas ete envoye. Envoyez /start pour recommencer.",
    success: `Merci. Votre profil a ete envoye avec succes a @${OWNER_USERNAME}.`,
    ownerTitle: "Nouvelle soumission de profil Sugar Baby",
    ownerPhotoCaption: "Photo envoyee",
    ownerLanguage: "Langue",
    ownerUser: "Utilisateur",
    ownerUsername: "Username",
    ownerUserId: "ID utilisateur",
    ownerChatId: "ID du chat",
    ownerSubmittedAt: "Envoye le",
    ownerResponses: "Reponses",
    termsPrompt: "Lisez attentivement les conditions de Golden Sugar Daddy. Etes-vous d'accord et souhaitez-vous envoyer ce formulaire ?",
    skipLabel: "Passer",
    yes: "Oui",
    no: "Non",
    unknownCommand: "Envoyez /start pour relancer le formulaire guide."
  },
  ru: {
    languagePrompt: "Выберите язык, чтобы начать. Затем форма будет вести пользователя шаг за шагом.",
    selectedLanguage: "Язык выбран. Сделаем все максимально просто.",
    welcome:
      "Golden Sugar Daddy, основанный в 2023 году, описывается как проверенная платформа для Sugar Daddy и Sugar Baby с детальной проверкой Sugar Daddy и проверкой живости для Sugar Baby.\n\n" +
      "Если вы Sugar Baby, вы ничего не платите в процессе. Sugar Daddy оплачивает сервисный сбор, поэтому для Sugar Baby это полностью бесплатно.\n\n" +
      "Основной акцент сделан на приватности, проверке и снижении количества фейковых профилей, чтобы настоящие участники могли общаться с большим доверием.",
    startHint: "Вы будете отвечать на один короткий вопрос за раз. Нажимайте кнопки, когда они есть, или вводите ответ.",
    textHint: "Введите ответ ниже.",
    choiceHint: "Выберите один вариант ниже.",
    photoHint: "Отправьте фото сейчас или нажмите Пропустить, если шаг необязательный.",
    invalidText: "Пожалуйста, отправьте текстовый ответ, чтобы продолжить.",
    invalidPhoto: "Пожалуйста, отправьте фото для этого шага или нажмите Пропустить, если это необязательно.",
    commandHint: "Отправьте /start в любой момент, чтобы начать заново.",
    restartNotice: "Форма перезапущена. Пожалуйста, снова выберите язык.",
    notAgreed: "Хорошо. Так как вы не согласились с условиями, форма не была отправлена. Отправьте /start, если хотите начать заново.",
    success: `Спасибо. Ваш профиль успешно отправлен @${OWNER_USERNAME}.`,
    ownerTitle: "Новая заявка профиля Sugar Baby",
    ownerPhotoCaption: "Отправленное фото",
    ownerLanguage: "Язык",
    ownerUser: "Пользователь",
    ownerUsername: "Username",
    ownerUserId: "ID пользователя",
    ownerChatId: "ID чата",
    ownerSubmittedAt: "Отправлено",
    ownerResponses: "Ответы",
    termsPrompt: "Внимательно прочитайте условия Golden Sugar Daddy. Вы согласны и хотите отправить форму?",
    skipLabel: "Пропустить",
    yes: "Да",
    no: "Нет",
    unknownCommand: "Отправьте /start, чтобы снова открыть пошаговую форму."
  },
  hi: {
    languagePrompt: "Shuru karne ke liye apni language chuniye. Uske baad form step by step chalega.",
    selectedLanguage: "Language select ho gayi. Chaliye isse bahut easy banate hain.",
    welcome:
      "Golden Sugar Daddy, 2023 mein founded, ek verified Sugar Daddy aur Sugar Baby platform ke roop mein bataya jata hai, jahan Sugar Daddies ke liye detailed verification aur Sugar Babies ke liye liveness check hota hai.\n\n" +
      "Agar aap Sugar Baby hain, to poore process mein aapko kuch bhi pay nahi karna hota. Service fee Sugar Daddy pay karta hai, isliye Sugar Babies ke liye yeh bilkul free hai.\n\n" +
      "Focus privacy, screening aur fake profiles ko kam karne par hai, taaki genuine members zyada confidence ke saath connect kar saken.",
    startHint: "Aap ek time par ek chhota question answer karenge. Jahan buttons dikhen, unhe tap karein, warna answer type karein.",
    textHint: "Neeche apna answer type kijiye.",
    choiceHint: "Neeche se ek option chuniye.",
    photoHint: "Ab photo bhejiye, ya optional ho to Skip dabaiye.",
    invalidText: "Please continue karne ke liye text answer bhejiye.",
    invalidPhoto: "Please is step ke liye photo bhejiye, ya agar optional ho to Skip dabaiye.",
    commandHint: "Kabhi bhi restart karne ke liye /start bhejiye.",
    restartNotice: "Form restart ho gaya hai. Dobara language choose kijiye.",
    notAgreed: "Koi baat nahi. Aapne terms agree nahi kiye, isliye form submit nahi hua. Phir se shuru karna ho to /start bhejiye.",
    success: `Thanks. Aapka profile safalta se @${OWNER_USERNAME} ko submit ho gaya hai.`,
    ownerTitle: "Naya Sugar Baby profile submission",
    ownerPhotoCaption: "Bheja gaya photo",
    ownerLanguage: "Language",
    ownerUser: "User",
    ownerUsername: "Username",
    ownerUserId: "User ID",
    ownerChatId: "Chat ID",
    ownerSubmittedAt: "Submitted At",
    ownerResponses: "Responses",
    termsPrompt: "Golden Sugar Daddy ke terms dhyan se padhiye. Kya aap agree karte hain aur form submit karna chahte hain?",
    skipLabel: "Skip",
    yes: "Yes",
    no: "No",
    unknownCommand: "Guided form restart karne ke liye /start bhejiye."
  },
  fa: {
    languagePrompt: "برای شروع زبان خود را انتخاب کنید. بعد از آن فرم به صورت مرحله به مرحله شما را راهنمایی می کند.",
    selectedLanguage: "زبان انتخاب شد. بیایید این کار را خیلی ساده انجام دهیم.",
    welcome:
      "Golden Sugar Daddy که در سال 2023 تاسیس شده، به عنوان یک پلتفرم تایید شده برای Sugar Daddy و Sugar Baby معرفی می شود که برای Sugar Daddy ها بررسی دقیق و برای Sugar Baby ها بررسی زنده بودن انجام می دهد.\n\n" +
      "اگر شما Sugar Baby هستید، در تمام فرایند هیچ مبلغی پرداخت نمی کنید. Sugar Daddy هزینه خدمات را پرداخت می کند، بنابراین برای Sugar Baby ها کاملا رایگان است.\n\n" +
      "تمرکز این روند بر حریم خصوصی، غربالگری و کاهش پروفایل های جعلی است تا اعضای واقعی با اطمینان بیشتری ارتباط بگیرند.",
    startHint: "شما هر بار فقط به یک سوال کوتاه پاسخ می دهید. وقتی دکمه ها نمایش داده می شوند روی آنها بزنید یا پاسخ را تایپ کنید.",
    textHint: "پاسخ خود را پایین تایپ کنید.",
    choiceHint: "یکی از گزینه های زیر را انتخاب کنید.",
    photoHint: "اکنون یک عکس بفرستید یا اگر اختیاری است روی رد کردن بزنید.",
    invalidText: "لطفا برای ادامه یک پاسخ متنی ارسال کنید.",
    invalidPhoto: "لطفا برای این مرحله یک عکس ارسال کنید یا اگر اختیاری است روی رد کردن بزنید.",
    commandHint: "برای شروع دوباره هر زمان /start را ارسال کنید.",
    restartNotice: "فرم دوباره شروع شد. لطفا زبان خود را دوباره انتخاب کنید.",
    notAgreed: "مشکلی نیست. چون با شرایط موافقت نکردید، فرم شما ارسال نشد. اگر خواستید دوباره شروع کنید /start را بفرستید.",
    success: `متشکرم. پروفایل شما با موفقیت برای @${OWNER_USERNAME} ارسال شد.`,
    ownerTitle: "ارسال جدید پروفایل Sugar Baby",
    ownerPhotoCaption: "عکس ارسال شده",
    ownerLanguage: "زبان",
    ownerUser: "کاربر",
    ownerUsername: "نام کاربری",
    ownerUserId: "شناسه کاربر",
    ownerChatId: "شناسه چت",
    ownerSubmittedAt: "زمان ارسال",
    ownerResponses: "پاسخ ها",
    termsPrompt: "شرایط Golden Sugar Daddy را با دقت بخوانید. آیا موافق هستید و می خواهید این فرم را ارسال کنید؟",
    skipLabel: "رد کردن",
    yes: "بله",
    no: "خیر",
    unknownCommand: "برای شروع دوباره فرم مرحله ای، /start را ارسال کنید."
  },
  it: {
    languagePrompt: "Scegli la tua lingua per iniziare. Poi il modulo guidera l'utente passo dopo passo.",
    selectedLanguage: "Lingua selezionata. Rendiamolo davvero semplice.",
    welcome:
      "Golden Sugar Daddy, fondato nel 2023, viene descritto come una piattaforma verificata per Sugar Daddy e Sugar Baby, con verifica dettagliata per i Sugar Daddy e controllo di presenza reale per le Sugar Baby.\n\n" +
      "Se sei una Sugar Baby, non paghi nulla durante tutto il processo. Il Sugar Daddy copre la commissione del servizio, quindi per le Sugar Baby e completamente gratuito.\n\n" +
      "L'attenzione e su privacy, selezione e riduzione dei profili falsi, cosi i membri reali possono entrare in contatto con maggiore fiducia.",
    startHint: "Risponderai a una domanda breve alla volta. Tocca i pulsanti quando compaiono oppure scrivi la tua risposta.",
    textHint: "Scrivi la tua risposta qui sotto.",
    choiceHint: "Tocca una delle opzioni qui sotto.",
    photoHint: "Invia una foto adesso oppure tocca Salta se e facoltativa.",
    invalidText: "Per continuare, invia una risposta testuale.",
    invalidPhoto: "Per questo passaggio invia una foto oppure tocca Salta se e facoltativo.",
    commandHint: "Invia /start in qualsiasi momento per ricominciare il modulo.",
    restartNotice: "Il modulo e stato riavviato. Scegli di nuovo la tua lingua.",
    notAgreed: "Nessun problema. Dato che non hai accettato i termini, il modulo non e stato inviato. Invia /start se vuoi ricominciare.",
    success: `Grazie. Il tuo profilo e stato inviato con successo a @${OWNER_USERNAME}.`,
    ownerTitle: "Nuova candidatura profilo Sugar Baby",
    ownerPhotoCaption: "Foto inviata",
    ownerLanguage: "Lingua",
    ownerUser: "Utente",
    ownerUsername: "Username",
    ownerUserId: "ID utente",
    ownerChatId: "ID chat",
    ownerSubmittedAt: "Inviato il",
    ownerResponses: "Risposte",
    termsPrompt: "Leggi attentamente i termini di Golden Sugar Daddy. Sei d'accordo e vuoi inviare questo modulo?",
    skipLabel: "Salta",
    yes: "Si",
    no: "No",
    unknownCommand: "Invia /start per riaprire il modulo guidato."
  },
  de: {
    languagePrompt: "Waehle deine Sprache, um zu beginnen. Danach fuehrt das Formular den Nutzer Schritt fuer Schritt.",
    selectedLanguage: "Sprache ausgewaehlt. Wir machen das jetzt so einfach wie moeglich.",
    welcome:
      "Golden Sugar Daddy, gegruendet im Jahr 2023, wird als verifizierte Plattform fuer Sugar Daddies und Sugar Babies beschrieben, mit detaillierter Pruefung fuer Sugar Daddies und einer Liveness-Pruefung fuer Sugar Babies.\n\n" +
      "Wenn du eine Sugar Baby bist, zahlst du waehrend des gesamten Prozesses nichts. Der Sugar Daddy traegt die Servicegebuehr, daher ist es fuer Sugar Babies komplett kostenlos.\n\n" +
      "Der Fokus liegt auf Privatsphaere, Pruefung und der Reduzierung von Fake-Profilen, damit echte Mitglieder mit mehr Vertrauen Kontakt aufnehmen koennen.",
    startHint: "Du beantwortest jeweils nur eine kurze Frage. Tippe auf Buttons, wenn sie angezeigt werden, oder schreibe deine Antwort.",
    textHint: "Schreibe deine Antwort unten.",
    choiceHint: "Waehle unten eine Option aus.",
    photoHint: "Sende jetzt ein Foto oder tippe auf Ueberspringen, wenn es optional ist.",
    invalidText: "Bitte sende eine Textantwort, damit ich fortfahren kann.",
    invalidPhoto: "Bitte sende fuer diesen Schritt ein Foto oder tippe auf Ueberspringen, wenn es optional ist.",
    commandHint: "Sende jederzeit /start, um das Formular neu zu starten.",
    restartNotice: "Das Formular wurde neu gestartet. Bitte waehle deine Sprache erneut.",
    notAgreed: "Kein Problem. Da du den Bedingungen nicht zugestimmt hast, wurde das Formular nicht gesendet. Sende /start, wenn du neu beginnen moechtest.",
    success: `Danke. Dein Profil wurde erfolgreich an @${OWNER_USERNAME} gesendet.`,
    ownerTitle: "Neue Sugar Baby Profiluebermittlung",
    ownerPhotoCaption: "Gesendetes Foto",
    ownerLanguage: "Sprache",
    ownerUser: "Nutzer",
    ownerUsername: "Username",
    ownerUserId: "Nutzer-ID",
    ownerChatId: "Chat-ID",
    ownerSubmittedAt: "Gesendet am",
    ownerResponses: "Antworten",
    termsPrompt: "Bitte lies die Bedingungen von Golden Sugar Daddy sorgfaeltig. Stimmst du zu und moechtest du das Formular absenden?",
    skipLabel: "Ueberspringen",
    yes: "Ja",
    no: "Nein",
    unknownCommand: "Sende /start, um das gefuehrte Formular neu zu starten."
  }
};

const STEP_DEFINITIONS = [
  { id: "name", kind: "text", labels: { en: "Name/Nickname", es: "Nombre o Apodo", fr: "Nom ou Surnom", ru: "Имя или Ник", hi: "Name/Nickname", fa: "نام یا لقب", it: "Nome o Soprannome", de: "Name/Spitzname" } },
  { id: "age", kind: "text", labels: { en: "Age", es: "Edad", fr: "Age", ru: "Возраст", hi: "Age", fa: "سن", it: "Eta", de: "Alter" } },
  { id: "location", kind: "text", labels: { en: "Location", es: "Ubicacion", fr: "Localisation", ru: "Локация", hi: "Location", fa: "موقعیت", it: "Posizione", de: "Standort" } },
  { id: "height", kind: "text", labels: { en: "Height", es: "Altura", fr: "Taille", ru: "Рост", hi: "Height", fa: "قد", it: "Altezza", de: "Groesse" } },
  { id: "weight", kind: "text", labels: { en: "Weight", es: "Peso", fr: "Poids", ru: "Вес", hi: "Weight", fa: "وزن", it: "Peso", de: "Gewicht" } },
  { id: "bodyType", kind: "text", labels: { en: "Body Type", es: "Tipo de Cuerpo", fr: "Morphologie", ru: "Тип тела", hi: "Body Type", fa: "تیپ بدنی", it: "Tipo di Corpo", de: "Koerpertyp" } },
  { id: "breastSize", kind: "text", labels: { en: "Breast Size", es: "Tamano de Pecho", fr: "Taille de Poitrine", ru: "Размер груди", hi: "Breast Size", fa: "سایز سینه", it: "Taglia del Seno", de: "Brustgroesse" } },
  { id: "buttSize", kind: "choice", options: ["small", "medium", "large"], labels: { en: "Butt Size", es: "Tamano de Gluteos", fr: "Taille des Fesses", ru: "Размер ягодиц", hi: "Butt Size", fa: "اندازه باسن", it: "Taglia dei Glutei", de: "Po-Groesse" } },
  { id: "ethnicity", kind: "text", labels: { en: "Ethnicity", es: "Etnia", fr: "Origine Ethnique", ru: "Этничность", hi: "Ethnicity", fa: "قومیت", it: "Etnia", de: "Ethnie" } },
  { id: "tattoos", kind: "yesno", labels: { en: "Tattoos/Piercings", es: "Tatuajes o Piercings", fr: "Tatouages/Piercings", ru: "Тату/Пирсинг", hi: "Tattoos/Piercings", fa: "تتو/پیرسینگ", it: "Tatuaggi/Piercing", de: "Tattoos/Piercings" } },
  { id: "occupation", kind: "text", labels: { en: "Occupation/Student", es: "Ocupacion o Estudiante", fr: "Profession/Etudiante", ru: "Работа/Учеба", hi: "Occupation/Student", fa: "شغل/دانشجو", it: "Occupazione/Studentessa", de: "Beruf/Studentin" } },
  { id: "travel", kind: "yesno", labels: { en: "Open to Travel", es: "Disponible para Viajar", fr: "Ouverte aux Voyages", ru: "Готовы к поездкам", hi: "Open to Travel", fa: "مایل به سفر", it: "Disponibile a Viaggiare", de: "Reisebereit" } },
  { id: "videoCall", kind: "yesno", labels: { en: "Can do Video Call", es: "Puede hacer Videollamada", fr: "Peut faire un Appel Video", ru: "Готовы к видеозвонку", hi: "Can do Video Call", fa: "امکان تماس ویدیویی", it: "Puoi fare Videochiamata", de: "Videocall moeglich" } },
  { id: "arrangement", kind: "text", labels: { en: "Preferred Type of Arrangement", es: "Tipo de Arreglo Preferido", fr: "Type d'Arrangement Prefere", ru: "Предпочитаемый формат отношений", hi: "Preferred Type of Arrangement", fa: "نوع ترجیحی رابطه", it: "Tipo di Accordo Preferito", de: "Bevorzugte Art der Vereinbarung" } },
  { id: "allowance", kind: "text", labels: { en: "Allowance Expectation", es: "Expectativa de Asignacion", fr: "Attente d'Allocation", ru: "Ожидание по allowance", hi: "Allowance Expectation", fa: "انتظار مالی", it: "Aspettativa di Allowance", de: "Allowance-Erwartung" } },
  { id: "communication", kind: "choice", options: ["text", "calls", "video", "inperson"], labels: { en: "Preferred Communication Style", es: "Comunicacion Preferida", fr: "Style de Communication Prefere", ru: "Предпочтительный стиль общения", hi: "Preferred Communication Style", fa: "سبک ارتباطی ترجیحی", it: "Stile di Comunicazione Preferito", de: "Bevorzugte Kommunikationsart" } },
  { id: "boundaries", kind: "text", labels: { en: "Boundaries & Restrictions", es: "Limites o Restricciones", fr: "Limites et Restrictions", ru: "Границы и ограничения", hi: "Boundaries & Restrictions", fa: "مرزها و محدودیت ها", it: "Limiti e Restrizioni", de: "Grenzen und Einschraenkungen" } },
  { id: "facePhoto", kind: "photo", labels: { en: "Clear Face Photo", es: "Foto Clara del Rostro", fr: "Photo Claire du Visage", ru: "Четкое фото лица", hi: "Clear Face Photo", fa: "عکس واضح چهره", it: "Foto Chiara del Viso", de: "Klares Gesichtsfoto" } },
  { id: "fullBodyPhoto", kind: "photo", labels: { en: "Full-Body Photo", es: "Foto de Cuerpo Completo", fr: "Photo en Pied", ru: "Фото в полный рост", hi: "Full-Body Photo", fa: "عکس تمام قد", it: "Foto a Figura Intera", de: "Ganzkoerperfoto" } },
  { id: "extraPhoto", kind: "photo_optional", labels: { en: "Optional Additional Photo", es: "Foto Adicional Opcional", fr: "Photo Supplementaire Facultative", ru: "Дополнительное фото", hi: "Optional Additional Photo", fa: "عکس اضافی اختیاری", it: "Foto Aggiuntiva Facoltativa", de: "Optionales Zusatzfoto" } },
  { id: "terms", kind: "terms", labels: { en: "Terms Agreement", es: "Aceptacion de Terminos", fr: "Accord des Conditions", ru: "Согласие с условиями", hi: "Terms Agreement", fa: "توافق با شرایط", it: "Accordo ai Termini", de: "Zustimmung zu den Bedingungen" } }
];

const OPTION_LABELS = {
  buttSize: {
    small: { en: "Small", es: "Pequeno", fr: "Petit", ru: "Маленький", hi: "Small", fa: "کوچک", it: "Piccolo", de: "Klein" },
    medium: { en: "Medium", es: "Mediano", fr: "Moyen", ru: "Средний", hi: "Medium", fa: "متوسط", it: "Medio", de: "Mittel" },
    large: { en: "Large", es: "Grande", fr: "Grand", ru: "Большой", hi: "Large", fa: "بزرگ", it: "Grande", de: "Gross" }
  },
  communication: {
    text: { en: "Text", es: "Texto", fr: "Texte", ru: "Текст", hi: "Text", fa: "متن", it: "Testo", de: "Text" },
    calls: { en: "Calls", es: "Llamadas", fr: "Appels", ru: "Звонки", hi: "Calls", fa: "تماس", it: "Chiamate", de: "Anrufe" },
    video: { en: "Video", es: "Video", fr: "Video", ru: "Видео", hi: "Video", fa: "ویدیو", it: "Video", de: "Video" },
    inperson: { en: "In-person", es: "En persona", fr: "En personne", ru: "Лично", hi: "In-person", fa: "حضوری", it: "Dal vivo", de: "Persoenlich" }
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
        return redis.set(`form-session:${chatId}`, session, { ex: MEMORY_SESSION_TTL_SECONDS });
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
  return {
    ...session,
    updatedAt: new Date().toISOString()
  };
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
  const copy = getCopy(languageCode);
  return [copy.welcome, "", copy.startHint].join("\n");
}

export function buildStepPrompt(session) {
  const languageCode = session?.languageCode || "en";
  const copy = getCopy(languageCode);
  const step = getStepDefinition(session?.stepIndex || 0);

  if (!step) {
    return copy.unknownCommand;
  }

  const label = getStepLabel(step, languageCode);
  const stepNumber = (session?.stepIndex || 0) + 1;
  const totalSteps = STEP_DEFINITIONS.length;

  let hint = copy.textHint;
  if (step.kind === "choice" || step.kind === "yesno" || step.kind === "terms") {
    hint = copy.choiceHint;
  } else if (step.kind === "photo" || step.kind === "photo_optional") {
    hint = copy.photoHint;
  }

  if (step.kind === "terms") {
    hint = copy.termsPrompt;
  }

  return `Step ${stepNumber}/${totalSteps}\n${label}\n\n${hint}`;
}

export function buildStepKeyboard(step, languageCode) {
  const copy = getCopy(languageCode);

  if (!step) {
    return undefined;
  }

  if (step.kind === "yesno" || step.kind === "terms") {
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
    ...extra
  });
}

async function sendPhoto(chatId, fileId, extra = {}) {
  return callTelegram("sendPhoto", {
    chat_id: chatId,
    photo: fileId,
    ...extra
  });
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
  const text = buildStepPrompt(session);
  const keyboard = buildStepKeyboard(step, session?.languageCode || "en");
  return sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : {});
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

  const photoSteps = ["facePhoto", "fullBodyPhoto", "extraPhoto"];
  for (const stepId of photoSteps) {
    const fileId = session?.answers?.[stepId];
    if (fileId && fileId !== "skipped") {
      const step = STEP_DEFINITIONS.find((entry) => entry.id === stepId);
      const label = getStepLabel(step, languageCode);
      await sendPhoto(OWNER_CHAT_ID, fileId, {
        caption: `${copy.ownerPhotoCaption}: ${label}`
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
    stepIndex: (session?.stepIndex || 0) + 1
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
  if (!photos.length) {
    return null;
  }

  return photos[photos.length - 1]?.file_id || null;
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

  const step = getStepDefinition(session?.stepIndex || 0);
  if (!step) {
    await clearSession(chatId);
    await sendMessage(chatId, COPY.en.unknownCommand);
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
    await answerCallbackQuery(callbackQueryId, COPY[parsed.stepId]?.selectedLanguage || COPY.en.selectedLanguage);
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
