// src/pages/AddData.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heart, ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import agentLib from "@/lib/agent";

/**
 * Full AddData page.
 * - Insert into health_data
 * - Compute risks (agentLib.computeRisks)
 * - Persist insight in health_insights
 * - Create notifications and call /api/notify (email) for patient+caregivers if urgent
 * - Schedule reminder for moderate risk
 */

type FormState = {
  heartRate: string;
  systolicBP: string;
  diastolicBP: string;
  bloodSugar: string;
  weight: string;
  height: string;
  temperature: string;
  sleepHours: string;
  exerciseMinutes: string;
  mood: string;
  symptoms: string;
  medications: string;
  notes: string;
  diet?: string;
  activity?: string;
  oxygenSaturation?: string;
  respirationRate?: string;
};

const DEFAULT_STATE: FormState = {
  heartRate: "",
  systolicBP: "",
  diastolicBP: "",
  bloodSugar: "",
  weight: "",
  height: "",
  temperature: "",
  sleepHours: "",
  exerciseMinutes: "",
  mood: "",
  symptoms: "",
  medications: "",
  notes: "",
  diet: "",
  activity: "",
  oxygenSaturation: "",
  respirationRate: ""
};

const AddData: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormState>({ ...DEFAULT_STATE });
  const [saving, setSaving] = useState(false);

  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
  };

  const getCurrentUserId = async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (uid) return uid;
    } catch (e) {
      // fallback to localStorage if present
    }
    try {
      const local = JSON.parse(localStorage.getItem("user") || "null");
      return local?.userId ?? local?.id ?? null;
    } catch (e) {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        toast({
          title: "Not signed in",
          description: "Please sign in before adding health data.",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      // build insert row with nulls for missing fields and typed numbers
      const row = {
        user_id: userId,
        heart_rate: formData.heartRate ? Number(formData.heartRate) : null,
        systolic_bp: formData.systolicBP ? Number(formData.systolicBP) : null,
        diastolic_bp: formData.diastolicBP ? Number(formData.diastolicBP) : null,
        blood_sugar: formData.bloodSugar ? Number(formData.bloodSugar) : null,
        weight: formData.weight ? Number(formData.weight) : null,
        height: formData.height ? Number(formData.height) : null,
        temperature: formData.temperature ? Number(formData.temperature) : null,
        sleep_hours: formData.sleepHours ? Number(formData.sleepHours) : null,
        exercise_minutes: formData.exerciseMinutes ? Number(formData.exerciseMinutes) : null,
        mood: formData.mood || null,
        symptoms: formData.symptoms || null,
        medications: formData.medications || null,
        notes: formData.notes || null,
        diet: formData.diet || null,
        activity: formData.activity || null,
        oxygen_saturation: formData.oxygenSaturation ? Number(formData.oxygenSaturation) : null,
        respiration_rate: formData.respirationRate ? Number(formData.respirationRate) : null,
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10)
      };

      // insert into db
      const { data: insertRes, error: insertErr } = await supabase.from("health_data").insert([row]).select().single();

      if (insertErr) throw insertErr;

      // compute risks using your agent library (synchronous or lightweight)
      let risks: Record<string, number> = {};
      try {
        // agentLib.computeRisks should accept the row and return risk percentages
        risks = agentLib.computeRisks?.(row) ?? {};
      } catch (agentErr) {
        console.warn("agent computeRisks failed", agentErr);
      }

      // persist insight
      try {
        await supabase.from("health_insights").insert([{
          user_id: userId,
          title: "Reading recorded",
          body: JSON.stringify({ risks, reading: row }),
          insights: risks,
          created_at: new Date().toISOString(),
          source: "client"
        }]);
      } catch (insErr) {
        console.warn("failed to insert insight", insErr);
      }

      // create in-app notification for patient
      try {
        await supabase.from("notifications").insert([{
          user_id: userId,
          title: "New health reading recorded",
          body: `A new reading was saved. Key vitals — HR: ${row.heart_rate ?? "—"}, BP: ${row.systolic_bp ?? "—"}/${row.diastolic_bp ?? "—"}, Sugar: ${row.blood_sugar ?? "—"}.`,
          level: "info",
          channel: "in-app",
          data: { readingId: insertRes?.id ?? null, risks }
        }]);
      } catch (notifErr) {
        console.warn("failed to create in-app notification", notifErr);
      }

      // fetch caregivers for this patient (try both user_id and patient_id columns)
      let caregivers: any[] = [];
      try {
        const caregiversQuery = await supabase
          .from("caregivers")
          .select("id,name,email,phone,caregiver_user_id")
          .or(`user_id.eq.${userId},patient_id.eq.${userId}`);
        if (!caregiversQuery.error && Array.isArray(caregiversQuery.data)) caregivers = caregiversQuery.data;
      } catch (e) {
        console.warn("error fetching caregivers", e);
      }

      // Decide urgency thresholds (you can adjust rules inside agentLib.shouldAlert if available)
      const maxRisk = Object.values(risks).length ? Math.max(...Object.values(risks)) : 0;

      // If urgent, create urgent notifications and send email to patient + caregivers
      const urgent = maxRisk >= 80;   // threshold for urgent
      const moderate = maxRisk >= 50 && maxRisk < 80;

      if (urgent) {
        // add urgent in-app notification
        try {
          await supabase.from("notifications").insert([{
            user_id: userId,
            title: "Urgent: abnormal health reading",
            body: `An urgent reading was detected (risk snapshot: ${JSON.stringify(risks)}).`,
            level: "urgent",
            channel: "in-app",
            data: { readingId: insertRes?.id ?? null, risks }
          }]);
        } catch (err) {
          console.warn("failed urgent notification insert", err);
        }

        // gather recipient emails (patient + caregivers if present)
        let patientEmail: string | null = null;
        try {
          // try auth user email
          const { data: authData } = await supabase.auth.getUser();
          patientEmail = authData?.user?.email ?? null;
        } catch (e) {
          // fallback to localStorage user
        }
        if (!patientEmail) {
          try {
            const local = JSON.parse(localStorage.getItem("user") || "null");
            patientEmail = local?.email ?? null;
          } catch (e) { /* ignore */ }
        }

        const recipientEmails = new Set<string>();
        if (patientEmail) recipientEmails.add(patientEmail);
        caregivers.forEach((c) => { if (c?.email) recipientEmails.add(c.email); });

        // send emails via server endpoint /api/notify (Resend)
        for (const to of Array.from(recipientEmails)) {
          try {
            await fetch("/api/notify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to,
                title: "Urgent Health Alert — Early Health Guardian",
                body: `An urgent health reading was detected for patient.\n\nSummary:\n${JSON.stringify(risks, null, 2)}\n\nPlease check the dashboard or contact the patient. If the patient is in immediate danger, call local emergency services (India): 112.`,
                meta: { userId, readingId: insertRes?.id ?? null }
              })
            });
          } catch (sendErr) {
            console.warn("failed to call /api/notify", sendErr);
          }
        }
      }

      // For moderate risk schedule a followup reminder
      if (moderate) {
        try {
          const scheduledAt = new Date();
          scheduledAt.setDate(scheduledAt.getDate() + 3); // 3 days
          await supabase.from("reminders").insert([{
            user_id: userId,
            title: "Follow-up: re-check health readings",
            body: "Please re-enter your vitals so we can check trends.",
            scheduled_at: scheduledAt.toISOString(),
            metadata: { triggeredByReading: insertRes?.id ?? null }
          }]);
        } catch (remErr) {
          console.warn("failed to schedule reminder", remErr);
        }
      }

      toast({
        title: "Health Data Saved",
        description: "Your health information has been recorded successfully.",
        variant: "default"
      });

      navigate("/dashboard");
    } catch (err: any) {
      console.error("AddData save error", err);
      toast({
        title: "Save failed",
        description: err?.message ?? "Could not save health data",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      <main className="container mx-auto px-4 py-6 max-w-4xl">
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
                  <Label htmlFor="oxygenSaturation">Oxygen Saturation (%)</Label>
                  <Input id="oxygenSaturation" type="number" step="0.1" placeholder="98" value={formData.oxygenSaturation} onChange={(e) => handleInputChange("oxygenSaturation", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="respirationRate">Respiration Rate (breaths/min)</Label>
                  <Input id="respirationRate" type="number" placeholder="16" value={formData.respirationRate} onChange={(e) => handleInputChange("respirationRate", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input id="weight" type="number" placeholder="70" value={formData.weight} onChange={(e) => handleInputChange("weight", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input id="height" type="number" placeholder="170" value={formData.height} onChange={(e) => handleInputChange("height", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature (°C)</Label>
                  <Input id="temperature" type="number" step="0.1" placeholder="37.0" value={formData.temperature} onChange={(e) => handleInputChange("temperature", e.target.value)} />
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
                  <Select value={formData.mood} onValueChange={(value) => handleInputChange("mood", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your mood" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                      <SelectItem value="very-poor">Very Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diet">Diet (optional)</Label>
                  <Input id="diet" placeholder="e.g., low sugar, vegetarian" value={formData.diet} onChange={(e) => handleInputChange("diet", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activity">Activity (optional)</Label>
                  <Input id="activity" placeholder="e.g., walked 2km" value={formData.activity} onChange={(e) => handleInputChange("activity", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Symptoms & Meds & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Symptoms & Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="symptoms">Current Symptoms</Label>
                <Textarea id="symptoms" placeholder="Describe any symptoms you're experiencing today..." value={formData.symptoms} onChange={(e) => handleInputChange("symptoms", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="medications">Medications Taken</Label>
                <Textarea id="medications" placeholder="List medications taken today..." value={formData.medications} onChange={(e) => handleInputChange("medications", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea id="notes" placeholder="Any other health-related observations..." value={formData.notes} onChange={(e) => handleInputChange("notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Health Data"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddData;
