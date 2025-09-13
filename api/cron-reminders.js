// api/cron-reminders.js
// Run this via a scheduler (Vercel cron, GitHub Actions, or a daily server cron).
// It uses Supabase service role key to read/write reminders & notifications, and forwards to MAILER_URL to send emails.
//
// Required ENV:
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
// MAILER_URL (your mailer proxy endpoint, optional - if absent it will still mark reminders as sent)
// MAILER_API_KEY (optional - forwarded to mailer)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILER_URL = process.env.MAILER_URL || null;
const MAILER_API_KEY = process.env.MAILER_API_KEY || null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

function nowISO() { return new Date().toISOString(); }

async function supabaseRest(path, opts = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${path}${opts.query || ''}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation'
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch(e) { json = text; }
  return { ok: res.ok, status: res.status, body: json };
}

async function sendMail(recipients, subject, text, html) {
  if (!MAILER_URL) {
    console.log("MAILER_URL not configured; skipping actual email send.", recipients, subject);
    return { ok: false, message: "mailer not configured" };
  }
  const res = await fetch(MAILER_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", ...(MAILER_API_KEY ? { Authorization: `Bearer ${MAILER_API_KEY}` } : {}) },
    body: JSON.stringify({ to: recipients, subject, text, html })
  });
  const txt = await res.text();
  try { return { ok: res.ok, status: res.status, body: JSON.parse(txt) }; } catch(e) { return { ok: res.ok, status: res.status, body: txt }; }
}

function addRepeat(remindAtISO, repeat) {
  if (!repeat || repeat === "none") return null;
  const dt = new Date(remindAtISO);
  if (repeat === "daily") dt.setDate(dt.getDate() + 1);
  if (repeat === "weekly") dt.setDate(dt.getDate() + 7);
  if (repeat === "monthly") dt.setMonth(dt.getMonth() + 1);
  return dt.toISOString();
}

module.exports = async function handler(req, res) {
  try {
    // allow manual trigger (GET or POST)
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) fetch due reminders (sent = false and remind_at <= now)
    const q = `?select=*,profiles(full_name),caregivers(name,email,caregiver_user_id)&remind_at=lte.${encodeURIComponent(new Date().toISOString())}&sent=eq.false`;
    const remindersResp = await supabaseRest('reminders', { query: q });

    if (!remindersResp.ok) {
      console.error("Failed to fetch reminders", remindersResp);
      return res.status(500).json({ ok: false, error: 'Failed to fetch reminders', details: remindersResp.body });
    }

    const due = Array.isArray(remindersResp.body) ? remindersResp.body : [];
    console.log(`[cron-reminders] found ${due.length} due reminders`);

    const results = [];

    for (const r of due) {
      // r contains reminder row; try to find caregiver emails via caregivers table if not embedded
      let caregiverEmails = [];
      try {
        const cgResp = await supabaseRest(`caregivers?patient_id=eq.${r.user_id}`, {});
        if (cgResp.ok && Array.isArray(cgResp.body)) {
          caregiverEmails = cgResp.body.map(c => c.email).filter(Boolean);
        }
      } catch (e) {
        console.warn("Failed to fetch caregivers for reminder", r.id, e);
      }

      // try fetch user email from auth.users? service role can't fetch auth.users via rest (it's in a different schema). Simpler: send to caregivers primarily.
      const recipients = caregiverEmails; // you can add patient email if available

      const subject = `Reminder: ${r.title}`;
      const text = `Reminder: ${r.title}\n\n${r.description || ""}\n\nScheduled: ${new Date(r.remind_at).toLocaleString()}`;
      const html = `<p><strong>Reminder:</strong> ${r.title}</p><p>${r.description || ""}</p><p><em>Scheduled:</em> ${new Date(r.remind_at).toLocaleString()}</p>`;

      // Insert a notification entry
      const notif = {
        user_id: r.user_id,
        caregiver_user_id: null,
        channel: "email",
        title: `Reminder: ${r.title}`,
        body: text,
        meta: JSON.stringify({ reminder_id: r.id }),
        status: "pending",
        created_at: nowISO()
      };

      const notifResp = await supabaseRest('notifications', { method: 'POST', body: [notif] });

      // try send email
      let mailRes = null;
      if (recipients.length > 0) {
        mailRes = await sendMail(recipients, subject, text, html);
      } else {
        // fallback: if no caregiver, skip sending but still mark as processed or consider alternate behavior
        console.log(`[cron-reminders] no caregiver recipients for reminder ${r.id}`);
      }

      // update notification status if mail sent
      if (notifResp.ok && mailRes && mailRes.ok) {
        // set notification status to sent
        try {
          const notifId = Array.isArray(notifResp.body) ? notifResp.body[0]?.id : null;
          if (notifId) {
            await supabaseRest(`notifications?id=eq.${notifId}`, { method: 'PATCH', body: { status: 'sent' } });
          }
        } catch (e) {
          console.warn("Failed to update notification status", e);
        }
      }

      // mark reminder as sent or reschedule if repeating
      if (r.repeat && r.repeat !== "none") {
        const next = addRepeat(r.remind_at, r.repeat);
        if (next) {
          await supabaseRest(`reminders?id=eq.${r.id}`, { method: 'PATCH', body: { remind_at: next } });
          results.push({ id: r.id, action: "rescheduled", next });
        } else {
          await supabaseRest(`reminders?id=eq.${r.id}`, { method: 'PATCH', body: { sent: true, sent_at: nowISO() } });
          results.push({ id: r.id, action: "marked_sent" });
        }
      } else {
        await supabaseRest(`reminders?id=eq.${r.id}`, { method: 'PATCH', body: { sent: true, sent_at: nowISO() } });
        results.push({ id: r.id, action: "marked_sent" });
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error("cron-reminders error", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
