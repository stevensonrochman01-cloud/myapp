import test from "node:test";
import assert from "node:assert/strict";

import { formatForwardedMessageWarning } from "../api/telegram_webhook.js";

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
