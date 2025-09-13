// src/pages/AddData.tsx
import React, { useState, useEffect } from "react";
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

const AddData: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    heartRate: "",
    systolicBP: "",
    diastolicBP: "",
    bloodSugar: "",
    bloodSugarType: "fasting", // or random/pp
    weight: "",
    height: "", // store as cms if you collect
    temperature: "", // expected in °F
    sleepHours: "",
    exerciseMinutes: "",
    mood: "",
    symptomsText: "", // free text (stored as text in health_data.symptoms)
    medications: "",
    notes: ""
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        if (!uid) {
          // try local storage fallback (if you use it)
          try {
            const local = JSON.parse(localStorage.getItem("user") || "null");
            if (local?.id) setUserId(local.id);
            else navigate("/");
          } catch {
            navigate("/");
          }
        } else {
          setUserId(uid);
        }
      } catch (e) {
        console.warn("getUser error", e);
        navigate("/");
      }
    };
    loadUser();
  }, [navigate]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      toast({
        title: "Not signed in",
        description: "You must be signed in to save health data.",
        variant: "destructive"
      });
      return;
    }

    // Validate some required fields optionally
    // e.g. heartRate or blood pressure
    const payload: any = {
      user_id: userId,
      heart_rate: formData.heartRate ? Number(formData.heartRate) : null,
      systolic_bp: formData.systolicBP ? Number(formData.systolicBP) : null,
      diastolic_bp: formData.diastolicBP ? Number(formData.diastolicBP) : null,
      blood_sugar: formData.bloodSugar ? Number(formData.bloodSugar) : null,
      blood_sugar_type: formData.bloodSugarType || null,
      weight: formData.weight ? Number(formData.weight) : null,
      height: formData.height ? Number(formData.height) : null,
      temperature: formData.temperature ? Number(formData.temperature) : null, // °F
      sleep_hours: formData.sleepHours ? Number(formData.sleepHours) : null,
      exercise_minutes: formData.exerciseMinutes ? Number(formData.exerciseMinutes) : null,
      mood: formData.mood || null,
      symptoms: formData.symptomsText ? String(formData.symptomsText) : null, // store as free text in health_data
      medications: formData.medications ? String(formData.medications) : null,
      notes: formData.notes ? String(formData.notes) : null,
      date: new Date().toISOString().split("T")[0] // YYYY-MM-DD
    };

    // Remove keys that are null to keep insert payload small
    Object.keys(payload).forEach((k) => {
      if (payload[k] === null) delete payload[k];
    });

    try {
      // Insert into health_data
      const { data, error } = await supabase.from("health_data").insert([payload]).select().single();

      if (error) {
        console.error("AddData save error", error);
        toast({
          title: "Save failed",
          description: error.message || "Failed to save health data",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Health Data Saved",
        description: "Your health information has been saved successfully.",
        variant: "default"
      });

      // Optionally: create a health_insights row (you may have a serverless function to compute insights)
      // For now we leave that to other processes or to the agent.

      // Navigate back to dashboard
      navigate("/dashboard");
    } catch (err: any) {
      console.error("AddData unexpected error", err);
      toast({
        title: "Save failed",
        description: err?.message ?? "Unexpected error saving data",
        variant: "destructive"
      });
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
                  <Select value={formData.bloodSugarType} onValueChange={(val) => handleInputChange("bloodSugarType", val)}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fasting">Fasting</SelectItem>
                      <SelectItem value="random">Random</SelectItem>
                      <SelectItem value="pp">Post-prandial</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Select value={formData.mood} onValueChange={(val) => handleInputChange("mood", val)}>
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
                <Label htmlFor="symptomsText">Current Symptoms (free text)</Label>
                <Textarea id="symptomsText" placeholder="Describe any symptoms..." value={formData.symptomsText} onChange={(e) => handleInputChange("symptomsText", e.target.value)} />
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
            <Button type="submit">
              <Save className="h-4 w-4 mr-2" />
              Save Health Data
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddData;
