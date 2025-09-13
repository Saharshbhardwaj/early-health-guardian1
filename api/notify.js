// api/notify.js
// Forwards notify requests to Google Apps Script mailer
const WEBHOOK_URL = process.env.MAIL_WEBHOOK_URL;
const WEBHOOK_TOKEN = process.env.MAIL_WEBHOOK_TOKEN;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  if (!WEBHOOK_URL || !WEBHOOK_TOKEN) {
    return res.status(500).json({ error: "Mailer webhook not configured (set MAIL_WEBHOOK_URL and MAIL_WEBHOOK_TOKEN)" });
  }

  const payload = req.body || {};
  if (!payload.to || !payload.subject) {
    return res.status(400).json({ error: "Missing 'to' or 'subject' in payload" });
  }

  // Build forward payload
  const forward = {
    to: payload.to,
    subject: payload.subject,
    html: payload.html || "",
    text: payload.text || "",
    token: WEBHOOK_TOKEN
  };

  try {
    const rr = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forward)
    });

    const json = await rr.json().catch(() => null);

    if (!rr.ok) {
      console.error("Webhook response error", rr.status, json);
      return res.status(500).json({ error: "Mailer webhook failed", details: json || { status: rr.status } });
    }

    return res.status(200).json({ ok: true, result: json });
  } catch (err) {
    console.error("notify forward error", err);
    return res.status(500).json({ error: String(err) });
  }
}
