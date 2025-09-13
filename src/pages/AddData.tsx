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
import agentLib from "@/lib/agent"; // optional; guard before use

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
  symptoms: string; // free text (comma/newline) -> will be parsed to array
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

const parseSymptomsToArray = (input: string) => {
  if (!input) return [];
  // accept newline, semicolon or comma separated lists
  const items = input
    .split(/\r?\n|;/)
    .map((s) => s.split(","))
    .flat()
    .map((s) => s.trim())
    .filter(Boolean);
  // dedupe while preserving order
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i) ? false : seen.add(i)));
};

const AddData: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState<FormState>({ ...DEFAULT_STATE });
  const [saving, setSaving] = useState(false);

  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
  };

  const getAuthUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.warn("supabase.auth.getUser error:", error);
        return null;
      }
      return data?.user ?? null;
    } catch (e) {
      console.error("getAuthUser exception:", e);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const authUser = await getAuthUser();

      // fallback to localStorage if needed (dev)
      let userId = authUser?.id ?? null;
      let userEmail = authUser?.email ?? null;
      if (!userId) {
        try {
          const local = JSON.parse(localStorage.getItem("user") || "null");
          userId = local?.id ?? local?.userId ?? local?.uid ?? null;
          userEmail = userEmail ?? local?.email ?? null;
        } catch {}
      }

      if (!userId) {
        toast({ title: "Not signed in", description: "Please sign in before adding data", variant: "destructive" });
        setSaving(false);
        return;
      }

      // prepare row - types match your schema
      const row = {
        user_id: userId,
        heart_rate: formData.heartRate ? parseInt(formData.heartRate, 10) : null,
        systolic_bp: formData.systolicBP ? parseInt(formData.systolicBP, 10) : null,
        diastolic_bp: formData.diastolicBP ? parseInt(formData.diastolicBP, 10) : null,
        blood_sugar: formData.bloodSugar ? parseInt(formData.bloodSugar, 10) : null,
        weight: formData.weight ? Math.round(Number(formData.weight)) : null,
        height: formData.height ? Math.round(Number(formData.height)) : null,
        temperature: formData.temperature ? Number(formData.temperature) : null,
        sleep_hours: formData.sleepHours ? Number(formData.sleepHours) : null,
        exercise_minutes: formData.exerciseMinutes ? parseInt(formData.exerciseMinutes, 10) : null,
        mood: formData.mood || null,
        // symptoms stored as JSON array (jsonb)
        symptoms: parseSymptomsToArray(formData.symptoms),
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

      console.info("Inserting health_data:", row);

      // Insert row; do not set id (DB default should create it)
      const { data: insertRes, error: insertErr } = await supabase.from("health_data").insert([row]).select().single();

      if (insertErr) {
        console.error("Supabase insert error:", insertErr);
        // translate common errors
        if (insertErr.message?.includes("invalid input syntax for type uuid")) {
          throw new Error("Invalid user id — make sure you're signed in (Supabase auth user.id should be used).");
        }
        throw insertErr;
      }

      const saved = insertRes;
      console.info("Saved reading:", saved);

      // compute risks if agent available (best-effort)
      let risks: Record<string, number> = {};
      try {
        if (agentLib && typeof agentLib.computeRisks === "function") {
          risks = await Promise.resolve(agentLib.computeRisks(saved));
        }
      } catch (err) {
        console.warn("computeRisks failed:", err);
      }

      // persist insight (best-effort)
      try {
        await supabase.from("health_insights").insert([{
          user_id: userId,
          title: "Reading recorded",
          body: JSON.stringify({ reading: saved, risks }),
          insights: risks || {},
          created_at: new Date().toISOString(),
          source: "client"
        }]);
      } catch (insErr) {
        console.warn("could not insert health_insight:", insErr);
      }

      // create in-app notification
      try {
        await supabase.from("notifications").insert([{
          user_id: userId,
          title: "New health reading saved",
          body: `Saved vitals — HR: ${row.heart_rate ?? "-"}, BP: ${row.systolic_bp ?? "-"} / ${row.diastolic_bp ?? "-"}, Sugar: ${row.blood_sugar ?? "-"}`,
          level: "info",
          channel: "in-app",
          data: { readingId: saved.id, risks }
        }]);
      } catch (nErr) {
        console.warn("notification insert failed:", nErr);
      }

      // fetch caregivers & collect recipients
      let recipients: string[] = [];
      try {
        // look up caregivers linked to this user (supports patient_id or user_id columns)
        const q = await supabase.from("caregivers").select("email").or(`user_id.eq.${userId},patient_id.eq.${userId}`);
        if (!q.error && Array.isArray(q.data)) {
          recipients = q.data.map((r: any) => r.email).filter(Boolean);
        }
      } catch (e) {
        console.warn("caregiver fetch failed:", e);
      }
      // add patient email
      if (userEmail) recipients.unshift(userEmail);

      // If urgent risk, notify patient + caregivers via /api/notify (one request)
      const maxRisk = Object.keys(risks).length ? Math.max(...Object.values(risks)) : 0;
      const urgent = maxRisk >= 80;
      const moderate = maxRisk >= 50 && maxRisk < 80;

      if (urgent && recipients.length > 0) {
        try {
          const resp = await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: recipients,
              title: "Urgent Health Alert — Early Health Guardian",
              body: `Urgent reading detected.\n\nRisks:\n${JSON.stringify(risks, null, 2)}\n\nIf this is an emergency call 112 (India).`,
              meta: { userId, readingId: saved.id }
            })
          });
          const j = await resp.json();
          console.info("/api/notify response:", j);
        } catch (err) {
          console.warn("notify request failed:", err);
        }
      }

      if (moderate) {
        // schedule follow-up reminder
        try {
          const scheduledAt = new Date();
          scheduledAt.setDate(scheduledAt.getDate() + 3);
          await supabase.from("reminders").insert([{
            user_id: userId,
            title: "Follow-up: re-check health readings",
            body: "Please re-enter your vitals so we can check trends.",
            scheduled_at: scheduledAt.toISOString(),
            metadata: { readingId: saved.id }
          }]);
        } catch (rErr) {
          console.warn("reminder creation failed:", rErr);
        }
      }

      toast({ title: "Health Data Saved", description: "Your information has been recorded.", variant: "default" });
      navigate("/dashboard");
    } catch (err: any) {
      console.error("AddData error:", err);
      toast({ title: "Save failed", description: err?.message || "Could not save health data", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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

      <main className="container mx-auto px-4 py-6 max-w-4xl">
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
                  <Label htmlFor="oxygenSaturation">Oxygen Saturation (%)</Label>
                  <Input id="oxygenSaturation" type="number" step="0.1" placeholder="98" value={formData.oxygenSaturation} onChange={(e) => handleInputChange("oxygenSaturation", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="respirationRate">Respiration Rate</Label>
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

          {/* Lifestyle & Symptoms & Notes */}
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
                      <SelectItem value="very-poor">Very Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diet">Diet</Label>
                  <Input id="diet" value={formData.diet} onChange={(e) => handleInputChange("diet", e.target.value)} placeholder="e.g., low sugar" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activity">Activity</Label>
                  <Input id="activity" value={formData.activity} onChange={(e) => handleInputChange("activity", e.target.value)} placeholder="e.g., walked 2km" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Symptoms & Additional Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="symptoms">Symptoms (comma/line separated)</Label>
                <Textarea id="symptoms" rows={4} placeholder="e.g., chest pain; shortness of breath" value={formData.symptoms} onChange={(e) => handleInputChange("symptoms", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="medications">Medications Taken</Label>
                <Textarea id="medications" rows={2} placeholder="List medications" value={formData.medications} onChange={(e) => handleInputChange("medications", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" rows={3} value={formData.notes} onChange={(e) => handleInputChange("notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
            <Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Health Data"}</Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddData;
