// api/notify.js
import fetch from "node-fetch"; // Vercel Node has fetch, but include for local dev
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const { to, channel, title, body, meta } = req.body || {};
  if (!to || !channel) return res.status(400).json({ error: "missing to/channel" });

  try {
    if (channel === "email") {
      const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
      if (!SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY env");
      const payload = {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.NOTIFY_FROM_EMAIL || "no-reply@earlyhealthguardian.app" },
        subject: title || "Early Health Guardian Alert",
        content: [{ type: "text/plain", value: body || "" }]
      };
      const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const txt = await r.text();
        console.error("sendgrid error", txt);
        return res.status(500).json({ error: "sendgrid failed", detail: txt });
      }
      return res.status(200).json({ ok: true });
    } else if (channel === "sms") {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM;
      if (!accountSid || !authToken || !from) throw new Error("Missing Twilio env vars");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const form = new URLSearchParams();
      form.append("From", from);
      form.append("To", to);
      form.append("Body", title + "\n\n" + body);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
      });
      const payload = await response.json();
      if (!response.ok) {
        console.error("twilio error", payload);
        return res.status(500).json({ error: "twilio failed", detail: payload });
      }
      return res.status(200).json({ ok: true, sid: payload.sid });
    } else {
      return res.status(400).json({ error: "unsupported channel" });
    }
  } catch (e) {
    console.error("notify error", e);
    return res.status(500).json({ error: String(e) });
  }
}
