import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heart, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("male");
  const [userType, setUserType] = useState("patient");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || (authMode === "signup" && (!fullName || !age || !sex))) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (authMode === "login") {
      // Login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome",
          description: `Logged in successfully as ${userType}`,
          variant: "default",
        });

        localStorage.setItem("user", JSON.stringify({
          email: data.user?.email,
          userType,
        }));

        navigate("/dashboard");
      }
    } else {
      // Signup
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        toast({
          title: "Signup Failed",
          description: signUpError.message,
          variant: "destructive",
        });
      } else {
        // Insert into profiles table
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            {
              id: signUpData.user?.id,
              full_name: fullName,
              age: parseInt(age),
              sex: sex,
            }
          ]);

        if (profileError) {
          toast({
            title: "Profile Setup Failed",
            description: profileError.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Signup Successful",
            description: "You can now log in with your credentials.",
            variant: "default",
          });

          setEmail("");
          setPassword("");
          setFullName("");
          setAge("");
          setSex("male");
          setAuthMode("login");
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Heart className="h-8 w-8 text-primary mr-2" />
            <h1 className="text-3xl font-bold text-foreground">EarlyDiseaseAI</h1>
          </div>
          <p className="text-muted-foreground">AI-Powered Health Monitoring for Elderly Care</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{authMode === "login" ? "Welcome Back" : "Create Account"}</CardTitle>
            <CardDescription>
              {authMode === "login" ? "Sign in to your account to continue monitoring your health" : "Fill in the details to create your account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center mb-4">
              <Button
                variant={authMode === "login" ? "default" : "outline"}
                onClick={() => setAuthMode("login")}
                className="mr-2"
              >
                Login
              </Button>
              <Button
                variant={authMode === "signup" ? "default" : "outline"}
                onClick={() => setAuthMode("signup")}
              >
                Signup
              </Button>
            </div>

            <Tabs value={userType} onValueChange={setUserType}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="patient" className="flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Patient
                </TabsTrigger>
                <TabsTrigger value="caregiver" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Caregiver
                </TabsTrigger>
              </TabsList>

              <TabsContent value="patient" className="mt-2">
                <form onSubmit={handleAuth} className="space-y-4">
                  {authMode === "signup" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Full Name</Label>
                        <Input
                          id="full_name"
                          type="text"
                          placeholder="Enter your full name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="age">Age</Label>
                        <Input
                          id="age"
                          type="number"
                          placeholder="Enter your age"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sex">Sex</Label>
                        <select
                          id="sex"
                          value={sex}
                          onChange={(e) => setSex(e.target.value)}
                          className="w-full p-2 border rounded"
                          required
                        >
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {authMode === "login" ? "Sign In as Patient" : "Sign Up as Patient"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="caregiver" className="mt-2">
                <form onSubmit={handleAuth} className="space-y-4">
                  {authMode === "signup" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="full_name_caregiver">Full Name</Label>
                        <Input
                          id="full_name_caregiver"
                          type="text"
                          placeholder="Enter your full name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="age_caregiver">Age</Label>
                        <Input
                          id="age_caregiver"
                          type="number"
                          placeholder="Enter your age"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sex_caregiver">Sex</Label>
                        <select
                          id="sex_caregiver"
                          value={sex}
                          onChange={(e) => setSex(e.target.value)}
                          className="w-full p-2 border rounded"
                          required
                        >
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="caregiver-email">Email</Label>
                    <Input
                      id="caregiver-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="caregiver-password">Password</Label>
                    <Input
                      id="caregiver-password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {authMode === "login" ? "Sign In as Caregiver" : "Sign Up as Caregiver"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Demo credentials: any email/password combination
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
