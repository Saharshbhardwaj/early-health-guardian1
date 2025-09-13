// src/pages/Symptoms.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heart, ArrowLeft, Save, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SymptomDef = {
  id: string;
  label: string;
  category: string;
};

type SymptomEntry = {
  id: string;
  label: string;
  severity: string;
};

const SYMPTOM_DEFS: SymptomDef[] = [
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

const groupSymptoms = (defs: SymptomDef[]) =>
  defs.reduce<Record<string, SymptomDef[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

const groupedDefs = groupSymptoms(SYMPTOM_DEFS);

export default function SymptomsPage(): JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState<Record<string, string>>({});
  const [additionalNotes, setAdditionalNotes] = useState("");

  // load current user id
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        if (!uid) {
          // fallback to localStorage (if app stored user there)
          try {
            const local = JSON.parse(localStorage.getItem("user") || "null");
            if (local?.id) {
              setUserId(local.id);
              return;
            }
          } catch {
            // ignore
          }
          // not signed in — redirect
          navigate("/");
        } else {
          setUserId(uid);
        }
      } catch (err) {
        console.warn("Error fetching auth user", err);
        navigate("/");
      }
    };
    loadUser();
  }, [navigate]);

  const handleSymptomChange = (symptomId: string, checked: boolean) => {
    setSelectedSymptoms((prev) => {
      if (checked) return Array.from(new Set([...prev, symptomId]));
      return prev.filter((s) => s !== symptomId);
    });
    if (!checked) {
      setSeverity((prev) => {
        const copy = { ...prev };
        delete copy[symptomId];
        return copy;
      });
    }
  };

  const handleSeverityChange = (symptomId: string, value: string) => {
    setSeverity((prev) => ({ ...prev, [symptomId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast({ title: "Not signed in", description: "Please sign in to record symptoms.", variant: "destructive" });
      return;
    }

    const payloadSymptoms: SymptomEntry[] = selectedSymptoms.map((id) => {
      const def = SYMPTOM_DEFS.find((d) => d.id === id);
      return {
        id,
        label: def?.label ?? id,
        severity: severity[id] ?? "mild"
      };
    });

    const insertPayload = {
      user_id: userId,
      symptoms: payloadSymptoms,
      notes: additionalNotes || null,
      date: new Date().toISOString().split("T")[0],
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase.from("symptoms").insert([insertPayload]).select().single();
      if (error) {
        console.error("symptoms insert failed", error);
        toast({ title: "Error saving symptoms", description: error.message || "Could not save symptoms", variant: "destructive" });
        return;
      }

      toast({ title: "Symptoms Recorded", description: "Your symptoms were logged successfully.", variant: "default" });
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Unexpected error saving symptoms", err);
      toast({ title: "Error", description: err?.message ?? "Unexpected error", variant: "destructive" });
    }
  };

  // When rendering, make sure we type list properly so .map is recognized
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
                If you are experiencing severe chest pain, difficulty breathing, or other emergency symptoms, please contact local emergency services immediately.
              </p>
            </CardContent>
          </Card>

          {Object.entries(groupedDefs).map(([category, list]) => {
            // list has type SymptomDef[]
            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle>{category.charAt(0).toUpperCase() + category.slice(1)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {list.map((symptom) => (
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
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea id="notes" placeholder="Provide more details..." value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
              Cancel
            </Button>
            <Button type="submit">
              <Save className="h-4 w-4 mr-2" />
              Log Symptoms
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
