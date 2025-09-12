// src/pages/ConfirmEmail.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const ConfirmEmail: React.FC = () => {
  const q = useQuery();
  const token = q.get("token");
  const [status, setStatus] = useState<"idle"|"pending"|"success"|"error">("idle");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No confirmation token provided.");
      return;
    }

    const run = async () => {
      setStatus("pending");
      try {
        const res = await fetch("/api/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || JSON.stringify(json));
        setStatus("success");
        setMessage("Email confirmed. Thank you — you may now sign in.");
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message ?? "Confirmation failed.");
      }
    };

    run();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader>
            <CardTitle>Email Confirmation</CardTitle>
          </CardHeader>
          <CardContent>
            {status === "pending" && <p>Confirming your email — please wait...</p>}
            {status === "success" && (
              <>
                <p className="mb-4">{message}</p>
                <div className="flex justify-center">
                  <Button onClick={() => navigate("/")}>Go to Login</Button>
                </div>
              </>
            )}
            {status === "error" && (
              <>
                <p className="text-destructive mb-4">{message}</p>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => navigate("/")}>Return</Button>
                  <Button onClick={() => window.location.reload()}>Try again</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConfirmEmail;
