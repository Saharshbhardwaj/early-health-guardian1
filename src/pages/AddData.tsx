// src/pages/AddData.tsx
import React, { useEffect, useState } from "react";
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

type FormState = {
  heartRate: string;
  systolicBP: string;
  diastolicBP: string;
  bloodSugar: string;
  bloodSugarType: string;
  weight: string;
  temperature: string;
  sleepHours: string;
  exerciseMinutes: string;
  mood: string;
  symptoms: string; // free text or comma-separated; we'll stringify into JSON
  medications: string;
  notes: string;
  height: string;
  age: string;
};

const initialState: FormState = {
  heartRate: "",
  systolicBP: "",
  diastolicBP: "",
  bloodSugar: "",
  bloodSugarType: "fasting",
  weight: "",
  temperature: "",
  sleepHours: "",
  exerciseMinutes: "",
  mood: "",
  symptoms: "",
  medications: "",
  notes: "",
  height: "",
  age: ""
};

const AddData: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<any | null>(null);
  const [formData, setFormData] = useState<FormState>(initialState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const authUser = data?.user ?? null;
        if (!authUser) {
          // fallback to localStorage
          try {
            const local = JSON.parse(localStorage.getItem("user") || "null");
            if (!local) { navigate("/"); return; }
            setUser(local);
          } catch {
            navigate("/");
          }
        } else {
          setUser({ id: authUser.id, email: authUser.email, name: authUser.user_metadata?.full_name || authUser.email });
        }
      } catch (err) {
        console.warn("Error loading user", err);
        navigate("/");
      }
    };
    loadUser();
  }, [navigate]);

  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Emergency thresholds (tuneable)
  const isEmergencyReading = (payload: any) => {
    const alarms: string[] = [];
    if (payload.blood_sugar != null && payload.blood_sugar >= 180) alarms.push(`High blood sugar: ${payload.blood_sugar} mg/dL`);
    if (payload.systolic_bp != null && payload.systolic_bp >= 180) alarms.push(`Very high blood pressure: ${payload.systolic_bp} mmHg`);
    if (payload.heart_rate != null && payload.heart_rate >= 120) alarms.push(`High heart rate: ${payload.heart_rate} bpm`);
    // Add more rules if you want (e.g., temperature >= 104F)
    return alarms;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast({ title: "Not signed in", description: "Please sign in first.", variant: "destructive" });
      return;
    }

    setSaving(true);

    // Build insert payload matching your health_data schema
    const payload: any = {
      user_id: user.id,
      heart_rate: formData.heartRate ? Number(formData.heartRate) : null,
      systolic_bp: formData.systolicBP ? Number(formData.systolicBP) : null,
      diastolic_bp: formData.diastolicBP ? Number(formData.diastolicBP) : null,
      blood_sugar: formData.bloodSugar ? Number(formData.bloodSugar) : null,
      blood_sugar_type: formData.bloodSugarType || "fasting",
      weight: formData.weight ? Number(formData.weight) : null,
      height: formData.height ? Number(formData.height) : null,
      temperature: formData.temperature ? Number(formData.temperature) : null,
      sleep_hours: formData.sleepHours ? Number(formData.sleepHours) : null,
      exercise_minutes: formData.exerciseMinutes ? Number(formData.exerciseMinutes) : null,
      mood: formData.mood || null,
      medications: formData.medications || null,
      notes: formData.notes || null,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString()
    };

    // Symptoms: store as JSON text (schema has symptoms text)
    // Accept either comma-separated text or JSON array string
    let parsedSymptoms: any = null;
    try {
      // If they pasted JSON array
      const maybeJson = formData.symptoms?.trim();
      if (!maybeJson) parsedSymptoms = null;
      else if (maybeJson.startsWith("[") || maybeJson.startsWith("{")) {
        parsedSymptoms = JSON.parse(maybeJson);
      } else {
        // comma separated -> convert to array of {id,label}
        parsedSymptoms = maybeJson.split(",").map(s => ({ id: s.trim().toLowerCase().replace(/\s+/g, "-"), label: s.trim() }));
      }
      // store as string (since your table column is text)
      payload.symptoms = parsedSymptoms ? JSON.stringify(parsedSymptoms) : null;
    } catch (err) {
      // fallback: store raw text
      payload.symptoms = formData.symptoms || null;
    }

    try {
      // Insert health_data
      const { data: insertResult, error: insertError } = await supabase
        .from("health_data")
        .insert([payload])
        .select()
        .single();

      if (insertError) {
        console.error("health_data insert error", insertError);
        toast({ title: "Save failed", description: insertError.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      toast({ title: "Health Data Saved", description: "Saved successfully.", variant: "default" });

      // Check for emergency
      const alarms = isEmergencyReading(payload);

      if (alarms.length > 0) {
        // Insert a notifications row (status 'pending')
        const notifBody = `Emergency readings detected:\n\n${alarms.join("\n")}\n\nPlease check on the patient immediately.`;
        // Find caregiver(s) for this patient. We expect patient_id column exists now.
        const { data: caregivers, error: cgErr } = await supabase
          .from("caregivers")
          .select("id, name, email, caregiver_user_id")
          .eq("patient_id", user.id);

        if (cgErr) {
          console.warn("caregivers lookup error", cgErr);
        }

        const caregiverEmails = (caregivers || []).map((c: any) => c.email).filter(Boolean);
        const caregiverUserId = caregivers && caregivers[0] ? caregivers[0].caregiver_user_id : null;

        const { data: notifInsert, error: notifErr } = await supabase
          .from("notifications")
          .insert([{
            user_id: user.id,
            caregiver_user_id: caregiverUserId,
            channel: "email",
            title: "URGENT health alert",
            body: notifBody,
            meta: { checks: alarms, reading_id: insertResult?.id },
            status: "pending"
          }])
          .select()
          .single();

        if (notifErr) {
          console.warn("notifications insert error", notifErr);
        }

        // Call serverless notify endpoint
        try {
          const to = [user.email].concat(caregiverEmails || []).filter(Boolean);
          const html = `<p><strong>URGENT:</strong> Your recent reading triggered an alert:</p>
                        <ul>${alarms.map(a => `<li>${a}</li>`).join("")}</ul>
                        <p>Please contact your caregiver or healthcare provider immediately if you feel unwell.</p>`;

          const res = await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, subject: "Early Health Guardian — URGENT reading detected", html, text: alarms.join(" | ") })
          });

          const json = await res.json();

          if (!res.ok) {
            console.error("notify response error", json);
            toast({ title: "Notification failed", description: "Could not send emergency email.", variant: "destructive" });

            // update notifications status to failed (best-effort)
            if (notifInsert?.id) {
              await supabase.from("notifications").update({ status: "failed" }).eq("id", notifInsert.id);
            }
          } else {
            toast({ title: "Emergency email sent", description: "Patient and caregiver notified.", variant: "default" });
            if (notifInsert?.id) {
              await supabase.from("notifications").update({ status: "sent" }).eq("id", notifInsert.id);
            }
          }
        } catch (err) {
          console.error("notify call error", err);
          toast({ title: "Notification error", description: "Notify service call failed.", variant: "destructive" });
          if (notifInsert?.id) {
            await supabase.from("notifications").update({ status: "failed" }).eq("id", notifInsert.id);
          }
        }
      }

      // Optionally create a reminder (example) — comment out if you don't want automatic reminders
      // await supabase.from("reminders").insert([{ user_id: user.id, title: "Follow up", body: "Check health data", scheduled_at: new Date().toISOString(), repeat_interval: null }]);

      // navigate back to dashboard
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Unexpected error", err);
      toast({ title: "Error", description: String(err?.message ?? err), variant: "destructive" });
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

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vital Signs */}
          <Card>
            <CardHeader><CardTitle>Vital Signs</CardTitle></CardHeader>
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
                      <SelectItem value="postprandial">Post-prandial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (lbs)</Label>
                  <Input id="weight" type="number" placeholder="165" value={formData.weight} onChange={(e) => handleInputChange("weight", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input id="height" type="number" placeholder="170" value={formData.height} onChange={(e) => handleInputChange("height", e.target.value)} />
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
            <CardHeader><CardTitle>Lifestyle & Wellness</CardTitle></CardHeader>
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
                    <SelectTrigger><SelectValue placeholder="Select your mood" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Symptoms & Notes */}
          <Card>
            <CardHeader><CardTitle>Symptoms & Additional Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="symptoms">Symptoms (comma separated or JSON array)</Label>
                <Textarea id="symptoms" placeholder="e.g., chest pain, dizziness" value={formData.symptoms} onChange={(e) => handleInputChange("symptoms", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="medications">Medications Taken</Label>
                <Textarea id="medications" placeholder="List medications..." value={formData.medications} onChange={(e) => handleInputChange("medications", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea id="notes" placeholder="Other observations..." value={formData.notes} onChange={(e) => handleInputChange("notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Health Data"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddData;
