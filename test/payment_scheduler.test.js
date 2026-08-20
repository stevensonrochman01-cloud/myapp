import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPaymentRecord,
  buildPublicPaymentRecord,
  getPublicPayoutMethods,
  markPaymentCompleted,
  markPaymentDelivered,
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

test("scheduling supports popular non-bank payout methods and keeps delivered visible until manually confirmed", async () => {
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
      method: "paypal",
      accountHolder: "Mia Harper",
      destinationValue: "mia.receiver@example.com",
      startDate: "2026-08-20"
    },
    new Date("2026-08-20T12:00:00Z")
  );

  const publicRecord = buildPublicPaymentRecord(scheduled, new Date("2026-08-30T12:00:00Z"));
  const scheduler = publicRecord.scheduler.schedule;

  assert.equal(publicRecord.scheduler.hasSchedule, true);
  assert.equal(scheduler.payoutMethod, "paypal");
  assert.equal(scheduler.payoutMethodLabel, "PayPal");
  assert.equal(scheduler.destinationMasked, "mi***er@example.com");
  assert.equal(scheduler.currentStage.key, "validation");
  assert.equal(scheduler.nextStage?.key, "delivered");
  assert.match(scheduler.publicNote, /manually marks the payout as delivered/i);
});

test("manual delivery confirmation moves the tracker to delivered", async () => {
  const record = buildPaymentRecord({
    recipientName: "Luna",
    payerName: "James",
    amount: 900
  });

  await savePaymentRecord(record);
  const completed = await markPaymentCompleted(record.reference);

  await upsertPaymentSchedule(
    record.reference,
    {
      verificationCode: completed.scheduleVerificationCode,
      method: "venmo",
      accountHolder: "Luna Chase",
      destinationValue: "@lunachase",
      startDate: "2026-08-20"
    },
    new Date("2026-08-20T12:00:00Z")
  );

  const delivered = await markPaymentDelivered(record.reference, new Date("2026-08-27T15:30:00Z"));
  const publicRecord = buildPublicPaymentRecord(delivered, new Date("2026-08-30T12:00:00Z"));
  const scheduler = publicRecord.scheduler.schedule;

  assert.equal(scheduler.currentStage.key, "delivered");
  assert.equal(scheduler.nextStage, null);
  assert.equal(scheduler.deliveredAt, "2026-08-27T15:30:00.000Z");
  assert.match(scheduler.publicNote, /manually confirmed by the admin on 2026-08-27/i);
});

test("public payout methods expose multiple scheduler options", () => {
  const methods = getPublicPayoutMethods();
  const codes = methods.map((method) => method.code);

  assert.deepEqual(codes, [
    "bank_transfer",
    "paypal",
    "zelle",
    "venmo",
    "cash_app",
    "wise"
  ]);

  const venmo = methods.find((method) => method.code === "venmo");
  assert.equal(venmo?.destinationLabel, "Venmo username");
  assert.equal(venmo?.providerRequired, false);
});
