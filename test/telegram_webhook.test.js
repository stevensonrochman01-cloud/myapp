import test from "node:test";
import assert from "node:assert/strict";

import {
  formatForwardedMessageWarning,
  shouldRetryWithoutParseMode
} from "../api/telegram_webhook.js";

test("formatForwardedMessageWarning escapes markdown characters in usernames", () => {
  const text = formatForwardedMessageWarning({
    id: 5678808034,
    username: "lady_liliane89",
    first_name: "Lady"
  });

  assert.equal(
    text,
    "⚠️ @lady\\_liliane89 Forwarded messages are not allowed in this group.\n_Please share content directly — no forwards. 🚫_"
  );
});

test("formatForwardedMessageWarning falls back to tg user mention for users without usernames", () => {
  const text = formatForwardedMessageWarning({
    id: 12345,
    first_name: "A_B"
  });

  assert.equal(
    text,
    "⚠️ [A\\_B](tg://user?id=12345) Forwarded messages are not allowed in this group.\n_Please share content directly — no forwards. 🚫_"
  );
});

test("shouldRetryWithoutParseMode matches Telegram markdown parse failures", () => {
  assert.equal(
    shouldRetryWithoutParseMode({
      ok: false,
      error_code: 400,
      description: "Bad Request: can't parse entities: Can't find end of the entity starting at byte offset 30"
    }),
    true
  );

  assert.equal(
    shouldRetryWithoutParseMode({
      ok: false,
      error_code: 400,
      description: "Bad Request: message is too long"
    }),
    false
  );
});
