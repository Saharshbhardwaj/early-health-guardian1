// src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Activity, Thermometer, Plus, Calendar, LogOut, TrendingUp } from "lucide-react";
import { HealthChart } from "@/components/HealthChart";
import RiskIndicator from "@/components/RiskIndicator";
import { useToast } from "@/hooks/use-toast";

/**
 * Dashboard layout adjustments:
 * - Recent Activity card moved from right sidebar into left column (below AI Insights)
 * - AI Insights & Risk Summary card made taller (min-h increased) so it visually matches sidebar height
 * - Two-column disease grid retained
 * - All data fetching/parsing logic unchanged
 */

const HEALTH_TIPS = [
  "Stay hydrated — aim for 8 cups of water throughout the day.",
  "Try a short 20-minute walk to improve circulation.",
  "Reduce processed sugar; choose whole fruits.",
  "Practice 3 minutes of deep breathing to lower stress.",
  "Keep consistent sleep times to support memory and recovery.",
  "Stand and stretch every hour if you sit a lot.",
  "Light resistance training twice weekly supports heart health.",
  "Include vegetables and lean protein in your meals."
];

const DISEASES = [
  { key: "diabetes", label: "Diabetes", color: "#f59e0b" },
  { key: "heartDisease", label: "Heart Disease", color: "#ef4444" },
  { key: "hypertension", label: "Hypertension", color: "#3b82f6" },
  { key: "stroke", label: "Stroke", color: "#a78bfa" },
  { key: "alzheimer", label: "Alzheimer's", color: "#06b6d4" },
  { key: "respiratory", label: "Respiratory (COPD)", color: "#0ea5a4" },
  { key: "kidney", label: "Kidney Disease", color: "#7c3aed" },
  { key: "obesity", label: "Obesity", color: "#f97316" },
  { key: "anemia", label: "Anemia", color: "#ef9a9a" },
  { key: "osteoporosis", label: "Osteoporosis", color: "#60a5fa" }
];

const prettyLabel = (slug?: string) => {
  if (!slug) return "Unknown";
  return slug
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [readings, setReadings] = useState<any[]>([]);
  const [latest, setLatest] = useState<any | null>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [symptoms, setSymptoms] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [tips, setTips] = useState<string[]>(HEALTH_TIPS);
  const [notesList, setNotesList] = useState<{ source: string; text: string; created_at?: string }[]>([]);

  useEffect(() => {
    setTips((t) => {
      const arr = [...t];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const authUser = data?.user ?? null;
        if (!authUser) {
          try {
            const local = JSON.parse(localStorage.getItem("user") || "null");
            if (!local) { navigate("/"); return; }
            setUser({ id: local.id || local.userId || local.uid, email: local.email, name: local.name || local.email });
          } catch {
            navigate("/");
            return;
          }
        } else {
          setUser({ id: authUser.id, email: authUser.email, name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email });
          try {
            const { data: p, error: pErr } = await supabase.from("profiles").select("*").eq("id", authUser.id).single();
            if (!pErr && p) setProfile(p);
            if (p?.full_name) setUser((u: any) => ({ ...u, name: p.full_name }));
          } catch (e) {
            console.warn("profile fetch error:", e);
          }
        }
      } catch (e) {
        console.error("loadUser error", e);
        navigate("/");
      }
    };
    loadUser();
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) return;

    const fetchAll = async () => {
      try {
        const { data: hd, error: hdErr } = await supabase
          .from("health_data")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (hdErr) {
          console.warn("health_data fetch err", hdErr);
          toast({ title: "Failed to load health data", description: hdErr.message, variant: "destructive" });
        } else {
          setReadings(hd || []);
          setLatest((hd && hd[0]) || null);
        }

        const { data: ins, error: insErr } = await supabase
          .from("health_insights")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!insErr && ins) setInsights(ins);

        const { data: s, error: sErr } = await supabase
          .from("symptoms")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (!sErr && Array.isArray(s)) {
          const flat: any[] = [];
          s.forEach((entry: any) => {
            if (Array.isArray(entry.symptoms)) {
              entry.symptoms.forEach((ss: any) =>
                flat.push({
                  label: ss.label ?? ss.id ?? "Unknown symptom",
                  severity: ss.severity ?? "mild",
                  recorded_at: entry.created_at
                })
              );
            } else if (entry.symptoms) {
              flat.push({
                label: String(entry.symptoms),
                severity: "n/a",
                recorded_at: entry.created_at
              });
            }
          });
          setSymptoms(flat);
        }

        const { data: remData, error: remErr } = await supabase
          .from("reminders")
          .select("*")
          .eq("user_id", user.id)
          .order("scheduled_at", { ascending: true })
          .limit(10);
        if (!remErr && Array.isArray(remData)) setReminders(remData);

        // Build notesList
        const notesArr: { source: string; text: string; created_at?: string }[] = [];
        if (Array.isArray(hd)) {
          for (const r of hd.slice(0, 6)) {
            if (r.notes && String(r.notes).trim() !== "") notesArr.push({ source: "Vitals note", text: String(r.notes), created_at: r.created_at });
          }
        }
        if (Array.isArray(ins)) {
          for (const it of ins.slice(0, 6)) {
            if (!it.body) continue;
            let bodyText = "";
            try {
              if (typeof it.body === "string") {
                const parsed = JSON.parse(it.body);
                if (parsed && (parsed.notes || parsed.summary || parsed.text)) {
                  if (parsed.notes && String(parsed.notes).trim() !== "") bodyText = String(parsed.notes);
                  else if (parsed.summary && String(parsed.summary).trim() !== "") bodyText = String(parsed.summary);
                  else if (parsed.text && String(parsed.text).trim() !== "") bodyText = String(parsed.text);
                } else {
                  const nonEmpty = Object.keys(parsed).filter((k) => parsed[k] !== null && parsed[k] !== "" && !(Array.isArray(parsed[k]) && parsed[k].length === 0));
                  if (nonEmpty.length > 0) bodyText = nonEmpty.map((k) => `${k}: ${JSON.stringify(parsed[k])}`).join("\n");
                }
              } else if (typeof it.body === "object") {
                const parsed = it.body;
                if (parsed.notes && String(parsed.notes).trim() !== "") bodyText = String(parsed.notes);
                else if (parsed.summary && String(parsed.summary).trim() !== "") bodyText = String(parsed.summary);
                else {
                  const nonEmpty = Object.keys(parsed).filter((k) => parsed[k] !== null && parsed[k] !== "" && !(Array.isArray(parsed[k]) && parsed[k].length === 0));
                  if (nonEmpty.length > 0) bodyText = nonEmpty.map((k) => `${k}: ${JSON.stringify(parsed[k])}`).join("\n");
                }
              } else {
                bodyText = String(it.body);
              }
            } catch {
              bodyText = String(it.body);
            }
            if (bodyText && bodyText.trim() !== "") notesArr.push({ source: "AI insight", text: bodyText, created_at: it.created_at });
          }
        }
        setNotesList(notesArr);
      } catch (e) {
        console.error("fetchAll error", e);
      }
    };

    fetchAll();
  }, [user, toast]);

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch (e) { console.warn(e); }
    localStorage.removeItem("user");
    navigate("/");
  };

  const computeBMI = (r: any) => {
    const weight = Number(r?.weight ?? 0);
    const heightCm = Number(r?.height ?? r?.height_cm ?? 0);
    if (!weight || !heightCm) return null;
    const m = heightCm / 100;
    if (!m) return null;
    return Math.round((weight / (m * m)) * 10) / 10;
  };

  const riskSummary = React.useMemo(() => {
    const base: Record<string, number> = {
      diabetes: 0, heartDisease: 0, hypertension: 0, stroke: 0, alzheimer: 0,
      respiratory: 0, kidney: 0, obesity: 0, anemia: 0, osteoporosis: 0
    };

    const aiSrc = insights[0]?.insights ?? {};
    Object.keys(base).forEach((k) => { if (typeof aiSrc[k] === "number") base[k] = Math.round(aiSrc[k]); });

    if (!Object.values(base).some((v) => v > 0) && latest) {
      const sugar = Number(latest.blood_sugar ?? 0);
      const hr = Number(latest.heart_rate ?? 0);
      const sys = Number(latest.systolic_bp ?? 0);
      const dia = Number(latest.diastolic_bp ?? 0);
      const bmi = computeBMI(latest);

      if (sugar >= 200) base.diabetes = 95;
      else if (sugar >= 140) base.diabetes = 70;
      else if (sugar >= 110) base.diabetes = 40;

      if (hr >= 110) base.heartDisease = 80;
      else if (hr >= 95) base.heartDisease = 55;

      if (sys >= 160 || dia >= 100) base.hypertension = 95;
      else if (sys >= 140 || dia >= 90) base.hypertension = 75;

      if (bmi && bmi >= 35) base.obesity = 90;
      else if (bmi && bmi >= 30) base.obesity = 70;
      else if (bmi && bmi >= 25) base.obesity = 35;
    }

    Object.keys(base).forEach((k) => {
      const v = Number(base[k] || 0);
      base[k] = Math.max(0, Math.min(100, Math.round(v)));
    });

    return base;
  }, [insights, latest, profile, symptoms]);

  const renderInsightBody = (body: any) => {
    if (!body) return <div className="text-sm text-muted-foreground">No extra details.</div>;

    let parsed: any = body;
    if (typeof body === "string") {
      try { parsed = JSON.parse(body); } catch { parsed = body; }
    }

    if (typeof parsed === "object" && parsed !== null) {
      const parts: JSX.Element[] = [];
      const symptomsArr = parsed.symptoms && Array.isArray(parsed.symptoms) ? parsed.symptoms : null;
      if (symptomsArr && symptomsArr.length > 0) {
        parts.push(
          <div key="symptoms">
            <div className="font-medium text-sm">Symptoms recorded</div>
            <ol className="list-decimal ml-5 mt-1 text-sm">
              {symptomsArr.map((s: any, idx: number) => {
                const label = s.label ?? s.id ?? JSON.stringify(s);
                const sev = s.severity ? ` — ${s.severity}` : "";
                return (<li key={idx} className="mb-1">{label}{sev}</li>);
              })}
            </ol>
          </div>
        );
      }

      const summaryKeys = ["summary", "text", "notes", "body"];
      for (const k of summaryKeys) {
        if (parsed[k] && String(parsed[k]).trim() !== "") {
          parts.push(
            <div key={k} className="mt-2">
              <div className="font-medium text-sm">{k.charAt(0).toUpperCase() + k.slice(1)}</div>
              <div className="whitespace-pre-wrap text-sm mt-1">{String(parsed[k])}</div>
            </div>
          );
        }
      }

      if (parts.length === 0) {
        const nonEmptyKeys = Object.keys(parsed).filter((k) => {
          const v = parsed[k];
          if (v === null || v === undefined) return false;
          if (typeof v === "string") return v.trim() !== "";
          if (Array.isArray(v)) return v.length > 0;
          return true;
        });
        if (nonEmptyKeys.length > 0) {
          parts.push(
            <div key="other">
              {nonEmptyKeys.map((k) => (
                <div key={k} className="text-sm mb-1">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="whitespace-pre-wrap">{typeof parsed[k] === "object" ? JSON.stringify(parsed[k], null, 2) : String(parsed[k])}</div>
                </div>
              ))}
            </div>
          );
        } else {
          return <div className="text-sm text-muted-foreground">No insight details available.</div>;
        }
      }

      return <div className="space-y-2">{parts}</div>;
    }

    return <div className="text-sm">{String(parsed)}</div>;
  };

  const todaysTip = tips[0] ?? HEALTH_TIPS[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Early Health Guardian</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Welcome, {user?.name ?? user?.email ?? "Patient"}</span>
            <Badge variant="default">patient</Badge>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: main content (wider) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Top small cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Heart Rate</CardTitle>
                  <Heart className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{latest?.heart_rate ?? "No data"}</div>
                  <p className="text-xs text-muted-foreground">bpm</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Blood Pressure</CardTitle>
                  <Activity className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{latest?.systolic_bp && latest?.diastolic_bp ? `${latest.systolic_bp}/${latest.diastolic_bp}` : "No data"}</div>
                  <p className="text-xs text-muted-foreground">mmHg</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Blood Sugar</CardTitle>
                  <Thermometer className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{latest?.blood_sugar ?? "No data"}</div>
                  <p className="text-xs text-muted-foreground">mg/dL</p>
                </CardContent>
              </Card>
            </div>

            {/* Health trends chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Health Trends (Last 7)</CardTitle>
              </CardHeader>
              <CardContent>
                {readings.length ? <HealthChart data={readings} /> : <div className="text-muted-foreground">No data recorded yet. Add a reading to see trends.</div>}
              </CardContent>
            </Card>

            {/* AI Insights & Risk Summary - made taller to visually balance with right column */}
            <Card>
              <CardHeader><CardTitle>AI Insights & Risk Summary</CardTitle></CardHeader>
              <CardContent className="min-h-[700px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {DISEASES.map((d) => (
                    <div key={d.key}>
                      <RiskIndicator disease={d.label} risk={(riskSummary as any)[d.key] ?? 0} color={d.color} />
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <h4 className="font-medium">Latest Insight</h4>
                  {insights[0] ? (
                    <div className="mt-2">
                      <div className="text-sm text-muted-foreground">
                        {insights[0].title ? insights[0].title : (insights[0].summary ? insights[0].summary : "Latest observation")}
                        {insights[0].created_at ? ` — ${new Date(insights[0].created_at).toLocaleString()}` : ""}
                      </div>
                      <div className="mt-2">{renderInsightBody(insights[0].body ?? insights[0].insights ?? insights[0])}</div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No AI insights yet. Save a reading to get insights.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* RECENT ACTIVITY moved to the left bottom (under AI Insights) */}
            <Card>
              <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
              <CardContent>
                {latest ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span>Last reading</span><span className="text-muted-foreground">{latest.created_at ? new Date(latest.created_at).toLocaleString() : "—"}</span></div>
                    <div className="flex justify-between"><span>Weight</span><span className="text-muted-foreground">{latest.weight ?? "—"}</span></div>
                    <div className="flex justify-between"><span>Temperature (°F)</span><span className="text-muted-foreground">{latest.temperature ?? "—"}</span></div>
                    <div className="flex justify-between"><span>Blood sugar</span><span className="text-muted-foreground">{latest.blood_sugar ?? "—"}</span></div>
                    <div className="flex justify-between"><span>Heart rate</span><span className="text-muted-foreground">{latest.heart_rate ?? "—"} bpm</span></div>
                    <div className="flex justify-between"><span>Blood pressure</span><span className="text-muted-foreground">{latest.systolic_bp && latest.diastolic_bp ? `${latest.systolic_bp}/${latest.diastolic_bp} mmHg` : "—"}</span></div>
                  </div>
                ) : <div className="text-muted-foreground">No recent activity</div>}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: sidebar */}
          <aside className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Actions & Reports</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <Button variant="outline" className="flex items-center justify-center" onClick={() => navigate("/add-data")}><Plus className="h-4 w-4 mr-2" /> Add Data</Button>
                  <Button variant="outline" className="flex items-center justify-center" onClick={() => navigate("/symptoms")}><Calendar className="h-4 w-4 mr-2" /> Log Symptoms</Button>
                  <Button variant="outline" className="flex items-center justify-center" onClick={() => navigate("/reports")}><Calendar className="h-4 w-4 mr-2" /> Get Reports</Button>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent>
                {notesList.length ? (
                  <div className="space-y-3 text-sm">
                    {notesList.map((n, i) => (
                      <div key={i} className="space-y-1">
                        <div className="text-xs text-muted-foreground">{n.source} • {n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div>
                        <div className="whitespace-pre-wrap">{n.text}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No notes yet. Notes from readings and AI insights will appear here.</div>
                )}
              </CardContent>
            </Card>

            {/* Reminders */}
            <Card>
              <CardHeader><CardTitle>Reminders</CardTitle></CardHeader>
              <CardContent>
                {reminders.length ? (
                  <div className="space-y-3">
                    {reminders.map((r: any, i: number) => (
                      <div key={i} className="text-sm">
                        <div className="flex justify-between">
                          <div className="font-medium">{r.title ?? "Reminder"}</div>
                          <div className="text-xs text-muted-foreground">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}</div>
                        </div>
                        {r.body && <div className="text-xs text-muted-foreground mt-1">{r.body}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No upcoming reminders</div>
                )}
              </CardContent>
            </Card>

            {/* Today's Tip */}
            <Card>
              <CardHeader><CardTitle>Today's Health Tip</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{todaysTip}</p></CardContent>
            </Card>

            {/* Symptoms (recent) */}
            <Card>
              <CardHeader><CardTitle>Symptoms (recent)</CardTitle></CardHeader>
              <CardContent>
                {symptoms.length ? (
                  <div className="space-y-3">
                    {symptoms.map((s, i) => (
                      <div key={`${s.label}-${s.recorded_at}-${i}`} className="p-3 rounded-md bg-white shadow-sm border">
                        <div className="flex items-baseline justify-between">
                          <div className="text-base font-semibold text-foreground">{prettyLabel(s.label)}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(s.recorded_at)}</div>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">Severity: <span className="font-medium text-foreground">{String(s.severity ?? "n/a").charAt(0).toUpperCase() + String(s.severity ?? "n/a").slice(1)}</span></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No symptoms recorded</div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
