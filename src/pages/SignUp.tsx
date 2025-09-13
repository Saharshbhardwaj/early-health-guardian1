// src/pages/Signup.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient"; // adjust if your path differs
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const Signup: React.FC = () => {
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [sex, setSex] = useState<"male" | "female" | "other" | "">("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // caregiver details (optional)
  const [caregiverName, setCaregiverName] = useState("");
  const [caregiverEmail, setCaregiverEmail] = useState("");
  const [caregiverPhone, setCaregiverPhone] = useState("");

  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({ title: "Please enter email and password", variant: "destructive" });
      return;
    }

    try {
      // 1) create auth user (this triggers confirmation email if enabled)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        console.error("Sign up error:", signUpError);
        toast({ title: "Signup failed", description: signUpError.message, variant: "destructive" });
        return;
      }

      // Attempt to get a final user object (some Supabase flows require email confirmation)
      // We'll call getUser() to fetch the current user object if available
      const { data: currentUserData } = await supabase.auth.getUser();
      const user = currentUserData?.user ?? (signUpData?.user ?? null);
      const userId = user?.id ?? null;

      if (!userId) {
        // If auth requires email confirmation, inform user to confirm and finish later.
        toast({
          title: "Signup created",
          description: "Please check your email to confirm your account before continuing.",
          variant: "default",
        });
        // We cannot insert profile/caregiver until the user is confirmed and has a session in many setups.
        navigate("/login");
        return;
      }

      // 2) Insert into profiles (patient info)
      // Use only columns that exist in your profiles table: id, full_name, age, sex, created_at
      const profilePayload = {
        id: userId,
        full_name: fullName || null,
        age: age === "" ? null : Number(age),
        sex: sex || null,
        created_at: new Date().toISOString(),
      };

      const { data: profileInsert, error: profileError } = await supabase
        .from("profiles")
        .insert([profilePayload])
        .select()
        .single();

      if (profileError) {
        console.error("Error inserting profile:", profileError);
        toast({ title: "Profile setup failed", description: profileError.message, variant: "destructive" });
        // continue — caregiver insert should be attempted even if profile insert fails (depending on policy)
      }

      // 3) Insert caregiver row (if caregiver info provided)
      // Use patient_id to link to the patient (your schema has patient_id)
      if (caregiverName || caregiverEmail || caregiverPhone) {
        const caregiverPayload: any = {
          // if your caregivers table expects both user_id and patient_id, we set patient_id explicitly.
          // leave caregiver_user_id as null unless caregiver has its own auth account.
          patient_id: userId,
          name: caregiverName || null,
          email: caregiverEmail || null,
          phone: caregiverPhone || null,
          caregiver_user_id: null,
          created_at: new Date().toISOString(),
        };

        const { data: caregiverInsert, error: caregiverError } = await supabase
          .from("caregivers")
          .insert([caregiverPayload])
          .select()
          .single();

        if (caregiverError) {
          console.error("Error inserting caregiver:", caregiverError);
          toast({ title: "Caregiver save failed", description: caregiverError.message, variant: "destructive" });
        } else {
          toast({ title: "Caregiver saved", variant: "default" });
        }
      }

      toast({ title: "Signup successful", description: "Account created. Please confirm email if required.", variant: "default" });
      navigate("/login");
    } catch (err: any) {
      console.error("Unexpected error during signup:", err);
      toast({ title: "Signup error", description: String(err), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Create an account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="grid gap-4">
              <div>
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Age</Label>
                  <Input type="number" value={age as any} onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div>
                  <Label>Sex</Label>
                  <select value={sex} onChange={(e) => setSex(e.target.value as any)} className="w-full border px-2 py-1 rounded">
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div />
              </div>

              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <div className="mt-4 border-t pt-4">
                <h3 className="font-semibold">Caregiver / Guardian (optional)</h3>
                <div>
                  <Label>Caregiver name</Label>
                  <Input value={caregiverName} onChange={(e) => setCaregiverName(e.target.value)} />
                </div>
                <div>
                  <Label>Caregiver email</Label>
                  <Input value={caregiverEmail} onChange={(e) => setCaregiverEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Caregiver phone</Label>
                  <Input value={caregiverPhone} onChange={(e) => setCaregiverPhone(e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit">Sign up</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
