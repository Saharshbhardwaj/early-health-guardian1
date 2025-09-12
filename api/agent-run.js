// api/agent-run.js
import fetch from "node-fetch";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "missing userId" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return res.status(500).json({ error: "Missing supabase envs" });

  try {
    // fetch user's health_data history
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/health_data?user_id=eq.${userId}&select=*`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` }
    });
    const rows = await resp.json();

    // lightweight server-side aggregation: compute risk for each row using same heuristics (could be replaced with model)
    // For now we simply compute reusing computeRisks logic in the client — but to avoid duplicating code in Node you can port computeRisks here or call your ML model.
    // Example: return basic stats
    const latest = rows.length ? rows[rows.length - 1] : null;
    return res.status(200).json({ rowsCount: rows.length, latest });
  } catch (e) {
    console.error("agent-run error", e);
    return res.status(500).json({ error: String(e) });
  }
}
