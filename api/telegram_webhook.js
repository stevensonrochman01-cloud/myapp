export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).send("ok");

    const chat = message.chat;
    const user = message.from;
    if (!chat || !user) return res.status(200).send("ok");

    // Only act in groups
    if (chat.type !== "group" && chat.type !== "supergroup") {
      return res.status(200).send("ok");
    }

    if (user.is_bot) return res.status(200).send("ok");

    const username = user.username; // can be undefined
    if (!username) return res.status(200).send("ok"); // your verify API uses username

    // Call your verify API
    const verifyUrl = `https://myapp-git-main-stebes-projects.vercel.app/api/verify?username=${encodeURIComponent(username)}`;
    const vr = await fetch(verifyUrl, { method: "GET" });
    const vjson = await vr.json();

    if (vjson.verified === true) return res.status(200).send("ok");

    // If unverified, reply (quote their message)
    const botToken = '8111507659:AAHtUZCkKPXNmLSxii02hlUaf3-qRfSDHxg';
    const verifyLink = process.env.VERIFY_LINK || "https://myapp-git-main-stebes-projects.vercel.app/verify_profile.html";

    const text =
      `@${username}, unverified profile.\n` +
      `Verify your profile to avoid being scammed.\n` +
      `${verifyLink}`;

    const sendUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(sendUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chat.id,
        text,
        reply_to_message_id: message.message_id,
        disable_web_page_preview: true
      })
    });

    return res.status(200).send("ok");
  } catch (e) {
    console.error("telegram_webhook_error", e);
    return res.status(200).send("ok"); // Telegram expects 200
  }
}
