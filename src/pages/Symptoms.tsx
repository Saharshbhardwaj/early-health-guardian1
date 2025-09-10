import { useState } from "react";
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

const Symptoms = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState<{ [key: string]: string }>({});
  const [additionalNotes, setAdditionalNotes] = useState("");

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

  const handleSymptomChange = (symptomId: string, checked: boolean) => {
    if (checked) {
      setSelectedSymptoms(prev => Array.from(new Set([...prev, symptomId])));
    } else {
      setSelectedSymptoms(prev => prev.filter(id => id !== symptomId));
      setSeverity(prev => {
        const clone = { ...prev };
        delete clone[symptomId];
        return clone;
      });
    }
  };

  const handleSeverityChange = (symptomId: string, value: string) => {
    setSeverity(prev => ({ ...prev, [symptomId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build payload
    const symptomsPayload = selectedSymptoms.map(id => ({
      id,
      label: symptomsList.find(s => s.id === id)?.label ?? id,
      severity: severity[id] || "mild"
    }));

    if (symptomsPayload.length === 0 && !additionalNotes) {
      toast({
        title: "Nothing to save",
        description: "Please select at least one symptom or add notes.",
        variant: "destructive"
      });
      return;
    }

    // Get user id from supabase session, fallback to localStorage
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) console.warn("Session error:", sessionError);

      const sessionUserId = sessionData?.session?.user?.id;
      const local = localStorage.getItem("user");
      const localUser = local ? JSON.parse(local) : null;
      const userId = sessionUserId || localUser?.id;

      if (!userId) {
        toast({
          title: "Not authenticated",
          description: "Please log in and try again.",
          variant: "destructive"
        });
        navigate("/");
        return;
      }

      const payload = {
        user_id: userId,
        symptoms: symptomsPayload,     // stored as JSON/JSONB
        additional_notes: additionalNotes || null,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString()
      };

      const { data, error } = await supabase.from("symptoms").insert([payload]);

      if (error) {
        console.error("Supabase insert error (symptoms):", error);
        toast({
          title: "Save failed",
          description: error.message,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Symptoms Recorded",
        description: "Your symptoms have been logged successfully.",
        variant: "default"
      });

      navigate("/dashboard");
    } catch (err: any) {
      console.error("Unexpected error saving symptoms:", err);
      toast({
        title: "Error",
        description: "Unexpected error saving symptoms.",
        variant: "destructive"
      });
    }
  };

  const groupedSymptoms = symptomsList.reduce((acc, symptom) => {
    if (!acc[symptom.category]) acc[symptom.category] = [];
    acc[symptom.category].push(symptom);
    return acc;
  }, {} as { [key: string]: typeof symptomsList });

  const categoryLabels: { [k: string]: string } = {
    cardiac: "Heart & Circulation",
    respiratory: "Breathing",
    neurological: "Brain & Nervous System",
    gastrointestinal: "Digestive",
    metabolic: "Metabolism",
    visual: "Vision",
    musculoskeletal: "Muscles & Joints",
    general: "General Symptoms"
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
                If you're experiencing severe chest pain, difficulty breathing, or other emergency symptoms,
                please call <strong>112</strong> immediately instead of logging symptoms here.
              </p>
            </CardContent>
          </Card>

          {/* Symptoms by Category */}
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
                          onCheckedChange={(checked) => handleSymptomChange(symptom.id, Boolean(checked))}
                        />
                        <Label htmlFor={symptom.id} className="text-sm">
                          {symptom.label}
                        </Label>
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

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes or Details</Label>
                <Textarea id="notes" placeholder="Describe any additional symptoms..." value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
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
};

export default Symptoms;
