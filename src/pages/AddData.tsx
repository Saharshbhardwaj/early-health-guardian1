import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heart, ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const num = (v: any) => (v === null || v === undefined ? null : Number(v));

function computeDiabetesRiskFromEntry(entry: any, profile?: any) {
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

function computeHeartRiskFromEntry(entry: any, symptomsEntry?: any, profile?: any) {
  let score = 20;
  if (!entry && !symptomsEntry) return score;
  const sys = num(entry?.systolic_bp), dia = num(entry?.diastolic_bp), hr = num(entry?.heart_rate);

  if (sys != null && dia != null) {
    if (sys >= 160 || dia >= 100) score = 90;
    else if (sys >= 140 || dia >= 90) score = 75;
    else if (sys >= 130 || dia >= 85) score = 55;
    else if (sys >= 120 || dia >= 80) score = Math.max(score, 35);
  }
  if (hr != null) {
    if (hr < 50 || hr > 110) score = Math.min(100, score + 20);
    else if (hr > 100) score = Math.min(100, score + 12);
  }

  const symptomIds = Array.isArray(symptomsEntry?.symptoms) ? symptomsEntry.symptoms.map((s: any) => s.id) : [];
  if (symptomIds.includes("chest-pain")) score = Math.min(100, score + 30);
  if (symptomIds.includes("irregular-heartbeat")) score = Math.min(100, score + 20);

  const age = profile?.age ? Number(profile.age) : null;
  if (age && age >= 65) score = Math.min(100, score + 10);
  else if (age && age >= 50) score = Math.min(100, score + 6);

  return Math.round(score);
}

const AddData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    heartRate: "",
    systolicBP: "",
    diastolicBP: "",
    bloodSugar: "",
    bloodSugarType: "fasting", // fasting | random
    weight: "",
    temperature: "",
    sleepHours: "",
    exerciseMinutes: "",
    mood: "",
    symptoms: "",
    medications: "",
    notes: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // get user id (supabase session preferred, fallback to localStorage)
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUserId = sessionData?.session?.user?.id;
    const localRaw = localStorage.getItem("user");
    const localUser = localRaw ? JSON.parse(localRaw) : null;
    const userId = sessionUserId || localUser?.id;

    if (!userId) {
      toast({
        title: "Not authenticated",
        description: "Please sign in before saving data.",
        variant: "destructive"
      });
      navigate("/");
      return;
    }

    // Build payload for health_data table
    const payload: any = {
      user_id: userId,
      heart_rate: formData.heartRate ? parseInt(formData.heartRate) : null,
      systolic_bp: formData.systolicBP ? parseInt(formData.systolicBP) : null,
      diastolic_bp: formData.diastolicBP ? parseInt(formData.diastolicBP) : null,
      blood_sugar: formData.bloodSugar ? parseFloat(formData.bloodSugar) : null,
      blood_sugar_type: formData.bloodSugarType || null,
      weight: formData.weight ? parseFloat(formData.weight) : null,
      temperature: formData.temperature ? parseFloat(formData.temperature) : null,
      sleep_hours: formData.sleepHours ? parseFloat(formData.sleepHours) : null,
      exercise_minutes: formData.exerciseMinutes ? parseInt(formData.exerciseMinutes) : null,
      mood: formData.mood || null,
      symptoms: formData.symptoms || null,
      medications: formData.medications || null,
      notes: formData.notes || null,
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString()
    };

    // insert into health_data
    const { data, error } = await supabase.from("health_data").insert([payload]).select().single();

    if (error) {
      console.error("Insert health_data error:", error);
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Health Data Saved",
      description: "Your health information has been recorded successfully.",
      variant: "default"
    });

    // inserted entry
    const insertedEntry = data;

    // --- generate client-side insight and save to health_insights ---
    try {
      // fetch profile if available to use age/other factors
      let profileObj = null;
      try {
        const { data: pf, error: pfErr } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (!pfErr) profileObj = pf;
      } catch (e) {
        // ignore
      }

      // fetch latest symptoms for the user (if any)
      let latestSymptoms = null;
      try {
        const { data: sData } = await supabase
          .from("symptoms")
          .select("*")
          .eq("user_id", userId)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();
        latestSymptoms = sData ?? null;
      } catch (e) {
        // ignore if table not present / no rows
      }

      const diabetes = computeDiabetesRiskFromEntry(insertedEntry, profileObj);
      const heart = computeHeartRiskFromEntry(insertedEntry, latestSymptoms, profileObj);

      // pick primary risk
      let primary = "Diabetes";
      let primaryScore = diabetes;
      if (heart > primaryScore) { primary = "Heart disease"; primaryScore = heart; }

      const title =
        primaryScore >= 80 ? `${primary} risk: High` :
        primaryScore >= 50 ? `${primary} risk: Moderate` :
        `${primary} risk: Low`;

      const body =
        primaryScore >= 80
          ? `Your latest reading indicates a high ${primary.toLowerCase()} risk (${primaryScore}%). Please contact a healthcare professional or call 112 if you have severe symptoms.`
          : primaryScore >= 50
          ? `Your latest reading shows a moderate ${primary.toLowerCase()} risk (${primaryScore}%). Consider scheduling a doctor's visit for follow-up.`
          : `Your latest reading shows low ${primary.toLowerCase()} risk (${primaryScore}%). Keep tracking regularly.`;

      const insightPayload = {
        user_id: userId,
        title,
        body,
        risk_summary: { diabetes, heart },
        source: "client-agent-v1",
        created_at: new Date().toISOString()
      };

      const { error: insightError } = await supabase.from("health_insights").insert([insightPayload]);
      if (insightError) {
        console.warn("Failed to insert insight:", insightError);
      } else {
        console.log("Insight inserted");
      }
    } catch (err) {
      console.error("Insight generation error:", err);
    }

    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Add Health Data</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vital Signs */}
          <Card>
            <CardHeader>
              <CardTitle>Vital Signs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
                  <Input id="heartRate" type="number" placeholder="72" value={formData.heartRate} onChange={(e) => handleInputChange("heartRate", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="systolicBP">Systolic BP (mmHg)</Label>
                  <Input id="systolicBP" type="number" placeholder="120" value={formData.systolicBP} onChange={(e) => handleInputChange("systolicBP", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diastolicBP">Diastolic BP (mmHg)</Label>
                  <Input id="diastolicBP" type="number" placeholder="80" value={formData.diastolicBP} onChange={(e) => handleInputChange("diastolicBP", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bloodSugar">Blood Sugar (mg/dL)</Label>
                  <Input id="bloodSugar" type="number" placeholder="95" value={formData.bloodSugar} onChange={(e) => handleInputChange("bloodSugar", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bloodSugarType">Blood Sugar Type</Label>
                  <Select value={formData.bloodSugarType} onValueChange={(v) => handleInputChange("bloodSugarType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fasting">Fasting</SelectItem>
                      <SelectItem value="random">Random</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (lbs)</Label>
                  <Input id="weight" type="number" placeholder="165" value={formData.weight} onChange={(e) => handleInputChange("weight", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature (°F)</Label>
                  <Input id="temperature" type="number" step="0.1" placeholder="98.6" value={formData.temperature} onChange={(e) => handleInputChange("temperature", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lifestyle & Wellness */}
          <Card>
            <CardHeader>
              <CardTitle>Lifestyle & Wellness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sleepHours">Sleep Hours</Label>
                  <Input id="sleepHours" type="number" step="0.5" placeholder="8" value={formData.sleepHours} onChange={(e) => handleInputChange("sleepHours", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exerciseMinutes">Exercise (minutes)</Label>
                  <Input id="exerciseMinutes" type="number" placeholder="30" value={formData.exerciseMinutes} onChange={(e) => handleInputChange("exerciseMinutes", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mood">Mood</Label>
                  <Select value={formData.mood} onValueChange={(v) => handleInputChange("mood", v)}>
                    <SelectTrigger><SelectValue placeholder="Select mood" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                      <SelectItem value="very-poor">Very Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Symptoms & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Symptoms & Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="symptoms">Symptoms</Label>
                <Textarea id="symptoms" placeholder="Describe any symptoms..." value={formData.symptoms} onChange={(e) => handleInputChange("symptoms", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medications">Medications</Label>
                <Textarea id="medications" placeholder="List medications..." value={formData.medications} onChange={(e) => handleInputChange("medications", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" placeholder="Any other notes..." value={formData.notes} onChange={(e) => handleInputChange("notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
            <Button type="submit"><Save className="h-4 w-4 mr-2" />Save Health Data</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddData;
