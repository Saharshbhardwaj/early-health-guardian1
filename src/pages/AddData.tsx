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

type FormState = {
  heartRate: string;
  systolicBP: string;
  diastolicBP: string;
  bloodSugar: string;
  weight: string;
  temperature: string;
  sleepHours: string;
  exerciseMinutes: string;
  mood: string;
  symptoms: string;
  medications: string;
  notes: string;
};

const AddData: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormState>({
    heartRate: "",
    systolicBP: "",
    diastolicBP: "",
    bloodSugar: "",
    weight: "",
    temperature: "",
    sleepHours: "",
    exerciseMinutes: "",
    mood: "",
    symptoms: "",
    medications: "",
    notes: ""
  });

  const [saving, setSaving] = useState(false);

  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Get currently authenticated user
      const { data: userResp, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userResp?.user?.id;
      if (!userId) throw new Error("Not logged in. Please sign in to add data.");

      // Build row for health_data
      const row = {
        user_id: userId,
        heart_rate: formData.heartRate ? Number(formData.heartRate) : null,
        systolic_bp: formData.systolicBP ? Number(formData.systolicBP) : null,
        diastolic_bp: formData.diastolicBP ? Number(formData.diastolicBP) : null,
        blood_sugar: formData.bloodSugar ? Number(formData.bloodSugar) : null,
        weight: formData.weight ? Number(formData.weight) : null,
        temperature: formData.temperature ? Number(formData.temperature) : null,
        sleep_hours: formData.sleepHours ? Number(formData.sleepHours) : null,
        exercise_minutes: formData.exerciseMinutes ? Number(formData.exerciseMinutes) : null,
        mood: formData.mood || null,
        symptoms: formData.symptoms || null,
        medications: formData.medications || null,
        notes: formData.notes || null,
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      // Insert into health_data
      const { data: insertData, error: insertError } = await supabase
        .from("health_data")
        .insert([row])
        .select()
        .single();

      if (insertError) throw insertError;

      toast({
        title: "Health Data Saved",
        description: "Your health information has been recorded successfully.",
        variant: "default"
      });

      // --- Agentic actions start ---

      // Compute risk snapshot
      const risks = agentLib.computeRisks(row);

      // Format insight text
      const insightTitle = "Health reading recorded";
      const insightBody = agentLib.formatInsightText(insightTitle, risks, row);

      // Persist insight to health_insights
      try {
        await agentLib.createInsightForUser(userId, insightTitle, insightBody, { risks, vitals: row }, "client");
      } catch (insErr) {
        console.warn("createInsightForUser failed:", insErr);
      }

      // Create an in-app notification for the patient
      try {
        await supabase.from("notifications").insert([{
          user_id: userId,
          title: "Health alert: new reading",
          body: insightBody,
          level: "info",
          channel: "in-app",
          data: { risks, readingId: insertData?.id ?? null }
        }]);
      } catch (notifErr) {
        console.warn("Failed to insert patient notification:", notifErr);
      }

      // If urgent thresholds met, escalate (in-app + external via /api/notify) to patient + caregivers
      const urgent = agentLib.shouldAlert(risks);
      if (urgent) {
        // mark patient notification as urgent
        try {
          await supabase.from("notifications").insert([{
            user_id: userId,
            title: "Urgent: abnormal health reading",
            body: insightBody,
            level: "urgent",
            channel: "in-app",
            data: { risks, readingId: insertData?.id ?? null }
          }]);
        } catch (err) {
          console.warn("Failed to insert urgent notification for patient:", err);
        }

        // Attempt to fetch patient's email (profile table) - optional, may not exist
        let patientEmail: string | null = null;
        try {
          const { data: profile, error: profileErr } = await supabase.from("profiles").select("email").eq("id", userId).single();
          if (!profileErr && profile?.email) patientEmail = profile.email;
        } catch (e) {
          // ignore; fallback to auth user email below
        }
        if (!patientEmail) {
          try {
            const { data: authUserResp } = await supabase.auth.getUser();
            patientEmail = authUserResp?.user?.email ?? null;
          } catch (e) { /* ignore */ }
        }

        // Notify patient externally if email exists
        if (patientEmail) {
          try {
            await fetch("/api/notify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: patientEmail,
                channel: "email",
                title: "Urgent: abnormal health reading recorded",
                body: `An urgent health reading was recorded:\n\n${insightBody}\n\nIf you feel unwell, seek medical attention.`,
                meta: { userId, readingId: insertData?.id ?? null }
              })
            });
          } catch (err) {
            console.warn("External notify (patient) failed:", err);
          }
        }

        // Find caregivers for this user and notify them
        try {
          const { data: carers, error: carersErr } = await supabase.from("caregivers").select("*").eq("user_id", userId);
          if (!carersErr && Array.isArray(carers) && carers.length > 0) {
            for (const c of carers) {
              // in-app notification for caregiver (if caregiver_user_id present, use that)
              try {
                await supabase.from("notifications").insert([{
                  user_id: c.caregiver_user_id ?? null,
                  related_user_id: userId,
                  title: `Patient alert: ${c.name ?? "Your patient"}`,
                  body: insightBody,
                  level: "urgent",
                  channel: "in-app",
                  data: { patientId: userId, readingId: insertData?.id ?? null }
                }]);
              } catch (err) {
                console.warn("Failed to insert caregiver in-app notification:", err);
              }

              // external delivery: email then sms fallback
              if (c.email) {
                try {
                  await fetch("/api/notify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      to: c.email,
                      channel: "email",
                      title: `Urgent: patient ${c.name ?? ""} reading`,
                      body: `An urgent reading was recorded for your patient:\n\n${insightBody}\n\nPlease check the Early Health Guardian dashboard for details.`,
                      meta: { patientId: userId, caregiverId: c.id }
                    })
                  });
                } catch (err) {
                  console.warn("notify caregiver email failed:", err);
                }
              }
              if (c.phone) {
                try {
                  await fetch("/api/notify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      to: c.phone,
                      channel: "sms",
                      title: `Urgent: patient reading`,
                      body: insightBody,
                      meta: { patientId: userId, caregiverId: c.id }
                    })
                  });
                } catch (err) {
                  console.warn("notify caregiver sms failed:", err);
                }
              }
            }
          }
        } catch (err) {
          console.warn("Fetching caregivers failed:", err);
        }
      } // end urgent

      // Schedule follow-up reminder for moderate risk
      try {
        const moderate = (risks.diabetes ?? 0) >= 50 || (risks.hypertension ?? 0) >= 50 || (risks.heartDisease ?? 0) >= 50;
        if (moderate) {
          const scheduledAt = new Date();
          scheduledAt.setDate(scheduledAt.getDate() + 3);
          await supabase.from("reminders").insert([{
            user_id: userId,
            title: "Follow-up: re-check health readings",
            body: "Please re-enter your vitals so we can track trends.",
            scheduled_at: scheduledAt.toISOString(),
            metadata: { triggeredByReading: insertData?.id ?? null }
          }]);
        }
      } catch (err) {
        console.warn("Scheduling reminder failed:", err);
      }

      // --- Agentic actions end ---

      navigate("/dashboard");
    } catch (err: any) {
      console.error("save error", err);
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
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input id="weight" type="number" placeholder="70" value={formData.weight} onChange={(e) => handleInputChange("weight", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature (°F)</Label>
                  <Input id="temperature" type="number" step="0.1" placeholder="98.6" value={formData.temperature} onChange={(e) => handleInputChange("temperature", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lifestyle */}
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
