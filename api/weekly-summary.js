// api/weekly-summary.js
import fetch from "node-fetch";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return res.status(500).json({ error: "missing supabase env" });

  try {
    // Example: fetch all users (be careful with scale). For demo, pick users with recent activity:
    const usersResp = await fetch(`${SUPABASE_URL}/rest/v1/health_data?select=user_id&created_at=gt.${encodeURIComponent(new Date(Date.now() - 7*24*3600*1000).toISOString())}&distinct=user_id`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` }
    });
    const users = await usersResp.json();
    for (const u of users) {
      const userId = u.user_id;
      // fetch last 7 days of readings
      const r = await fetch(`${SUPABASE_URL}/rest/v1/health_data?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(new Date(Date.now()-7*24*3600*1000).toISOString())}&select=*`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` }
      });
      const rows = await r.json();
      // compute basic highlights
      const latest = rows.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const body = `Weekly summary: ${rows.length} readings. Latest vitals: HR:${latest?.heart_rate ?? '-'}; BP:${latest?.systolic_bp ?? '-'} / ${latest?.diastolic_bp ?? '-'}; Sugar:${latest?.blood_sugar ?? '-'}.`;
      // insert into health_insights table
      await fetch(`${SUPABASE_URL}/rest/v1/health_insights`, {
        method: "POST",
        headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: JSON.stringify([{ user_id: userId, title: "Weekly Health Summary", body, metadata: { count: rows.length }, source: "weekly-summary" }])
      });
    }
    return res.status(200).json({ ok: true, usersProcessed: users.length });
  } catch (e) {
    console.error("weekly-summary error", e);
    return res.status(500).json({ error: String(e) });
  }
}
