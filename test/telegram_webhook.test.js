import test from "node:test";
import assert from "node:assert/strict";

import {
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
  assert.match(text, /Golden Sugar Daddy, founded in 2023/i);
  assert.doesNotMatch(text, /Step 1\/21/i);
});

test("buildStepPrompt renders a text step without visible progress numbering", () => {
  const text = buildStepPrompt({
    languageCode: "en",
    stepIndex: 1
  });

  assert.match(text, /Please answer this:/i);
  assert.match(text, /Name\/Nickname/);
  assert.match(text, /Type your answer below/i);
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
  assert.equal(buttSizeKeyboard.inline_keyboard[0][0].text, "Small");
  assert.equal(extraPhotoKeyboard.inline_keyboard[0][0].text, "Skip");
  assert.equal(termsKeyboard.inline_keyboard[0][0].text, "Read Terms");
  assert.equal(termsKeyboard.inline_keyboard[0][0].url, getTermsUrl("en"));
  assert.equal(termsKeyboard.inline_keyboard[1][0].text, "Yes");
  assert.equal(termsKeyboard.inline_keyboard[1][1].text, "No");
});

test("getTermsUrl includes the selected language", () => {
  assert.match(getTermsUrl("es"), /\?lang=es$/);
  assert.match(getTermsUrl("ru"), /\?lang=ru$/);
});
