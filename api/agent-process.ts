// api/agent-process.js  (for Vercel Serverless / Node 18+)
// Paste this into api/agent-process.js

function num(v) { return v === null || v === undefined ? null : Number(v); }

function computeDiabetesRisk(entry) {
  if (!entry) return 10;
  const sugar = num(entry.blood_sugar);
  const type = entry.blood_sugar_type ?? null;
  if (sugar == null) return 10;
  if (type === "fasting") {
    if (sugar >= 126) return 95;
    if (sugar >= 100) return 70;
    if (sugar >= 90) return 30;
    return 10;
  } else {
    if (sugar >= 200) return 95;
    if (sugar >= 140) return 70;
    if (sugar >= 120) return 40;
    return 10;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST supported" });

  try {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE" });
    }

    const headers = {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json"
    };

    // Fetch latest health_data
    const hdUrl = `${SUPABASE_URL}/rest/v1/health_data?user_id=eq.${encodeURIComponent(user_id)}&select=*&order=timestamp.desc&limit=1`;
    const hdResp = await fetch(hdUrl, { headers });
    const hdArr = await hdResp.json().catch(() => []);
    const latest = Array.isArray(hdArr) && hdArr.length ? hdArr[0] : null;

    // Compute risks (example)
    const risks = { diabetes: computeDiabetesRisk(latest) };

    // Insert a simple insight (no OpenAI) — optional
    const insightPayload = {
      user_id,
      title: `Auto summary`,
      body: `Computed risks: ${JSON.stringify(risks)}`,
      risk_summary: risks,
      source: "vercel-agent",
      created_at: new Date().toISOString()
    };
    await fetch(`${SUPABASE_URL}/rest/v1/health_insights`, {
      method: "POST",
      headers,
      body: JSON.stringify(insightPayload)
    });

    return res.status(200).json({ ok: true, risks });
  } catch (err) {
    console.error("Agent error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
