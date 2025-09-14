// src/pages/Dashboard.tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Activity, Thermometer, Plus, AlertTriangle, TrendingUp, Calendar, LogOut } from "lucide-react";
import { HealthChart } from "@/components/HealthChart";
import RiskIndicator from "@/components/RiskIndicator";
import { useToast } from "@/hooks/use-toast";
import UpcomingReminders from "@/components/UpcomingReminders";

type Profile = {
  id: string;
  full_name?: string | null;
  age?: number | null;
  sex?: string | null;
};

type HealthRow = {
  id?: string;
  patient_id?: string;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  blood_sugar?: number | null;
  weight?: number | null;
  temperature?: number | null; // stored in °F
  sleep_hours?: number | null;
  exercise_minutes?: number | null;
  mood?: string | null;
  symptoms?: string | null;
  medications?: string | null;
  notes?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
};

type Insight = {
  id?: string;
  user_id?: string;
  title?: string | null;
  summary?: string | null;
  risk_scores?: string | null; // JSON string
  created_at?: string | null;
};

type Reminder = {
  id: string;
  title: string;
  description?: string | null;
  remind_at?: string;
  notify_at?: string;
  repeat?: string | null;
  sent?: boolean | null;
};

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [latestVitals, setLatestVitals] = useState<HealthRow | null>(null);
 const [recentReadings, setRecentReadings] = useState<
  Array<{
    created_at: string;
    heart_rate?: number | null;
    blood_sugar?: number | null;
    systolic_bp?: number | null;
    diastolic_bp?: number | null;
    weight?: number | null;
    temperature?: number | null;
    sleep_hours?: number | null;
    exercise_minutes?: number | null;
    mood?: string | null;
    notes?: string | null;
  }>
>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [symptomsList, setSymptomsList] = useState<Array<{ id: string; label: string; severity?: string; recorded_at?: string }>>([]);
  const [notesList, setNotesList] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [riskScores, setRiskScores] = useState<{ [k: string]: number }>({
    diabetes: 0,
    heartDisease: 0,
    alzheimer: 0,
    hypertension: 0,
    respiratory: 0,
    stroke: 0,
    kidney: 0,
    copd: 0,
    obesity: 0,
  });
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Health tips pool (expanded and varied)
  const HEALTH_TIPS = [
    "Stay hydrated — sip water regularly throughout the day.",
    "Take a short walk after meals to help blood sugar control.",
    "Practice deep breathing for 3–5 minutes if you feel anxious.",
    "Stand up and stretch every hour to ease stiffness.",
    "Maintain a consistent sleep schedule for better recovery.",
    "Check your medications and keep a daily pill log.",
    "Limit salty snacks to help keep blood pressure down.",
    "Include light resistance exercise twice a week if able.",
    "Measure blood pressure after sitting calmly for 5 minutes.",
    "If you feel dizzy, sit or lie down immediately and notify caregiver.",
  ];

  // compute risk heuristics (interpretable rules)
  const computeRiskFromReading = useCallback((p: Profile | null, row: HealthRow | null) => {
    const baseScores: { [k: string]: number } = {
      diabetes: 0,
      heartDisease: 0,
      alzheimer: 0,
      hypertension: 0,
      respiratory: 0,
      stroke: 0,
      kidney: 0,
      copd: 0,
      obesity: 0,
    };
    if (!row) return baseScores;

    const sugar = row.blood_sugar ?? null;
    const sys = row.systolic_bp ?? null;
    const dia = row.diastolic_bp ?? null;
    const hr = row.heart_rate ?? null;
    const temp = row.temperature ?? null;
    const weight = row.weight ?? null;
    const age = p?.age ?? 60;

    // Diabetes: sugar-driven
    if (sugar != null) {
      // stronger sensitivity for high sugar
      baseScores.diabetes = Math.min(100, Math.max(0, Math.round((sugar - 80) * 0.9)));
    }

    // Hypertension: systolic driven
    if (sys != null) {
      baseScores.hypertension = Math.min(100, Math.max(0, Math.round((sys - 110) * 1.2)));
    }

    // Heart disease: combination of bp and hr
    if (sys != null || hr != null) {
      const bpFactor = sys != null ? (sys - 120) / 1.5 : 0;
      const hrFactor = hr != null ? (hr - 72) / 1.3 : 0;
      baseScores.heartDisease = Math.min(100, Math.max(0, Math.round(bpFactor + hrFactor)));
    }

    // Alzheimer's: age-major factor, small modulation by inactivity (sleep)
    baseScores.alzheimer = Math.min(100, Math.max(0, Math.round((age - 55) * 1.2)));

    // Respiratory: temperature + elevated HR
    if (temp != null || hr != null) {
      const t = temp != null ? Math.max(0, (temp - 98)) * 8 : 0;
      const h = hr != null ? Math.max(0, (hr - 80)) * 0.8 : 0;
      baseScores.respiratory = Math.min(100, Math.max(0, Math.round(t + h)));
    }

    // Stroke: heavily tied to hypertension + age
    if (sys != null) {
      baseScores.stroke = Math.min(100, Math.max(0, Math.round(((sys - 130) * 0.8) + ((age - 60) * 0.6))));
    }

    // Kidney: correlation with long-term high BP and high sugar — crude instant measure
    if (sys != null || sugar != null) {
      const k1 = sys != null ? Math.max(0, (sys - 120)) * 0.4 : 0;
      const k2 = sugar != null ? Math.max(0, (sugar - 100)) * 0.3 : 0;
      baseScores.kidney = Math.min(100, Math.max(0, Math.round(k1 + k2)));
    }

    // COPD: rough signal from elevated resting HR + temp
    if (hr != null) {
      baseScores.copd = Math.min(100, Math.max(0, Math.round((hr - 75) * 0.7 + (temp ? (temp - 98) * 5 : 0))));
    }

    // Obesity: we don't have height. crude proxy: high weight -> higher score (user should fill height to compute BMI)
    if (weight != null) {
      baseScores.obesity = Math.min(100, Math.max(0, Math.round((weight - 140) * 0.6)));
    }

    // normalize to positive integers + clamp
    Object.keys(baseScores).forEach(k => {
      const v = Math.round(baseScores[k] || 0);
      baseScores[k] = Math.min(100, Math.max(0, v));
    });

    return baseScores;
  }, []);

  // pick non-repeating tips for the day
  const pickDailyTips = useCallback(() => {
    const shuffled = [...HEALTH_TIPS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 4);
    setTips(selected);
  }, []);

  // format bp string
  const formatBP = (r: HealthRow | null) => {
    if (!r) return "-";
    if (r.systolic_bp != null && r.diastolic_bp != null) return `${r.systolic_bp}/${r.diastolic_bp}`;
    return "-";
  };

  // load core data
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;
        if (!user) {
          navigate("/");
          return;
        }
        if (!mounted) return;
        setUserId(user.id);

        // fetch profile (use maybeSingle equivalent)
        const { data: profileData, error: profileErr } = await supabase.from("profiles").select("id,full_name,age,sex").eq("id", user.id).maybeSingle();
        if (profileErr) {
          console.warn("profile fetch", profileErr);
        }
        const prof = profileData ?? { id: user.id, full_name: user.email };
        if (mounted) setProfile(prof);

        // fetch last 50 readings for display (most recent first)
        const { data: vitalsData } = await supabase
          .from("health_data")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        const vData: HealthRow[] = vitalsData ?? [];
        const latest = vData.length ? vData[0] : null;
        if (mounted) setLatestVitals(latest);

        // prepare recent readings for chart (convert to chronological order, pick last 10)
        const recent = (vData || [])
  .slice(0, 10)
  .map((r) => ({
    // use created_at as the x axis (ISO string)
    created_at: r.created_at ?? r.timestamp ?? new Date().toISOString(),

    // numeric series (keep as numbers or null)
    heart_rate: typeof r.heart_rate === "number" ? r.heart_rate : null,
    blood_sugar: typeof r.blood_sugar === "number" ? r.blood_sugar : null,
    systolic_bp: typeof r.systolic_bp === "number" ? r.systolic_bp : null,
    diastolic_bp: typeof r.diastolic_bp === "number" ? r.diastolic_bp : null,
    weight: typeof r.weight === "number" ? r.weight : null,
    temperature: typeof r.temperature === "number" ? r.temperature : null,
    sleep_hours: typeof r.sleep_hours === "number" ? r.sleep_hours : null,
    exercise_minutes: typeof r.exercise_minutes === "number" ? r.exercise_minutes : null,

    // keep any text fields (optional)
    mood: r.mood ?? null,
    notes: r.notes ?? null
  }))
  .reverse();

// set state with typed shape (adjust type to match HealthChart input)
if (mounted) setRecentReadings(recent);;

        // compute risk scores from latest
        const computed = computeRiskFromReading(prof, latest);
        if (mounted) setRiskScores({
          diabetes: computed.diabetes,
          heartDisease: computed.heartDisease,
          alzheimer: computed.alzheimer,
          hypertension: computed.hypertension,
          respiratory: computed.respiratory,
          stroke: computed.stroke,
          kidney: computed.kidney,
          copd: computed.copd,
          obesity: computed.obesity,
        });

        // fetch health_insights (latest 10)
        const { data: insightsData } = await supabase
          .from("health_insights")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (mounted) setInsights(insightsData || []);

        // fetch reminders - show only pending (sent=false or null)
        const { data: remindersData } = await supabase
          .from("reminders")
          .select("*")
          .eq("user_id", user.id)
          .or('sent.eq.false,sent.is.null')
          .order("notify_at", { ascending: true })
          .limit(5);
        if (mounted) setReminders(remindersData || []);

        // fetch symptoms table; fallback to latestVitals.symptoms
        // fetch symptoms (if stored in a symptoms table) or parse from latestVitals
try {
  const { data: symptomsTable, error: symptomsErr, status: symptomsStatus } = await supabase
    .from("symptoms")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("symptoms fetch status:", symptomsStatus, "error:", symptomsErr, "rows:", symptomsTable?.length);
  console.log("symptomsTable (raw):", symptomsTable);

  if (symptomsErr && symptomsErr.code !== "PGRST116") {
    console.warn("symptoms fetch error", symptomsErr);
  }

  if (symptomsTable && symptomsTable.length) {
    const sList = symptomsTable.map((s: any) => ({
      id: s.id || (s.created_at + Math.random()),
      label: s.label ?? s.symptom ?? s.name ?? "Unnamed",
      severity: s.severity ?? "mild",
      recorded_at: s.created_at
    }));
    setSymptomsList(sList);
  } else if (latest?.symptoms) {
    // fallback: parse latestVitals.symptoms if present
    const raw = String(latest.symptoms).trim();
    const list = raw.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean).map((t, i) => ({ id: `s-${i}`, label: t, severity: "reported", recorded_at: latest.created_at }));
    setSymptomsList(list);
    console.log("Used fallback latest.symptoms:", list);
  } else {
    setSymptomsList([]);
    console.log("No symptoms found, symptomsList cleared.");
  }
} catch (e) {
  console.error("Exception while fetching symptoms:", e);
  setSymptomsList([]);
}

        // fetch notes (collect most recent notes from health_data)
        const notes = (vData || []).map(r => r.notes).filter(Boolean) as string[];
        setNotesList(notes.slice(0, 5));

        // pick daily tips
        pickDailyTips();

      } catch (err: any) {
        console.error("Dashboard load error", err);
        toast({ title: "Load failed", description: err?.message || String(err), variant: "destructive" });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAll();
    return () => { mounted = false; };
  }, [navigate, toast, computeRiskFromReading, pickDailyTips]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("user");
    navigate("/");
  };

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "-");

  // render symptom list as numbered items
  const renderSymptoms = () => {
    if (!symptomsList || symptomsList.length === 0) return <p className="text-sm text-muted-foreground">No symptoms recorded.</p>;
    return (
      <ol className="list-decimal list-inside text-sm space-y-1">
        {symptomsList.map((s) => (
          <li key={s.id}>
            <div className="font-semibold">{s.label}</div>
            <div className="text-xs text-muted-foreground">Severity: {s.severity} · {s.recorded_at ? fmt(s.recorded_at) : "-"}</div>
          </li>
        ))}
      </ol>
    );
  };

  // render notes list
  const renderNotes = () => {
    if (!notesList || notesList.length === 0) return <p className="text-sm text-muted-foreground">No notes yet.</p>;
    return (
      <ul className="text-sm list-decimal list-inside space-y-1">
        {notesList.map((n, idx) => (<li key={idx}><div>{n}</div></li>))}
      </ul>
    );
  };

  // human-friendly insights
  const renderInsights = () => {
    if (!insights || insights.length === 0) return <p className="text-sm text-muted-foreground">No AI insights yet. They will appear after you add data.</p>;
    return (
      <div className="space-y-3">
        {insights.map(i => (
          <Card key={i.id}>
            <CardContent>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{i.title}</div>
                  <div className="text-xs text-muted-foreground">{i.created_at ? new Date(i.created_at).toLocaleString() : ""}</div>
                </div>
                <div className="text-sm text-muted-foreground">{/* small tag area if needed */}</div>
              </div>
              <div className="mt-2 text-sm">
                {i.summary || i.risk_scores || "-"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  // RiskChart - simple horizontal bars with colors
  const RiskChart: React.FC<{ scores: { [k: string]: number } }> = ({ scores }) => {
    const items = [
      { key: "diabetes", label: "Diabetes", color: "bg-amber-400" },
      { key: "heartDisease", label: "Heart Disease", color: "bg-red-500" },
      { key: "hypertension", label: "Hypertension", color: "bg-blue-500" },
      { key: "stroke", label: "Stroke", color: "bg-purple-500" },
      { key: "kidney", label: "Kidney Disease", color: "bg-cyan-500" },
      { key: "alzheimer", label: "Alzheimer's", color: "bg-green-500" },
      { key: "respiratory", label: "Respiratory", color: "bg-orange-400" },
      { key: "copd", label: "COPD", color: "bg-sky-600" },
      { key: "obesity", label: "Obesity", color: "bg-violet-400" },
    ];

    return (
      <div className="space-y-3">
        {items.map(it => {
          const val = Math.max(0, Math.min(100, Math.round(scores[it.key] ?? 0)));
          return (
            <div key={it.key} className="w-full">
              <div className="flex justify-between items-center mb-1">
                <div className="text-sm font-medium">{it.label}</div>
                <div className="text-xs text-muted-foreground">{val}%</div>
              </div>
              <div className="w-full bg-muted rounded h-3 overflow-hidden">
                <div className={`${it.color} h-3`} style={{ width: `${val}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // if still loading
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div>Loading dashboard…</div>
      </div>
    );
  }

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
            <div className="text-sm text-muted-foreground">Welcome, {profile?.full_name ?? "User"}</div>
            <Badge variant="default">patient</Badge>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Current vitals row (left-aligned values + colors) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2 text-left">
                  <CardTitle className="text-sm font-medium">Heart Rate</CardTitle>
                  <Heart className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-2xl font-bold text-left text-red-600">{latestVitals?.heart_rate ?? "-"}</div>
                  <p className="text-xs text-muted-foreground text-left">bpm</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 text-left">
                  <CardTitle className="text-sm font-medium">Blood Pressure</CardTitle>
                  <Activity className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-left text-blue-600">{formatBP(latestVitals)}</div>
                  <p className="text-xs text-muted-foreground text-left">mmHg</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className=" pb-2 text-left">
                  <CardTitle className="text-sm font-medium">Blood Sugar</CardTitle>
                  <Thermometer className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-left text-amber-600">{latestVitals?.blood_sugar ?? "-"}</div>
                  <p className="text-xs text-muted-foreground text-left">mg/dL</p>
                </CardContent>
              </Card>
            </div>

            {/* Chart + AI Insights (Health Trends header left-aligned) */}
            <Card>
              <CardHeader className="pb-2 text-left">
                <CardTitle className="flex items-center gap-2 text-left"><TrendingUp className="h-5 w-5" /> <span>Health Trends</span></CardTitle>
                <div className="text-sm text-muted-foreground">Last {recentReadings.length} readings</div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-left">
                  <div>
                    <HealthChart data={recentReadings} />
                  </div>

                  {/* AI Insights placed under chart for symmetry */}
                  <div>
                    <h3 className="text-md font-semibold mb-2">AI Insights</h3>
                    {renderInsights()}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Summary moved under the chart to make left column taller */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Risk Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <RiskChart scores={riskScores} />
              </CardContent>
            </Card>

            {/* Recent Symptoms (from symptoms table or latestVitals.symptoms) */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Symptoms</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderSymptoms()}
                </CardContent>
              </Card>

              
            

          </div>

          {/* Sidebar (Quick Actions + Upcoming Reminders + Today's Tips + Recent Activity) */}
          <aside className="space-y-6">

            {/* Quick Actions (moved to sidebar in place of previous Risk Summary) */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Button variant="outline" className="h-20 flex flex-col items-center gap-2" onClick={() => navigate("/add-data")}>
                    <Plus className="h-6 w-6" />
                    Add Health Data
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col items-center gap-2" onClick={() => navigate("/symptoms")}>
                    <Activity className="h-6 w-6" />
                    Log Symptoms
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col items-center gap-2" onClick={() => navigate("/reports")}>
                    <Calendar className="h-6 w-6" />
                    View Reports
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Reminders (will show only pending reminders because we fetched sent=false) */}
            <UpcomingReminders  />

            {/* Today's health tips */}
            <Card>
              <CardHeader>
                <CardTitle>Today's Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  {tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </CardContent>
            </Card>
            <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderNotes()}
                </CardContent>
              </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span>Last recorded vitals</span>
                    <span className="text-muted-foreground">{latestVitals?.created_at ? new Date(latestVitals.created_at).toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last symptom logged</span>
                    <span className="text-muted-foreground">{symptomsList.length ? fmt(symptomsList[0].recorded_at) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last insight</span>
                    <span className="text-muted-foreground">{insights.length ? fmt(insights[0].created_at) : "—"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </aside>
        </div>
      </main>
    </div>
  );
}
