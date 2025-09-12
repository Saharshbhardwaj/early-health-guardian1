// src/pages/SignUp.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    age: "",
    sex: "male",
    email: "",
    password: "",
    caregiverName: "",
    caregiverEmail: "",
    caregiverPhone: ""
  });

  const onChange = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!form.caregiverName || !form.caregiverEmail) {
      toast({ title: "Missing caregiver", description: "Please provide caregiver name and email.", variant: "destructive" });
      setLoading(false);
      return;
    }

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.name,
            age: form.age ? Number(form.age) : null,
            sex: form.sex
          }
        }
      });

      if (signUpError) throw signUpError;

      const userId = signUpData?.user?.id ?? null;

      if (!userId) {
        toast({ title: "Signup started", description: "Please confirm your email to complete signup.", variant: "default" });
        setLoading(false);
        navigate("/");
        return;
      }

      const profilePayload = {
        id: userId,
        full_name: form.name,
        age: form.age ? Number(form.age) : null,
        sex: form.sex,
        email: form.email,
        created_at: new Date().toISOString()
      };
      await supabase.from("profiles").upsert([profilePayload], { onConflict: "id" });

      const caregiverPayload = {
        user_id: userId,
        name: form.caregiverName,
        email: form.caregiverEmail,
        phone: form.caregiverPhone || null,
        created_at: new Date().toISOString()
      };
      await supabase.from("caregivers").insert([caregiverPayload]);

      // Sign-in to create session and store local user
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password
      });

      if (signInError) {
        toast({ title: "Account created", description: "Please confirm your email to sign in.", variant: "default" });
        setLoading(false);
        navigate("/");
        return;
      }

      const loggedUser = signInData?.user ?? signUpData?.user;
      const localUser = {
        userId: loggedUser?.id,
        email: loggedUser?.email,
        name: form.name || loggedUser?.user_metadata?.full_name || loggedUser?.email,
        userType: "patient"
      };
      localStorage.setItem("user", JSON.stringify(localUser));
      toast({ title: "Welcome", description: `Signed up as ${localUser.name}`, variant: "default" });
      setLoading(false);
      navigate("/dashboard");
    } catch (err: any) {
      console.error("signup failed", err);
      toast({ title: "Signup failed", description: err?.message ?? "Could not create account", variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader><CardTitle>Create your account</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={form.name} onChange={(e) => onChange("name", e.target.value)} required />
                </div>

                <div>
                  <Label htmlFor="age">Age</Label>
                  <Input id="age" type="number" value={form.age} onChange={(e) => onChange("age", e.target.value)} />
                </div>

                <div>
                  <Label htmlFor="sex">Sex</Label>
                  <select value={form.sex} onChange={(e) => onChange("sex", e.target.value)} className="w-full border rounded px-2 py-1">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => onChange("email", e.target.value)} required />
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => onChange("password", e.target.value)} required />
                </div>
              </div>

              <hr />

              <div>
                <h3 className="text-lg font-semibold mb-2">Caregiver / Guardian (required)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="caregiverName">Caregiver name</Label>
                    <Input id="caregiverName" value={form.caregiverName} onChange={(e) => onChange("caregiverName", e.target.value)} required />
                  </div>

                  <div>
                    <Label htmlFor="caregiverEmail">Caregiver email</Label>
                    <Input id="caregiverEmail" type="email" value={form.caregiverEmail} onChange={(e) => onChange("caregiverEmail", e.target.value)} required />
                  </div>

                  <div>
                    <Label htmlFor="caregiverPhone">Caregiver phone</Label>
                    <Input id="caregiverPhone" value={form.caregiverPhone} onChange={(e) => onChange("caregiverPhone", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create account"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SignUp;
