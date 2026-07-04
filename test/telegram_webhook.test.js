import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOwnerSubmissionMessage,
  escapeHtml,
  isTelegramCommand
} from "../api/telegram_webhook.js";

test("escapeHtml protects user text before sending HTML messages", () => {
  assert.equal(escapeHtml(`<Admin & "Owner">`), "&lt;Admin &amp; &quot;Owner&quot;&gt;");
});

test("isTelegramCommand detects bot commands and ignores ordinary messages", () => {
  assert.equal(isTelegramCommand("/start"), true);
  assert.equal(isTelegramCommand("/help Golden"), true);
  assert.equal(isTelegramCommand("Full name: Sarah"), false);
});

test("buildOwnerSubmissionMessage includes sender info and escapes the submission body", () => {
  const text = buildOwnerSubmissionMessage({
    text: "Full name: Sarah <Doe>\nCity: London & Dubai",
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
  assert.match(text, /Full name: Sarah &lt;Doe&gt;/);
  assert.match(text, /City: London &amp; Dubai/);
});
