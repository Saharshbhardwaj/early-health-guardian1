// src/pages/AuthCallback.tsx
import React, { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const PENDING_PROFILE_KEY = "ehg_pending_profile_v1";
const PENDING_CAREGIVER_KEY = "ehg_pending_caregiver_v1";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    async function finishSignup() {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("getUser error", error);
        toast({ title: "Auth error", description: error.message, variant: "destructive" });
        navigate("/login");
        return;
      }
      const user = data?.user;
      if (!user) {
        toast({ title: "Not signed in", description: "Please sign in.", variant: "destructive" });
        navigate("/login");
        return;
      }

      // read pending from localStorage and upsert
      try {
        const rawProfile = localStorage.getItem(PENDING_PROFILE_KEY);
        const rawCaregiver = localStorage.getItem(PENDING_CAREGIVER_KEY);
        if (rawProfile) {
          const payload = JSON.parse(rawProfile);
          payload.id = user.id; // ensure id matches auth user
          await supabase.from("profiles").upsert([payload], { onConflict: "id" });
          localStorage.removeItem(PENDING_PROFILE_KEY);
        }
        if (rawCaregiver) {
          const cg = JSON.parse(rawCaregiver);
          cg.patient_id = user.id;
          await supabase.from("caregivers").insert([cg]);
          localStorage.removeItem(PENDING_CAREGIVER_KEY);
        }
        toast({ title: "Welcome", description: "Your account was confirmed and profile saved." });
        navigate("/dashboard");
      } catch (e: any) {
        console.error("Error finishing signup", e);
        toast({ title: "Finish signup failed", description: String(e?.message ?? e), variant: "destructive" });
        navigate("/dashboard");
      }
    }

    finishSignup();
  }, [navigate, toast]);

  return <div>Completing sign up…</div>;
}