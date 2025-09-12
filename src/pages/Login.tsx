// src/pages/Login.tsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = data?.user;
      if (!user) {
        toast({
          title: "Sign-in pending",
          description: "Please confirm your email (check inbox).",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Try to read friendly name from profiles table
      let name: string | null = user.user_metadata?.full_name ?? null;
      try {
        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (!profileErr && profileData?.full_name) name = profileData.full_name;
      } catch (err) {
        // ignore if profiles table missing
      }

      const localUser = {
        userId: user.id,
        email: user.email,
        name: name ?? user.email,
        userType: "patient"
      };
      localStorage.setItem("user", JSON.stringify(localUser));

      toast({ title: "Welcome", description: `Signed in as ${localUser.name}`, variant: "default" });
      navigate("/dashboard");
    } catch (err: any) {
      console.error("login failed", err);
      toast({ title: "Login failed", description: err?.message ?? "Invalid credentials", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Heart className="h-8 w-8 text-primary mr-2" />
            <h1 className="text-3xl font-bold text-foreground">Early Health Guardian</h1>
          </div>
          <p className="text-muted-foreground">AI-Powered Health Monitoring for Elderly Care</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>Sign in to your account to continue monitoring your health</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="mb-4 flex justify-center">
              <div className="rounded-md bg-muted px-4 py-1 text-sm font-medium">Patient</div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <span>Don't have an account? </span>
              <Link to="/signup" className="text-primary font-medium">Sign Up</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
