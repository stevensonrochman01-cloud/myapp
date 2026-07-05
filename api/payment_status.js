import { getPaymentRecord } from "./_paymentStore.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const reference = String(req.query?.ref || "").trim().toUpperCase();
  if (!reference) {
    return res.status(400).json({ ok: false, error: "Missing ref" });
  }

  try {
    const record = await getPaymentRecord(reference);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Payment request not found" });
    }

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      ok: true,
      payment: {
        reference: record.reference,
        recipientName: record.recipientName,
        payerName: record.payerName,
        amount: record.amount,
        serviceFee: record.serviceFee,
        totalAmount: record.totalAmount,
        status: record.status,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
        paymentUrl: record.paymentUrl,
        checkoutUrls: record.checkoutUrls
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to load payment status"
    });
  }
}
