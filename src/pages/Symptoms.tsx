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

const symptomsList = [
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

const Symptoms: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState<Record<string, string>>({});
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSymptomChange = (symptomId: string, checked: boolean) => {
    if (checked) {
      setSelectedSymptoms((prev) => [...prev, symptomId]);
    } else {
      setSelectedSymptoms((prev) => prev.filter((id) => id !== symptomId));
      setSeverity((prev) => {
        const newSeverity = { ...prev };
        delete newSeverity[symptomId];
        return newSeverity;
      });
    }
  };

  const handleSeverityChange = (symptomId: string, value: string) => {
    setSeverity((prev) => ({ ...prev, [symptomId]: value }));
  };

  const getUserId = async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.id ?? null;
    } catch {
      try {
        const local = JSON.parse(localStorage.getItem("user") || "null");
        return local?.userId ?? local?.id ?? null;
      } catch {
        return null;
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const userId = await getUserId();
      if (!userId) {
        toast({ title: "Not signed in", description: "Please log in first", variant: "destructive" });
        setSaving(false);
        return;
      }

      const symptomsData = selectedSymptoms.map((id) => ({
        id,
        label: symptomsList.find((s) => s.id === id)?.label || id,
        severity: severity[id] || "mild"
      }));

      const row = {
        user_id: userId,
        symptoms: symptomsData,
        notes: additionalNotes || null,
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const { error } = await supabase.from("symptoms").insert([row]);
      if (error) throw error;

      // create a health_insight entry
      await supabase.from("health_insights").insert([{
        user_id: userId,
        title: "Symptoms recorded",
        body: JSON.stringify(row),
        insights: {},
        created_at: new Date().toISOString(),
        source: "client"
      }]);

      // Notify patient + caregivers via email if critical
      const critical = symptomsData.some((s) => s.severity === "severe");
      if (critical) {
        // get patient email
        let patientEmail: string | null = null;
        try {
          const { data: authData } = await supabase.auth.getUser();
          patientEmail = authData?.user?.email ?? null;
        } catch {}
        if (!patientEmail) {
          try {
            const local = JSON.parse(localStorage.getItem("user") || "null");
            patientEmail = local?.email ?? null;
          } catch {}
        }

        // caregivers
        let caregivers: any[] = [];
        try {
          const caregiversQuery = await supabase
            .from("caregivers")
            .select("email")
            .or(`user_id.eq.${userId},patient_id.eq.${userId}`);
          caregivers = caregiversQuery.data || [];
        } catch {}

        const emails = new Set<string>();
        if (patientEmail) emails.add(patientEmail);
        caregivers.forEach((c) => c.email && emails.add(c.email));

        for (const to of emails) {
          await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to,
              title: "Urgent: Severe symptom detected",
              body: `Severe symptom(s) were reported: ${symptomsData
                .filter((s) => s.severity === "severe")
                .map((s) => s.label)
                .join(", ")}. Please check on the patient immediately.`
            })
          });
        }
      }

      toast({ title: "Symptoms recorded", description: "Your symptoms have been saved.", variant: "default" });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const groupedSymptoms = symptomsList.reduce((acc: Record<string, typeof symptomsList>, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

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
            <AlertCircle className="h-6 w-6 text-warning" />
            <h1 className="text-xl font-semibold">Log Symptoms</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Emergency Notice */}
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Emergency Notice</span>
              </div>
              <p className="text-sm text-muted-foreground">
                If you’re experiencing severe chest pain, difficulty breathing, or other emergency symptoms, please call 112 (India) immediately.
              </p>
            </CardContent>
          </Card>

          {Object.entries(groupedSymptoms).map(([category, symptoms]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{categoryLabels[category]}</CardTitle>
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
                        <Label htmlFor={symptom.id} className="text-sm">
                          {symptom.label}
                        </Label>
                      </div>

                      {selectedSymptoms.includes(symptom.id) && (
                        <div className="ml-6 w-48">
                          <Select value={severity[symptom.id] || ""} onValueChange={(val) => handleSeverityChange(symptom.id, val)}>
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

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea id="notes" value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
            <Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-2" />Save Symptoms</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Symptoms;
