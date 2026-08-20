import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPaymentRecord,
  buildPublicPaymentRecord,
  markPaymentCompleted,
  savePaymentRecord,
  upsertPaymentSchedule,
  validateScheduleStartDate,
  verifyScheduleAccess
} from "../api/_paymentStore.js";

test("markPaymentCompleted issues a scheduler verification code", async () => {
  const record = buildPaymentRecord({
    recipientName: "Sophia",
    payerName: "Daniel",
    amount: 800
  });

  await savePaymentRecord(record);
  const updated = await markPaymentCompleted(record.reference);

  assert.equal(updated.status, "completed");
  assert.match(updated.scheduleVerificationCode, /^[A-Z0-9]{8}$/);
  assert.ok(updated.scheduleVerificationIssuedAt);
});

test("validateScheduleStartDate rejects past dates and accepts today or future", () => {
  assert.throws(
    () => validateScheduleStartDate("2026-08-19", new Date("2026-08-20T09:00:00Z")),
    /today or later/i
  );

  assert.equal(
    validateScheduleStartDate("2026-08-20", new Date("2026-08-20T09:00:00Z")),
    "2026-08-20"
  );
});

test("scheduling requires the approval code and public tracking stops at validation", async () => {
  const record = buildPaymentRecord({
    recipientName: "Mia",
    payerName: "Oliver",
    amount: 1200
  });

  await savePaymentRecord(record);
  const completed = await markPaymentCompleted(record.reference);
  await verifyScheduleAccess(record.reference, completed.scheduleVerificationCode);

  const scheduled = await upsertPaymentSchedule(
    record.reference,
    {
      verificationCode: completed.scheduleVerificationCode,
      bankName: "Atlantic Trust",
      accountHolder: "Mia Harper",
      accountNumber: "9876543210",
      startDate: "2026-08-20"
    },
    new Date("2026-08-20T12:00:00Z")
  );

  const publicRecord = buildPublicPaymentRecord(scheduled, new Date("2026-08-30T12:00:00Z"));
  const scheduler = publicRecord.scheduler.schedule;

  assert.equal(publicRecord.scheduler.hasSchedule, true);
  assert.equal(scheduler.bankAccountMasked, "•••• 3210");
  assert.equal(scheduler.currentStage.key, "validation");
  assert.equal(scheduler.hiddenStage.key, "delivered");
  assert.equal(scheduler.nextStage, null);
});
