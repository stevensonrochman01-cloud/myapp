import test from "node:test";
import assert from "node:assert/strict";

import {
  PAYMENT_SERVICE_FEE,
  buildPaymentRecord,
  parseAmountInput,
  parsePaymentCompletionText
} from "../api/_paymentStore.js";

import {
  buildGroupWelcomeMessage,
  buildLanguageKeyboard,
  buildLanguagePrompt,
  buildStepKeyboard,
  buildStepPrompt,
  buildWelcomeMessage,
  escapeHtml,
  getTermsUrl,
  isTelegramCommand
} from "../api/telegram_webhook.js";

test("escapeHtml protects owner summary values", () => {
  assert.equal(escapeHtml(`<Admin & "Owner">`), "&lt;Admin &amp; &quot;Owner&quot;&gt;");
});

test("isTelegramCommand detects telegram commands", () => {
  assert.equal(isTelegramCommand("/start"), true);
  assert.equal(isTelegramCommand("/help me"), true);
  assert.equal(isTelegramCommand("hello there"), false);
});

test("buildLanguagePrompt asks the user to pick a language first", () => {
  const text = buildLanguagePrompt();
  assert.match(text, /<b>Golden Sugar Daddy<\/b>/);
  assert.match(text, /choose your language/i);
  assert.match(text, /\/start/);
});

test("buildLanguageKeyboard exposes the requested languages with flags", () => {
  const keyboard = buildLanguageKeyboard();
  const labels = keyboard.inline_keyboard.flat().map((button) => button.text);

  assert.ok(labels.includes("🇬🇧 English"));
  assert.ok(labels.includes("🇪🇸 Español"));
  assert.ok(labels.includes("🇫🇷 Français"));
  assert.ok(labels.includes("🇷🇺 Русский"));
  assert.ok(labels.includes("🇮🇳 हिन्दी"));
  assert.ok(labels.includes("🇮🇷 فارسی"));
  assert.ok(labels.includes("🇮🇹 Italiano"));
  assert.ok(labels.includes("🇩🇪 Deutsch"));
});

test("buildWelcomeMessage contains the simpler guided-flow intro", () => {
  const text = buildWelcomeMessage("en");
  assert.match(text, /<b>Golden Sugar Daddy<\/b>/);
  assert.match(text, /Golden Sugar Daddy, founded in 2023/i);
  assert.doesNotMatch(text, /Step 1\/21/i);
});

test("buildGroupWelcomeMessage greets joined members and tells them to submit the form", () => {
  const text = buildGroupWelcomeMessage({
    id: 42,
    first_name: "Alice",
    last_name: "Stone"
  });

  assert.match(text, /<b>Golden Sugar Daddy<\/b>/);
  assert.match(text, /Hello <a href="tg:\/\/user\?id=42">Alice Stone<\/a>/);
  assert.match(text, /submit your form in private/i);
  assert.match(text, /sending \/start/i);
});

test("payment helpers add the service fee and parse owner completion text", () => {
  const record = buildPaymentRecord({
    recipientName: "Anna",
    payerName: "John",
    amount: 500
  });

  assert.equal(record.amount, 500);
  assert.equal(record.serviceFee, PAYMENT_SERVICE_FEE);
  assert.equal(record.totalAmount, 500 + PAYMENT_SERVICE_FEE);
  assert.match(record.reference, /^X[A-Z0-9]{6}$/);
  assert.match(record.paymentUrl, /\?ref=X[A-Z0-9]{6}$/);
  assert.equal(parsePaymentCompletionText(`${record.reference} done`), record.reference);
  assert.equal(parsePaymentCompletionText("not a completion"), null);
  assert.equal(parseAmountInput("$780.50"), 780.5);
  assert.equal(parseAmountInput("abc"), null);
});

test("buildStepPrompt renders a text step without visible progress numbering", () => {
  const text = buildStepPrompt({
    languageCode: "en",
    stepIndex: 1
  });

  assert.match(text, /<b>What is your name\?<\/b>/i);
  assert.match(text, /<i>Type your answer below\.<\/i>/i);
  assert.doesNotMatch(text, /Step \d+/i);
});

test("buildStepKeyboard renders choice, skip, and terms-link actions for guided steps", () => {
  const buttSizeKeyboard = buildStepKeyboard(
    { id: "buttSize", kind: "choice", options: ["small", "medium", "large"] },
    "en"
  );
  const extraPhotoKeyboard = buildStepKeyboard(
    { id: "extraPhoto", kind: "photo_optional" },
    "en"
  );
  const termsKeyboard = buildStepKeyboard(
    { id: "terms", kind: "terms" },
    "en"
  );

  assert.equal(buttSizeKeyboard.inline_keyboard.length, 3);
  assert.equal(buttSizeKeyboard.inline_keyboard[0][0].text, "🔹 Small");
  assert.equal(extraPhotoKeyboard.inline_keyboard[0][0].text, "⏭ Skip");
  assert.equal(termsKeyboard.inline_keyboard[0][0].text, "📄 Read Terms");
  assert.equal(termsKeyboard.inline_keyboard[0][0].url, getTermsUrl("en"));
  assert.equal(termsKeyboard.inline_keyboard[1][0].text, "✅ Yes");
  assert.equal(termsKeyboard.inline_keyboard[1][1].text, "❌ No");
});

test("getTermsUrl includes the selected language", () => {
  assert.match(getTermsUrl("es"), /\?lang=es$/);
  assert.match(getTermsUrl("ru"), /\?lang=ru$/);
});
