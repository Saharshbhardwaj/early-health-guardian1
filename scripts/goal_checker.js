// scripts/goal-checker.js
// Node 18+ recommended
const fetch = global.fetch || require("node-fetch");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json"
};

async function fetchActiveGoals() {
  const url = `${SUPABASE_URL}/rest/v1/health_goals?active=eq.true&select=*`;
  const res = await fetch(url, { headers });
  return res.ok ? res.json() : [];
}

function startOfPeriod(period, now = new Date()) {
  const d = new Date(now);
  if (period === "daily") {
    d.setHours(0,0,0,0);
    return d.toISOString();
  } else if (period === "weekly") {
    // start of week (Mon)
    const day = d.getDay(); // 0 Sun .. 1 Mon
    const diff = (day + 6) % 7; // days since Monday
    d.setDate(d.getDate() - diff);
    d.setHours(0,0,0,0);
    return d.toISOString();
  } else if (period === "monthly") {
    d.setDate(1);
    d.setHours(0,0,0,0);
    return d.toISOString();
  }
  // default daily
  d.setHours(0,0,0,0);
  return d.toISOString();
}

async function fetchMetricSum(userId, metric, periodStartIso) {
  // This expects your health_data stores snake_case columns e.g. exercise_minutes, sleep_hours, steps, weight
  // For "weight" we return the latest value (not sum)
  if (metric === "weight") {
    const url = `${SUPABASE_URL}/rest/v1/health_data?user_id=eq.${encodeURIComponent(userId)}&select=weight,timestamp&order=timestamp.desc&limit=1`;
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const arr = await r.json();
    return (arr && arr.length) ? Number(arr[0].weight) : null;
  } else {
    // sum metric values since period start
    const url = `${SUPABASE_URL}/rest/v1/health_data?user_id=eq.${encodeURIComponent(userId)}&select=${metric}&timestamp=gte.${encodeURIComponent(periodStartIso)}`;
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const arr = await r.json();
    let sum = 0;
    for (const row of arr) {
      const v = row[metric];
      if (v !== null && v !== undefined) sum += Number(v);
    }
    return sum;
  }
}

async function insertReminder(user_id, title, body, notify_at_iso) {
  const payload = {
    user_id,
    title,
    body,
    notify_at: notify_at_iso,
    channel: "in_app",
    delivered: false,
    created_at: new Date().toISOString()
  };
  const url = `${SUPABASE_URL}/rest/v1/reminders`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!r.ok) {
    console.error("Failed to insert reminder:", await r.text());
  } else {
    console.log("Inserted reminder for", user_id, title);
  }
}

(async () => {
  try {
    console.log("Fetching active goals...");
    const goals = await fetchActiveGoals();
    console.log("Active goals count:", goals.length);

    for (const g of goals) {
      const userId = g.user_id || g.user_id; // whichever field stores id
      if (!userId) continue;
      const metric = g.metric;
      const goalVal = Number(g.goal_value);
      const period = g.period || "daily";

      const periodStart = startOfPeriod(period);
      const metricValue = await fetchMetricSum(userId, metric, periodStart);

      // If metric is null or below goal (for weight we treat differently)
      let missed = false;
      if (metric === "weight") {
        // If weight goal means target weight (e.g., reduce to X), we keep simple: if latest > goalVal then consider missed
        if (metricValue === null) missed = true;
        else missed = metricValue > goalVal;
      } else {
        if (metricValue === null) missed = true;
        else missed = metricValue < goalVal;
      }

      if (missed) {
        const title = `Goal missed: ${g.name}`;
        const body = `You set a ${period} goal of ${g.goal_value} ${metric}. You logged ${metricValue ?? 0} so far since ${periodStart}. Keep going!`;
        // schedule reminder immediately (notify_at now)
        await insertReminder(userId, title, body, new Date().toISOString());
      } else {
        console.log(`Goal met for user ${userId} (${g.name})`);
      }
    }

    console.log("Goal check run complete.");
  } catch (err) {
    console.error("Goal check error:", err);
    process.exit(1);
  }
})();
