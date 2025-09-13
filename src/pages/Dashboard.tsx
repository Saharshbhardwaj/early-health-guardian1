// src/pages/Dashboard.tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Activity, Thermometer, Plus, AlertTriangle, TrendingUp, Calendar, LogOut } from "lucide-react";
import { HealthChart } from "@/components/HealthChart";
import  RiskIndicator  from "@/components/RiskIndicator";
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
  remind_at: string;
  repeat?: string | null;
  sent?: boolean;
};

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [latestVitals, setLatestVitals] = useState<HealthRow | null>(null);
  const [recentReadings, setRecentReadings] = useState<Array<{ date: string; heartRate?: number; bp?: string | null; bloodSugar?: number | null }>>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [symptomsList, setSymptomsList] = useState<Array<{ id: string; label: string; severity?: string; recorded_at?: string }>>([]);
  const [notesList, setNotesList] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [riskScores, setRiskScores] = useState<{ [k: string]: number }>({ diabetes: 0, heartDisease: 0, alzheimer: 0, hypertension: 0, respiratory: 0 });
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
    "If you feel dizzy, sit or lie down immediately and notify caregiver."
  ];

  // utility: simple risk scoring from a single reading (not clinical)
  const computeRiskFromReading = useCallback((p: Profile | null, row: HealthRow | null) => {
    const baseScores = { diabetes: 0, heartDisease: 0, alzheimer: 0, hypertension: 0, respiratory: 0 };
    if (!row) return baseScores;

    const sugar = row.blood_sugar ?? null;
    const sys = row.systolic_bp ?? null;
    const dia = row.diastolic_bp ?? null;
    const hr = row.heart_rate ?? null;
    const temp = row.temperature ?? null;
    const age = p?.age ?? 60;

    // simple interpretable heuristics
    if (sugar != null) {
      // maps higher sugar to diabetes score
      baseScores.diabetes = Math.min(100, Math.max(0, Math.round((sugar - 80) / 2)));
    }
    if (sys != null) {
      baseScores.hypertension = Math.min(100, Math.max(0, Math.round((sys - 110) / 1.2)));
      baseScores.heartDisease = Math.min(100, Math.max(0, Math.round(((sys - 120) / 1.5) + (hr ? (hr - 70) / 1.2 : 0))));
    }
    // age factor for alzheimer
    baseScores.alzheimer = Math.min(100, Math.max(0, Math.round((age - 55) * 1.2)));
    // respiratory crude signal from temperature + hr
    if (temp != null) {
      baseScores.respiratory = Math.min(100, Math.max(0, Math.round((temp - 97) * 10)));
    }

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

  // fetch core data
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

        // fetch profile
        const { data: profileData, error: profileErr } = await supabase.from("profiles").select("id,full_name,age,sex").eq("id", user.id).single();
        if (profileErr && profileErr.code !== "PGRST116") {
          // PGRST116 sometimes when table missing; still continue gracefully
          console.warn("profile fetch", profileErr);
        }
        const prof = profileData ?? { id: user.id, full_name: user.email };
        if (mounted) setProfile(prof);

        // fetch last 20 readings for display
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
        const recent = (vData || []).slice(0, 10).map(r => ({
          date: r.created_at ?? r.timestamp ?? new Date().toISOString(),
          heartRate: r.heart_rate ?? undefined,
          bp: r.systolic_bp != null && r.diastolic_bp != null ? `${r.systolic_bp}/${r.diastolic_bp}` : null,
          bloodSugar: r.blood_sugar ?? undefined
        })).reverse();
        if (mounted) setRecentReadings(recent);

        // compute risk scores from latest
        const computed = computeRiskFromReading(prof, latest);
        if (mounted) setRiskScores({
          diabetes: computed.diabetes,
          heartDisease: computed.heartDisease,
          alzheimer: computed.alzheimer,
          hypertension: computed.hypertension,
          respiratory: computed.respiratory
        });

        // fetch health_insights (latest 5)
        const { data: insightsData } = await supabase
          .from("health_insights")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (mounted) setInsights(insightsData || []);

        // fetch reminders
        const { data: remindersData } = await supabase
          .from("reminders")
          .select("*")
          .eq("user_id", user.id)
          .order("remind_at", { ascending: true })
          .limit(5);
        if (mounted) setReminders(remindersData || []);

        // fetch symptoms (if stored in a symptoms table) or parse from latest row
        // attempt to read a 'symptoms' table first; fallback: use latestVitals.symptoms
        const { data: symptomsTable } = await supabase.from("symptoms").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
        if (symptomsTable && symptomsTable.length) {
          const sList = symptomsTable.map((s: any) => ({ id: s.id || (s.created_at + Math.random()), label: s.label ?? s.symptom, severity: s.severity ?? "mild", recorded_at: s.created_at }));
          setSymptomsList(sList);
        } else if (latest?.symptoms) {
          // parse comma/newline separated notes (keep as readable list)
          const raw = String(latest.symptoms).trim();
          const list = raw.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean).map((t, i) => ({ id: `s-${i}`, label: t, severity: "reported", recorded_at: latest.created_at }));
          setSymptomsList(list);
        } else {
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

  // useful: format date
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

  // AI Insights: show human-friendly summary (insights.summary) not raw JSON
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

  // if still loading return skeleton-ish null (keeps layout)
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

            {/* Current vitals row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Heart Rate</CardTitle>
                  <Heart className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{latestVitals?.heart_rate ?? "-"}</div>
                  <p className="text-xs text-muted-foreground">bpm</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Blood Pressure</CardTitle>
                  <Activity className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatBP(latestVitals)}</div>
                  <p className="text-xs text-muted-foreground">mmHg</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Blood Sugar</CardTitle>
                  <Thermometer className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{latestVitals?.blood_sugar ?? "-"}</div>
                  <p className="text-xs text-muted-foreground">mg/dL</p>
                </CardContent>
              </Card>
            </div>

            {/* Chart + AI Insights */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Health Trends</CardTitle>
                <div className="text-sm text-muted-foreground">Last {recentReadings.length} readings</div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
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

            {/* Quick actions */}
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

            {/* Symptoms and notes area - symptoms below AI insights as requested */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Symptoms</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderSymptoms()}
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
            </div>

          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Risk Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RiskIndicator disease="Diabetes" risk={riskScores.diabetes} color="warning" />
                <RiskIndicator disease="Heart Disease" risk={riskScores.heartDisease} color="destructive" />
                <RiskIndicator disease="Hypertension" risk={riskScores.hypertension} color="destructive" />
                <RiskIndicator disease="Respiratory" risk={riskScores.respiratory} color="warning" />
                <RiskIndicator disease="Alzheimer's" risk={riskScores.alzheimer} color="success" />
              </CardContent>
            </Card>
            <UpcomingReminders/>

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

            {/* Upcoming Reminders */}
            

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
