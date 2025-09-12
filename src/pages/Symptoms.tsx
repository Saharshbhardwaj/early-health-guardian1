// src/pages/Symptoms.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heart, ArrowLeft, Save, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import agentLib from "@/lib/agent";

type SymptomDef = { id: string; label: string; category: string };

const Symptoms: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState<{ [k: string]: string }>({});
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const symptomsList: SymptomDef[] = [
    { id: "chest-pain", label: "Chest Pain or Discomfort", category: "cardiac" },
    { id: "shortness-breath", label: "Shortness of Breath", category: "respiratory" },
    { id: "fatigue", label: "Unusual Fatigue", category: "general" },
    { id: "dizziness", label: "Dizziness or Lightheadedness", category: "neurological" },
    { id: "nausea", label: "Nausea or Vomiting", category: "gastrointestinal" },
    { id: "confusion", label: "Confusion or Memory Issues", category: "neurological" },
    { id: "frequent-urination", label: "Frequent Urination", category: "metabolic" },
    { id: "excessive-thirst", label: "Excessive Thirst", category: "metabolic" },
    { id: "blurred-vision", label: "Blurred Vision", category: "visual" },
    { id: "numbness", label: "Numbness or Tingling", category: "neurological" },
    { id: "irregular-heartbeat", label: "Irregular Heartbeat", category: "cardiac" },
    { id: "headache", label: "Persistent Headache", category: "neurological" },
    { id: "joint-pain", label: "Joint Pain or Stiffness", category: "musculoskeletal" },
    { id: "sleep-issues", label: "Sleep Problems", category: "general" }
  ];

  const groupedSymptoms = symptomsList.reduce((acc: Record<string, SymptomDef[]>, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    cardiac: "Heart & Circulation",
    respiratory: "Breathing",
    neurological: "Brain & Nervous System",
    gastrointestinal: "Digestive",
    metabolic: "Metabolism",
    visual: "Vision",
    musculoskeletal: "Muscles & Joints",
    general: "General Symptoms"
  };

  const handleSymptomChange = (symptomId: string, checked: boolean) => {
    setSelectedSymptoms(prev => checked ? [...prev, symptomId] : prev.filter(id => id !== symptomId));
    if (!checked) {
      setSeverity(prev => {
        const n = { ...prev };
        delete n[symptomId];
        return n;
      });
    }
  };

  const handleSeverityChange = (symptomId: string, value: string) => {
    setSeverity(prev => ({ ...prev, [symptomId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: userResp, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userResp?.user?.id;
      if (!userId) throw new Error("Not signed in");

      const symptomsData = selectedSymptoms.map(id => ({
        id,
        label: symptomsList.find(s => s.id === id)?.label ?? id,
        severity: severity[id] || "mild"
      }));

      const payload = {
        user_id: userId,
        symptoms: symptomsData, // JSONB
        notes: additionalNotes || null,
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10)
      };

      // insert into symptoms table (store JSONB for symptoms)
      const { data: insertRes, error: insertErr } = await supabase.from("symptoms").insert([payload]).select().single();
      if (insertErr) throw insertErr;

      toast({ title: "Symptoms Recorded", description: "Your symptoms have been logged successfully.", variant: "default" });

      // Agentic actions: compute risks (lightweight) and persist insight
      const risks = agentLib.computeRisks({ /* minimal vitals - used for heuristics if present in profile */ });
      const insightTitle = "Symptoms logged";
      const insightBody = `Symptoms: ${symptomsData.map(s => `${s.label} (${s.severity})`).join(", ")}\nNotes: ${additionalNotes || "-"}`;

      try {
        await agentLib.createInsightForUser(userId, insightTitle, insightBody, { symptoms: symptomsData, notes: additionalNotes }, "client");
      } catch (e) {
        console.warn("create insight failed", e);
      }

      // If any severe symptom present, optionally notify caregivers & patient
      const severePresent = symptomsData.some(s => s.severity === "severe");
      if (severePresent) {
        // create urgent notification and optionally call /api/notify (handled in AddData flow similarly)
        await supabase.from("notifications").insert([{
          user_id: userId,
          title: "Urgent: severe symptoms reported",
          body: insightBody,
          level: "urgent",
          channel: "in-app",
          data: { symptoms: symptomsData, source: "symptoms-form", symptomRowId: insertRes?.id ?? null }
        }]);

        // notify caregivers (external) if present
        try {
          const { data: carers } = await supabase.from("caregivers").select("*").eq("user_id", userId);
          if (Array.isArray(carers) && carers.length) {
            for (const c of carers) {
              if (c.email) {
                await fetch("/api/notify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: c.email,
                    channel: "email",
                    title: `Urgent: ${c.name ?? "Patient"} reported severe symptoms`,
                    body: `Severe symptoms recorded: ${insightBody}\n\nThis message is from Early Health Guardian. If the patient is in immediate danger, call local emergency services (India): 112.`,
                    meta: { patientId: userId, symptomId: insertRes?.id ?? null }
                  })
                });
              }
              if (c.phone) {
                // send SMS
                await fetch("/api/notify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: c.phone,
                    channel: "sms",
                    title: `Urgent: severe symptoms`,
                    body: `Severe symptoms recorded for your patient. Please check the dashboard or call local emergency services (India): 112.`,
                    meta: { patientId: userId }
                  })
                });
              }
            }
          }
        } catch (e) {
          console.warn("notify caregivers failed", e);
        }
      }

      navigate("/dashboard");
    } catch (err: any) {
      console.error("save symptoms error", err);
      toast({ title: "Save failed", description: err?.message ?? "Could not save symptoms", variant: "destructive" });
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
            <AlertCircle className="h-6 w-6 text-warning" />
            <h1 className="text-xl font-semibold">Log Symptoms</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Emergency Notice</span>
              </div>
              <p className="text-sm text-muted-foreground">
                If you're experiencing severe chest pain, difficulty breathing, or other emergency symptoms, please call <strong>112</strong> immediately instead of logging symptoms here.
              </p>
            </CardContent>
          </Card>

          {Object.entries(groupedSymptoms).map(([category, symptoms]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{categoryLabels[category] ?? category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {symptoms.map((symptom) => (
                    <div key={symptom.id} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={symptom.id}
                          checked={selectedSymptoms.includes(symptom.id)}
                          onCheckedChange={(checked) => handleSymptomChange(symptom.id, checked as boolean)}
                        />
                        <Label htmlFor={symptom.id} className="text-sm">{symptom.label}</Label>
                      </div>

                      {selectedSymptoms.includes(symptom.id) && (
                        <div className="ml-6 w-48">
                          <Select value={severity[symptom.id] || ""} onValueChange={(value) => handleSeverityChange(symptom.id, value)}>
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select severity" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mild">Mild</SelectItem>
                              <SelectItem value="moderate">Moderate</SelectItem>
                              <SelectItem value="severe">Severe</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader><CardTitle>Additional Information</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes or Details</Label>
                <Textarea id="notes" placeholder="Describe any additional symptoms or provide more details..." value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Log Symptoms"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Symptoms;
