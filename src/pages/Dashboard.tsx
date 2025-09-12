// src/pages/Dashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import agentLib, { pickTips } from "@/lib/agent";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Heart,
  Activity,
  Thermometer,
  LogOut,
  TrendingUp,
  Weight,
  Sparkles,
  Notebook
} from "lucide-react";
import HealthChart, { HealthChartDatum } from "@/components/HealthChart";

type HealthRow = {
  id?: string;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  blood_sugar?: number | null;
  weight?: number | null;
  temperature?: number | null;
  sleep_hours?: number | null;
  exercise_minutes?: number | null;
  mood?: string | null;
  symptoms?: string | null;     // plain text
  medications?: string | null;  // plain text
  notes?: string | null;        // plain text
  created_at?: string | null;
  timestamp?: string | null;
  [k: string]: any;
};

const diseaseEmoji: { [k: string]: string } = {
  diabetes: "💉",
  hypertension: "⚡",
  heartDisease: "❤️",
  stroke: "⚠️",
  alzheimer: "🧠",
  copd: "🫁",
  kidneyDisease: "💧",
  obesity: "⚖️",
};

const ALL_TIPS = [
  "Stay hydrated — aim for a glass of water every hour while awake.",
  "Keep a short daily walk (15–30 minutes) to support circulation.",
  "Choose whole grains and vegetables to help stabilise blood sugar.",
  "Limit high-sodium processed foods to help manage blood pressure.",
  "Practice deep breathing for 3–5 minutes to reduce stress and heart rate.",
  "If you feel lightheaded, sit down and rest for several minutes.",
  "Check medications list and timings — take medicines as prescribed.",
  "Try a short stretching routine in the morning to ease stiffness.",
  "Avoid heavy meals right before bedtime to improve sleep quality.",
  "Record any dizziness or fainting episodes and share with your doctor."
];

const Dashboard = () => {
  const [user, setUser] = useState<any | null>(null);
  const [latestVitals, setLatestVitals] = useState<HealthRow | null>(null);
  const [recentReadings, setRecentReadings] = useState<HealthRow[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [risks, setRisks] = useState<{ [k: string]: number }>({});
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : "-");

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        setUser({ email: raw });
      }
    }
  }, []);

  async function getCurrentUserId(): Promise<string | null> {
    try {
      const { data: userResp, error } = await supabase.auth.getUser();
      if (error) {
        console.warn("supabase.auth.getUser error:", error);
        return null;
      }
      return userResp?.user?.id ?? null;
    } catch (e) {
      console.error("getCurrentUserId exception:", e);
      return null;
    }
  }

  useEffect(() => {
    let mounted = true;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const uid = await getCurrentUserId();
        if (!uid) {
          navigate("/");
          return;
        }

        const recentResp = await supabase
          .from("health_data")
          .select(
            "id, heart_rate, systolic_bp, diastolic_bp, blood_sugar, weight, temperature, sleep_hours, exercise_minutes, mood, symptoms, medications, notes, created_at, timestamp"
          )
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(14);

        const recentData: HealthRow[] = recentResp.error ? [] : (Array.isArray(recentResp.data) ? (recentResp.data as HealthRow[]) : []);

        if (mounted) {
          setRecentReadings(recentData);
          setLatestVitals(recentData.length ? recentData[0] : null);
        }

        const insightsResp = await supabase
          .from("health_insights")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(10);

        if (mounted) {
          setInsights(insightsResp.error ? [] : (Array.isArray(insightsResp.data) ? insightsResp.data : []));
        }

        if (recentData.length) {
          const latest = recentData[0];
          const computed = agentLib.computeRisks(latest as any);
          if (mounted) setRisks(computed);

          // pick varied tips (unique)
          const picked = pickTips(latest as any, computed);
          const pool = Array.from(new Set([...picked, ...ALL_TIPS])).filter(Boolean);
          // shuffle and slice (simple Fisher-Yates)
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          if (mounted) setTips(pool.slice(0, 4));
        } else {
          if (mounted) {
            setRisks({});
            // pick 4 varied tips from ALL_TIPS
            const pool = [...ALL_TIPS];
            for (let i = pool.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            setTips(pool.slice(0, 4));
          }
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        if (mounted) {
          setRecentReadings([]);
          setLatestVitals(null);
          setInsights([]);
          setTips(["Error loading dashboard."]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("signOut error", e);
    }
    localStorage.removeItem("user");
    navigate("/");
  };

  // Build chart points (include per-point risks)
  const chartPoints: HealthChartDatum[] = (recentReadings || [])
    .filter((r) => r && (r.created_at || r.timestamp))
    .map((r) => {
      const snapshotRisks = agentLib.computeRisks(r as any);
      return {
        date: r.created_at ?? r.timestamp ?? "",
        heartRate: r.heart_rate ?? null,
        sugar: r.blood_sugar ?? null,
        bp: (r.systolic_bp != null && r.diastolic_bp != null) ? `${r.systolic_bp}/${r.diastolic_bp}` : null,
        risks: snapshotRisks
      };
    })
    .reverse();

  const sortedRiskEntries = Object.entries(risks || {})
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => b.value - a.value);

  function formatDiseaseName(key: string) {
    const map: { [k: string]: string } = {
      diabetes: "Diabetes",
      hypertension: "Hypertension",
      heartDisease: "Heart Disease",
      stroke: "Stroke",
      alzheimer: "Alzheimer's",
      copd: "COPD",
      kidneyDisease: "Kidney Disease",
      obesity: "Obesity"
    };
    return map[key] ?? key;
  }

  // Helper: format an insight object to a readable array of bullet lines
  function insightToBullets(ins: any): string[] {
    // prefer metadata.highlights if present (array or string)
    const meta = ins?.metadata;
    if (meta && meta.highlights) {
      if (Array.isArray(meta.highlights)) return meta.highlights.map(String);
      if (typeof meta.highlights === "string") return meta.highlights.split(/[.\n]\s*/).map(s => s.trim()).filter(Boolean);
    }
    // else try to split body into short sentences
    const body = ins?.body ?? "";
    if (!body) return [];
    // split into sentences but keep short fragments
    const parts = body.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);
    // further shorten very long sentences into chunks (if needed)
    const bullets = parts.flatMap(p => {
      if (p.length > 160) {
        // break long parts at commas for readability
        return p.split(/,\s+/).map(s => s.trim()).filter(Boolean);
      }
      return p;
    });
    return bullets.slice(0, 6); // cap bullets per insight
  }

  // Symptoms list: build nicely (one list item per reading's symptoms)
  const symptomsList = recentReadings
    .filter(r => r.symptoms && r.symptoms.trim())
    .slice(0, 6)
    .map(r => ({
      text: r.symptoms as string,
      created_at: r.created_at ?? r.timestamp ?? null,
      id: r.id ?? Math.random().toString(36).slice(2, 9)
    }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Early Health Guardian</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Welcome, {user?.name || user?.email || "User"}</span>
            <Badge variant="default">patient</Badge>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* MAIN COLUMN */}
            <div className="lg:col-span-2 space-y-6">
              {/* Vitals row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex items-center gap-2 pb-2">
                    <Heart className="h-5 w-5 text-destructive" />
                    <CardTitle className="text-sm">Heart Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{latestVitals?.heart_rate ?? "-"}</div>
                    <div className="text-xs text-muted-foreground">bpm</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex items-center gap-2 pb-2">
                    <Activity className="h-5 w-5 text-info" />
                    <CardTitle className="text-sm">Blood Pressure</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {latestVitals?.systolic_bp != null && latestVitals?.diastolic_bp != null
                        ? `${latestVitals.systolic_bp}/${latestVitals.diastolic_bp}`
                        : "-"}
                    </div>
                    <div className="text-xs text-muted-foreground">mmHg</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex items-center gap-2 pb-2">
                    <Thermometer className="h-5 w-5 text-warning" />
                    <CardTitle className="text-sm">Blood Sugar</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{latestVitals?.blood_sugar ?? "-"}</div>
                    <div className="text-xs text-muted-foreground">mg/dL</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex items-center gap-2 pb-2">
                    <Weight className="h-5 w-5 text-primary" />
                    <CardTitle className="text-sm">Weight</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{latestVitals?.weight ?? "-"}</div>
                    <div className="text-xs text-muted-foreground">kg</div>
                  </CardContent>
                </Card>
              </div>

              {/* Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Health Trends & Risks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {chartPoints.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No trend data yet — add readings to see graphs.</div>
                  ) : (
                    <HealthChart data={chartPoints} height={360} />
                  )}
                </CardContent>
              </Card>

              {/* AI Insights (clean format) */}
              {latestVitals && insights.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                      AI Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {insights.map((ins) => {
                        const bullets = insightToBullets(ins);
                        return (
                          <div key={ins.id} className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-semibold text-foreground">{ins.title ?? "Insight"}</div>
                                <div className="text-xs text-muted-foreground mt-1">{fmtDate(ins.created_at)}</div>
                              </div>
                            </div>

                            {bullets.length > 0 ? (
                              <ul className="list-disc list-inside mt-3 text-sm space-y-1">
                                {bullets.map((b, i) => <li key={i}>{b}</li>)}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{ins.body}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Symptoms (below insights in main column) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Notebook className="h-5 w-5 text-blue-500" />
                    Recent Symptoms
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {symptomsList.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No symptoms recorded recently.</div>
                  ) : (
                    <ol className="list-decimal list-inside space-y-3 text-sm">
                      {symptomsList.map((s, idx) => (
                        <li key={s.id}>
                          <div>{s.text}</div>
                          <div className="text-xs text-muted-foreground mt-1">{s.created_at ? new Date(s.created_at).toLocaleString() : ""}</div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* SIDEBAR */}
            <div className="space-y-6">
              {/* Risk Summary */}
              <Card>
                <CardHeader><CardTitle>Risk Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {sortedRiskEntries.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No risk data available yet.</div>
                    ) : (
                      sortedRiskEntries.map((r) => (
                        <div key={r.key}>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{diseaseEmoji[r.key] ?? "•"}</span>
                              <div className="font-medium">{formatDiseaseName(r.key)}</div>
                            </div>
                            <div className="text-muted-foreground">{r.value}%</div>
                          </div>
                          <div className="mt-2">
                            <Progress value={r.value} className="h-2 rounded-full" />
                          </div>
                        </div>
                      ))
                    )}
                    <div className="text-xs text-muted-foreground mt-3">
                      These are heuristics for awareness, not a medical diagnosis.
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Today's Tips */}
              <Card>
                <CardHeader><CardTitle>Today's Health Tips</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {tips.map((t, i) => <li key={i} className="text-sm">• {t}</li>)}
                  </ul>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => navigate("/add-data")}>Add Health Data</Button>
                    <Button variant="outline" onClick={() => navigate("/symptoms")}>Log Symptoms</Button>
                    <Button variant="ghost" onClick={() => navigate("/reports")}>View Reports</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Notes - moved to the sidebar below Quick Actions */}
              <Card>
                <CardHeader><CardTitle>Recent Notes</CardTitle></CardHeader>
                <CardContent>
                  {recentReadings.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No notes recorded.</div>
                  ) : (
                    <ol className="list-decimal list-inside space-y-3 text-sm">
                      {recentReadings.slice(0, 5).map((r, idx) => (
                        <li key={r.id ?? idx}>
                          {r.notes ? <p>{r.notes}</p> : <p className="text-muted-foreground">—</p>}
                          <div className="text-xs text-muted-foreground mt-1">{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
