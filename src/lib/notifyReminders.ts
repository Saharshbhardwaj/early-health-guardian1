// lib/notifyReminder.ts
import { supabase } from "@/lib/supabaseClient"; // adjust path
import fetch from "cross-fetch"; // browser fetch is fine; this is for Node env if needed

const WEBHOOK_URL = process.env.REACT_APP_REMINDER_WEBHOOK || process.env.VITE_REMINDER_WEBHOOK || process.env.REMINDER_WEBHOOK;
// the shared secret must match SHARED_SECRET in Apps Script
const WEBHOOK_SECRET = process.env.REACT_APP_REMINDER_WEBHOOK_SECRET || process.env.VITE_REMINDER_WEBHOOK_SECRET || process.env.REMINDER_WEBHOOK_SECRET;

type ReminderRow = {
  id: string;
  title?: string;
  description?: string;
  notify_at?: string; // ISO or whatever you store
  repeat?: boolean;
  repeat_interval?: number | null;
  sent?: boolean | null;
  user_id?: string | null;
};

export async function sendReminderEmailAndMaybeDelete(reminder: ReminderRow) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    console.error("Reminder webhook URL or secret not configured.");
    throw new Error("Missing webhook configuration");
  }

  // build email recipient(s) - typically caregiver(s) and patient
  // for demo, assume `reminder` contains `user_email` and `caregiver_email` if needed.
  // Adjust per your schema: fetch caregiver emails separately if necessary.
  const recipients: string[] = [];

  // Example: if reminder.user_id is patient and you store patient email in profiles,
  // you might need to fetch emails. For now assume we have a caretakers list or pass in email.
  // We'll send to a single email passed as reminder['email'] if present:
  if ((reminder as any).email) recipients.push((reminder as any).email);
  // Optionally add caregiver emails:
  if ((reminder as any).caregiver_email) recipients.push((reminder as any).caregiver_email);

  // fallback - you MUST adapt to your schema
  if (recipients.length === 0) {
    console.warn("No recipient found for reminder", reminder);
    // return or throw depending on how you want to handle this
    throw new Error("No recipient for reminder");
  }

  const to = recipients.join(","); // simple comma list

  const subject = `Reminder: ${reminder.title || "Health Reminder"}`;
  const body = (reminder.description || "") +
    `\n\nScheduled for: ${reminder.notify_at || "soon"}` +
    `\n\nIf this is an automatic reminder from Early Health Guardian.`;

  // Call Apps Script webhook
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
      // we pass secret inside body; could also pass in header if webapp supports it
    },
    body: JSON.stringify({
      secret: WEBHOOK_SECRET,
      to,
      subject,
      body,
      fromName: "Early Health Guardian"
    })
  });

  const json = await res.json().catch(() => ({ ok: false, status: res.status }));

  if (!res.ok) {
    console.error("Webhook send failed", res.status, json);
    throw new Error(json?.error || `Webhook error ${res.status}`);
  }

  // If email sent successfully — delete reminder if not repeating
  if (!reminder.repeat) {
    // delete from Supabase reminders table
    const { error: deleteErr } = await supabase
      .from("reminders")
      .delete()
      .eq("id", reminder.id);

    if (deleteErr) {
      console.error("Failed to delete non-repeating reminder:", deleteErr);
      // optionally throw or swallow; we'll log and continue
      throw deleteErr;
    }
  } else {
    // Optionally mark as sent or update next notify_at
    // e.g. supabase.from('reminders').update({ sent: true }).eq('id', reminder.id);
  }

  return json;
}
