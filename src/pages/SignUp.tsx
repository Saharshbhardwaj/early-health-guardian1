// src/pages/Signup.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient"; // adjust path if needed
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

/**
 * Signup page
 *
 * Behavior:
 *  - Calls supabase.auth.signUp({ email, password }, { redirectTo })
 *  - If signUp returns a user id immediately -> upsert profile + insert caregiver
 *  - If signUp does NOT return a user id (magic link) -> save pending profile/caregiver to localStorage
 *    so your AuthCallback page can upsert after confirmation.
 *
 * IMPORTANT:
 *  - If you use magic links, set `redirectTo` to your callback route (e.g. `${origin}/auth/callback`)
 *  - Ensure RLS on `profiles` allows inserts by authenticated users or use a server trigger
 */

const PENDING_PROFILE_KEY = "ehg_pending_profile_v1";
const PENDING_CAREGIVER_KEY = "ehg_pending_caregiver_v1";

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

  function savePendingToLocalStorage(profilePayload: any, caregiverPayload?: any) {
    try {
      localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profilePayload));
      if (caregiverPayload) localStorage.setItem(PENDING_CAREGIVER_KEY, JSON.stringify(caregiverPayload));
    } catch (e) {
      console.warn("failed to save pending profile to localStorage", e);
    }
  }

  async function upsertProfile(userId: string, profilePayload: any) {
    // ensure id field equals userId
    const payload = { ...profilePayload, id: userId };
    let error, data;
    try {
      const response = await supabase
        .from("profiles")
        .upsert([payload], { onConflict: "id" })
        .select()
        .single();
      error = response.error;
      data = response.data;
    } catch (e: any) {
      error = e;
      data = null;
    }
    if (error) throw error;
    return data;
  }

  async function insertCaregiver(userId: string, caregiverPayload: any) {
    // attach patient_id to caregiver
    const payload = { ...caregiverPayload, patient_id: userId };
    let error, data;
    try {
      const response = await supabase
        .from("caregivers")
        .insert([payload])
        .select()
        .single();
      error = response.error;
      data = response.data;
    } catch (e: any) {
      error = e;
      data = null;
    }
    if (error) throw error;
    return data;
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({ title: "Please enter email and password", variant: "destructive" });
      return;
    }

    // prepare payloads
    const profilePayload = {
      full_name: fullName || null,
      age: age === "" ? null : Number(age),
      sex: sex || null,
      created_at: new Date().toISOString(),
    };

    const caregiverPayload = caregiverName || caregiverEmail || caregiverPhone ? {
      name: caregiverName || null,
      email: caregiverEmail || null,
      phone: caregiverPhone || null,
      created_at: new Date().toISOString(),
    } : null;

    try {
      // You may want to set redirectTo to your callback page if using magic links.
      // e.g. redirectTo: `${window.location.origin}/auth/callback`
      const redirectTo = `${window.location.origin}/auth/callback`;

      // 1) create auth user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
        { email, password, options: { emailRedirectTo: redirectTo } }
      );

      if (signUpError) {
        console.error("Sign up error:", signUpError);
        toast({ title: "Signup failed", description: signUpError.message, variant: "destructive" });
        return;
      }

      // signUpData may contain user on some setups (for example when email confirmation isn't required)
      // Try to get the currently-known user from auth client
      const { data: currentUserData } = await supabase.auth.getUser();
      const maybeUser = currentUserData?.user ?? signUpData?.user ?? null;
      const userId = maybeUser?.id ?? null;

      if (userId) {
        // We have an immediate user -> upsert profile and caregiver now
        try {
          await upsertProfile(userId, { ...profilePayload, id: userId });
          if (caregiverPayload) {
            await insertCaregiver(userId, caregiverPayload);
          }
          toast({ title: "Signup successful", description: "Account created and profile saved.", variant: "default" });
          navigate("/dashboard");
        } catch (dbErr: any) {
          console.error("DB error after signup (user exists):", dbErr);
          toast({ title: "Partial save", description: dbErr?.message ?? "Error saving profile/caregiver", variant: "destructive" });
          // still allow navigation to login or dashboard
          navigate("/dashboard");
        }
      } else {
        // No immediate user returned => Magic-link flow likely. Persist pending profile/caregiver to localStorage so AuthCallback can finish creation.
        savePendingToLocalStorage(profilePayload, caregiverPayload || undefined);

        toast({
          title: "Check your email",
          description: "A confirmation link has been sent. Click it to complete signup. When you return to the site your profile will be saved automatically.",
          variant: "default",
        });

        // redirect to a "check email" page or login for clarity
        navigate("/check-email");
      }
    } catch (err: any) {
      console.error("Unexpected error during signup:", err);
      toast({ title: "Signup error", description: String(err?.message ?? err), variant: "destructive" });
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
                  <Input
                    type="number"
                    value={age as any}
                    onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
                  />
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