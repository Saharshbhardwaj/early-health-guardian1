// api/notify.js
// Top-level Vercel serverless function (plain Node). Use with Vercel (no Next.js).
// Uses Resend: https://resend.com

const { Resend } = require("resend");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.NOTIFY_FROM_EMAIL || "no-reply@earlyhealthguardian.app";

let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
} else {
  console.warn("RESEND_API_KEY not set — /api/notify will fail until configured.");
}

function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json").end(JSON.stringify(payload));
}

// Basic sanitiser for HTML display
function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  let body = req.body;
  // if Vercel gives raw body as string, try parse
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { /* ignore */ }
  }

  const to = body?.to;
  const title = body?.title || "Notification from Early Health Guardian";
  const text = body?.body || "";

  if (!to) return sendJson(res, 400, { error: 'Missing required field "to" (recipient email)' });
  if (!resend) return sendJson(res, 500, { error: "Email provider not configured (RESEND_API_KEY missing)" });

  try {
    const resp = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: title,
      text,
      html: `<div style="font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; line-height:1.4">${escapeHtml(text).replace(/\n/g, "<br/>")}</div>`,
    });

    return sendJson(res, 200, { ok: true, resp });
  } catch (err) {
    console.error("resend send error:", err);
    return sendJson(res, 500, { error: err?.message || "Failed to send email", details: err });
  }
};
