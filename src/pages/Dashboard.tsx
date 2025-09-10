import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Activity,
  Thermometer,
  User,
  Plus,
  AlertTriangle,
  TrendingUp,
  Calendar,
  LogOut
} from "lucide-react";
import { HealthChart } from "@/components/HealthChart";
import { RiskIndicator } from "@/components/RiskIndicator";
import { useToast } from "@/hooks/use-toast";

const healthTips = [
  "Stay hydrated! Aim for 8 glasses of water daily.",
  "Try walking 30 minutes today to support heart health.",
  "Include more vegetables and whole grains in your meals.",
  "Aim for 7–8 hours of sleep to support recovery.",
  "Check your blood pressure regularly and track trends.",
  "Reduce salt and sugar intake to lower hypertension and diabetes risk.",
  "Try breathing exercises to manage stress and improve lung health.",
  "Avoid smoking and limit alcohol for long-term benefits.",
  "Take short screen breaks to reduce eye strain and headaches.",
  "Do gentle stretches to reduce stiffness and improve mobility."
];

const num = (v: any) => (v === null || v === undefined ? null : Number(v));

function computeDiabetesRisk(entry: any, profile?: any) {
  if (!entry) return 10;
  const sugar = num(entry.blood_sugar);
  const sugarType = entry.blood_sugar_type ?? null;
  let score = 10;
  if (sugar == null) return score;

  if (sugarType === "fasting") {
    if (sugar >= 126) score = 95;
    else if (sugar >= 100) score = 70;
    else if (sugar >= 90) score = 30;
  } else {
    if (sugar >= 200) score = 95;
    else if (sugar >= 140) score = 70;
    else if (sugar >= 120) score = 40;
  }

  const weight = num(entry.weight);
  if (weight && weight >= 200) score = Math.min(100, score + 8);
  else if (weight && weight >= 180) score = Math.min(100, score + 5);

  const age = profile?.age ? Number(profile.age) : null;
  if (age && age >= 65) score = Math.min(100, score + 5);
  else if (age && age >= 50) score = Math.min(100, score + 3);

  return Math.round(score);
}

function computeHeartDiseaseRisk(entry: any, symptomsEntry: any, profile?: any) {
  if (!entry && !symptomsEntry) return 20;
  let score = 20;
  const sys = num(entry?.systolic_bp);
  const dia = num(entry?.diastolic_bp);
  const hr = num(entry?.heart_rate);
  const weight = num(entry?.weight);
  const age = profile?.age ? Number(profile.age) : null;

  if (sys != null && dia != null) {
    if (sys >= 160 || dia >= 100) score = 90;
    else if (sys >= 140 || dia >= 90) score = 75;
    else if (sys >= 130 || dia >= 85) score = 55;
    else if (sys >= 120 || dia >= 80) score = Math.max(score, 35);
  }

  if (hr != null) {
    if (hr < 50 || hr > 110) score = Math.min(100, score + 20);
    else if (hr > 100) score = Math.min(100, score + 12);
    else if (hr > 90) score = Math.min(100, score + 6);
  }

  if (weight && weight >= 200) score = Math.min(100, score + 8);
  else if (weight && weight >= 180) score = Math.min(100, score + 5);

  if (age && age >= 65) score = Math.min(100, score + 10);
  else if (age && age >= 50) score = Math.min(100, score + 6);

  const symptomIds = Array.isArray(symptomsEntry?.symptoms) ? symptomsEntry.symptoms.map((s: any) => s.id) : [];
  if (symptomIds.includes("chest-pain")) score = Math.min(100, score + 30);
  if (symptomIds.includes("irregular-heartbeat")) score = Math.min(100, score + 20);
  if (symptomIds.includes("dizziness")) score = Math.min(100, score + 10);

  return Math.round(score);
}

function computeHypertensionRisk(entry: any) {
  if (!entry) return 10;
  const sys = num(entry.systolic_bp);
  const dia = num(entry.diastolic_bp);
  let score = 10;
  if (sys == null || dia == null) return score;

  if (sys >= 160 || dia >= 100) score = 95;
  else if (sys >= 140 || dia >= 90) score = 80;
  else if (sys >= 130 || dia >= 85) score = 60;
  else if (sys >= 120 || dia >= 80) score = 35;
  else score = 10;

  return Math.round(score);
}

function computeStrokeRisk(entry: any, symptomsEntry: any, profile?: any) {
  let score = 5;
  const sys = num(entry?.systolic_bp);
  const dia = num(entry?.diastolic_bp);
  const age = profile?.age ? Number(profile.age) : null;
  if (sys != null && dia != null) {
    if (sys >= 180 || dia >= 120) score = 95;
    else if (sys >= 160 || dia >= 100) score = 70;
    else if (sys >= 140 || dia >= 90) score = 45;
  }
  if (age && age >= 75) score = Math.min(100, score + 15);
  else if (age && age >= 60) score = Math.min(100, score + 8);

  const symptomIds = Array.isArray(symptomsEntry?.symptoms) ? symptomsEntry.symptoms.map((s: any) => s.id) : [];
  if (symptomIds.includes("confusion") || symptomIds.includes("numbness")) {
    score = Math.min(100, score + 20);
  }

  return Math.round(score);
}

function computeCOPDRisk(symptomsEntry: any, entry: any) {
  let score = 5;
  const symptomObjs = Array.isArray(symptomsEntry?.symptoms) ? symptomsEntry.symptoms : [];
  const shortness = symptomObjs.find((s: any) => s.id === "shortness-breath");
  if (shortness) {
    const sev = shortness.severity || "mild";
    if (sev === "severe") score = 80;
    else if (sev === "moderate") score = 50;
    else score = 25;
  }
  const hr = num(entry?.heart_rate);
  if (hr && hr > 110) score = Math.min(100, score + 10);
  return Math.round(score);
}

function computeKidneyRisk(entry: any, profile?: any) {
  let score = 5;
  const sys = num(entry?.systolic_bp);
  const dia = num(entry?.diastolic_bp);
  if (sys && dia) {
    if (sys >= 160 || dia >= 100) score = 60;
    else if (sys >= 140 || dia >= 90) score = 40;
  }
  const diabetesScore = computeDiabetesRisk(entry, profile);
  if (diabetesScore >= 70) score = Math.min(100, Math.max(score, 70));
  const age = profile?.age ? Number(profile.age) : null;
  if (age && age >= 65) score = Math.min(100, score + 8);
  return Math.round(score);
}

const Dashboard = () => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [healthData, setHealthData] = useState<any[]>([]);
  const [latestSymptoms, setLatestSymptoms] = useState<any | null>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [randomTip, setRandomTip] = useState<string>("");

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUserId = sessionData?.session?.user?.id;
        const localRaw = localStorage.getItem("user");
        const localUser = localRaw ? JSON.parse(localRaw) : null;
        const userId = sessionUserId || localUser?.id;
        if (!userId) { navigate("/"); return; }

        setUser({ id: userId, name: localUser?.name ?? null, userType: localUser?.userType ?? "patient" });

        // profile
        try {
          const { data: profileData, error: profileError } = await supabase.from("profiles").select("*").eq("id", userId).single();
          if (!profileError) setProfile(profileData);
        } catch (e) {
          // ignore
        }

        // health data
        let { data: hdData, error: hdError } = await supabase
          .from("health_data")
          .select("*")
          .eq("user_id", userId)
          .order("timestamp", { ascending: false });
        if (hdError) {
          // try fallback ordering
          const retry = await supabase.from("health_data").select("*").eq("user_id", userId).order("created_at", { ascending: false });
          hdData = retry.data ?? [];
        }
        setHealthData(hdData ?? []);

        // latest symptoms
        try {
          const { data: sData } = await supabase
            .from("symptoms")
            .select("*")
            .eq("user_id", userId)
            .order("timestamp", { ascending: false })
            .limit(1)
            .single();
          setLatestSymptoms(sData ?? null);
        } catch (e) {
          // ignore
        }

        // insights
        try {
          const { data: insightsData } = await supabase
            .from("health_insights")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(5);
          setInsights(insightsData ?? []);
        } catch (e) {
          // ignore
        }
      } catch (err) {
        console.error("Dashboard init error:", err);
        toast({ title: "Error", description: "Failed to load dashboard", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    init();

    // pick a random tip each load
    setRandomTip(healthTips[Math.floor(Math.random() * healthTips.length)]);
  }, [navigate, toast]);

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    localStorage.removeItem("user");
    navigate("/");
  };

  if (!user) return null;
  const latest = healthData.length > 0 ? healthData[0] : null;

  // compute risks for UI
  const diabetesRisk = computeDiabetesRisk(latest, profile);
  const heartRisk = computeHeartDiseaseRisk(latest, latestSymptoms, profile);
  const hypertensionRisk = computeHypertensionRisk(latest);
  const strokeRisk = computeStrokeRisk(latest, latestSymptoms, profile);
  const copdRisk = computeCOPDRisk(latestSymptoms, latest);
  const kidneyRisk = computeKidneyRisk(latest, profile);

  const riskColor = (value: number) => (value >= 80 ? "destructive" : value >= 50 ? "warning" : "success");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">EarlyDiseaseAI</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {profile?.full_name ?? user.name ?? user.userType}
            </span>
            <Badge variant={user.userType === "patient" ? "default" : "secondary"}>{user.userType}</Badge>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-10">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main */}
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm">Heart Rate</CardTitle>
                    <Heart className="h-4 w-4 text-success" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{latest?.heart_rate ?? "--"}</div>
                    <p className="text-xs text-muted-foreground">bpm</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm">Blood Pressure</CardTitle>
                    <Activity className="h-4 w-4 text-info" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{latest ? `${latest.systolic_bp ?? "--"}/${latest.diastolic_bp ?? "--"}` : "--/--"}</div>
                    <p className="text-xs text-muted-foreground">mmHg</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm">Blood Sugar</CardTitle>
                    <Thermometer className="h-4 w-4 text-warning" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {latest?.blood_sugar != null ? `${latest.blood_sugar}${latest.blood_sugar_type ? ` (${latest.blood_sugar_type})` : ""}` : "--"}
                    </div>
                    <p className="text-xs text-muted-foreground">mg/dL</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Health Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  {healthData.length > 0 ? <HealthChart data={healthData} /> : <p className="text-center text-muted-foreground">No health data available.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Button variant="outline" className="h-20 flex flex-col items-center gap-2" onClick={() => navigate("/add-data")}>
                      <Plus className="h-6 w-6" />Add Health Data
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col items-center gap-2" onClick={() => navigate("/symptoms")}>
                      <User className="h-6 w-6" />Log Symptoms
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col items-center gap-2" onClick={() => navigate("/reports")}>
                      <Calendar className="h-6 w-6" />View Reports
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" />AI Risk Assessment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RiskIndicator disease="Diabetes" risk={diabetesRisk} color={riskColor(diabetesRisk)} />
                  <RiskIndicator disease="Heart Disease" risk={heartRisk} color={riskColor(heartRisk)} />
                  <RiskIndicator disease="Hypertension" risk={hypertensionRisk} color={riskColor(hypertensionRisk)} />
                  <RiskIndicator disease="Stroke" risk={strokeRisk} color={riskColor(strokeRisk)} />
                  <RiskIndicator disease="COPD (Breathing)" risk={copdRisk} color={riskColor(copdRisk)} />
                  <RiskIndicator disease="Kidney" risk={kidneyRisk} color={riskColor(kidneyRisk)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
                <CardContent>
                  {latest ? (
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between"><span>Latest reading</span><span className="text-muted-foreground">{latest.date ?? latest.timestamp ?? "—"}</span></div>
                      <div className="flex justify-between"><span>Latest symptoms</span><span className="text-muted-foreground">{latestSymptoms ? (Array.isArray(latestSymptoms.symptoms) ? latestSymptoms.symptoms.map((s:any)=>s.label).join(", ") : "—") : "—"}</span></div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">No recent activity.</p>
                  )}
                </CardContent>
              </Card>

              {/* AI Insights */}
              <Card>
                <CardHeader><CardTitle>AI Insights</CardTitle></CardHeader>
                <CardContent>
                  {insights.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No insights yet — they will appear after you log data.</p>
                  ) : (
                    <ul className="space-y-3">
                      {insights.map((ins:any) => (
                        <li key={ins.id} className="p-3 border rounded">
                          <div className="font-medium">{ins.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">{ins.body}</div>
                          <div className="text-xs text-muted-foreground mt-2">Generated: {new Date(ins.created_at).toLocaleString()}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Random Health Tip */}
              <Card>
                <CardHeader><CardTitle>Today's Health Tip</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{randomTip}</p>
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
