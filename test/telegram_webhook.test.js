import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLanguagePrompt,
  buildLocalizedFormMessage,
  buildOwnerSubmissionMessage,
  detectAgreement,
  escapeHtml,
  guessLanguageFromText,
  isTelegramCommand
} from "../api/telegram_webhook.js";

test("escapeHtml protects user text before sending HTML messages", () => {
  assert.equal(escapeHtml(`<Admin & "Owner">`), "&lt;Admin &amp; &quot;Owner&quot;&gt;");
});

test("isTelegramCommand detects bot commands and ignores ordinary messages", () => {
  assert.equal(isTelegramCommand("/start"), true);
  assert.equal(isTelegramCommand("/help Golden"), true);
  assert.equal(isTelegramCommand("Name: Sarah"), false);
});

test("buildLanguagePrompt invites the user to pick a language first", () => {
  const text = buildLanguagePrompt();
  assert.match(text, /choose your language/i);
});

test("buildLocalizedFormMessage returns the shorter English form with terms guidance", () => {
  const text = buildLocalizedFormMessage("en");
  assert.match(text, /Golden Sugar Daddy, founded in 2023/i);
  assert.match(text, /Sugar Baby Profile Form/);
  assert.match(text, /Butt Size: Small \/ Medium \/ Large/);
  assert.match(text, /Terms Agreement: Yes \/ No/);
});

test("detectAgreement recognizes yes, no, and missing outcomes", () => {
  assert.equal(detectAgreement("Terms Agreement: Yes"), "yes");
  assert.equal(detectAgreement("Acepta los Terminos: Si"), "yes");
  assert.equal(detectAgreement("Soglasie s Usloviyami: Da"), "yes");
  assert.equal(detectAgreement("Terms Agreement: No"), "no");
  assert.equal(detectAgreement("Name: Sarah"), "missing");
});

test("guessLanguageFromText detects Spanish and Russian form submissions", () => {
  assert.equal(guessLanguageFromText("Acepta los Terminos: Si\nUbicacion: Madrid"), "es");
  assert.equal(guessLanguageFromText("Soglasie s Usloviyami: Da\nMestopolozhenie: Moskva"), "ru");
  assert.equal(guessLanguageFromText("Name: Sarah\nTerms Agreement: Yes"), "en");
});

test("buildOwnerSubmissionMessage includes sender info and escapes the submission body", () => {
  const text = buildOwnerSubmissionMessage({
    text: "Name: Sarah <Doe>\nLocation: London & Dubai\nTerms Agreement: Yes",
    chat: { id: 55501 },
    from: {
      id: 8217479753,
      username: "GoldenSugarAdmin",
      first_name: "Admin",
      last_name: "Sugar"
    }
  });

  assert.match(text, /<b>New bot form submission<\/b>/);
  assert.match(text, /<b>Username:<\/b> @GoldenSugarAdmin/);
  assert.match(text, /<b>User ID:<\/b> 8217479753/);
  assert.match(text, /Name: Sarah &lt;Doe&gt;/);
  assert.match(text, /Location: London &amp; Dubai/);
});
