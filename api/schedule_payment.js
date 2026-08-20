import {
  PaymentStoreError,
  buildPublicPaymentRecord,
  upsertPaymentSchedule,
  verifyScheduleAccess
} from "./_paymentStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const reference = String(req.body?.ref || "").trim().toUpperCase();
  const action = String(req.body?.action || "").trim().toLowerCase();
  const verificationCode = String(req.body?.verificationCode || "").trim();

  if (!reference) {
    return res.status(400).json({ ok: false, error: "Missing ref" });
  }

  if (!verificationCode) {
    return res.status(400).json({ ok: false, error: "Missing verification code" });
  }

  if (!["verify", "save"].includes(action)) {
    return res.status(400).json({ ok: false, error: "Invalid action" });
  }

  try {
    if (action === "verify") {
      const record = await verifyScheduleAccess(reference, verificationCode);
      return res.status(200).json({
        ok: true,
        verified: true,
        payment: buildPublicPaymentRecord(record)
      });
    }

    const updated = await upsertPaymentSchedule(reference, {
      verificationCode,
      bankName: req.body?.bankName,
      accountHolder: req.body?.accountHolder,
      accountNumber: req.body?.accountNumber,
      startDate: req.body?.startDate
    });

    return res.status(200).json({
      ok: true,
      verified: true,
      payment: buildPublicPaymentRecord(updated)
    });
  } catch (error) {
    if (error instanceof PaymentStoreError) {
      return res.status(error.statusCode).json({
        ok: false,
        error: error.message
      });
    }

    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to schedule payment"
    });
  }
}
