// src/components/UpcomingReminders.tsx
// UpcomingReminders.tsx
// or import Reminder type from its definition

// Removed duplicate UpcomingRemindersProps and UpcomingReminders declaration


import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import type { ReminderRow as SupabaseReminderRow } from "@/lib/types/type";
// import { Reminder } from "@/pages/Dashboard"; // Removed: not exported and not used

type ReminderRow = {
  id: string;
  title: string;
  description?: string | null;
  notify_at?: string | null;      // stored as timestamp / timestamptz in DB
  repeat?: string | null;
  repeat_interval?: number | null;
  sent?: boolean | null;
  created_at?: string | null;
};

const UpcomingReminders: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchReminders();
    // optional: you could add a poll here if you want near-real-time updates:
    // const id = setInterval(fetchReminders, 60_000);
    // return () => clearInterval(id);
  }, []);

  async function fetchReminders() {
    setLoading(true);
    try {
      // adjust selected columns to exactly match your DB schema
      const { data, error } = await supabase
        .from("reminders")
        // only fetch upcoming or unsent reminders — adjust filter as you prefer
        .select("id,title,description,notify_at,repeat,repeat_interval,sent,created_at")
        .order("notify_at", { ascending: true })
        .limit(10);

      if (error) {
        console.error("fetch reminders error", error);
        toast({
          title: "Failed to load reminders",
          description: error.message,
          variant: "destructive",
        });
        setReminders([]);
      } else {
        setReminders(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      console.error("fetch reminders unexpected error", err);
      toast({
        title: "Failed to load reminders",
        description: err?.message || String(err),
        variant: "destructive",
      });
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }

  function formatNotifyAt(ts?: string | null) {
    if (!ts) return "No date";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts; // fallback
    // local-format; you can change options as needed
    return d.toLocaleString();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Reminders</CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading reminders…</div>
        ) : reminders.length === 0 ? (
          <div className="text-sm text-muted-foreground">No upcoming reminders. <Button variant="link" onClick={() => navigate("/reminders")}>Create one</Button></div>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => {
              const notifyAt = r.notify_at ? new Date(r.notify_at) : null;
              const now = new Date();
              const isPastDue = notifyAt ? notifyAt.getTime() <= now.getTime() && !r.sent : false;

              return (
                <div key={r.id} className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{r.title || "Untitled reminder"}</div>
                      {isPastDue && (
                        <div className="rounded-full px-2 py-0.5 text-xs bg-destructive text-white">
                          Due
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground mt-1">
                      {formatNotifyAt(r.notify_at)}
                    </div>

                    {r.description ? (
                      <div className="text-sm mt-2 text-muted-foreground">{r.description}</div>
                    ) : null}
                    
                  </div>

                  {/* small action: view or quick mark as sent (optional) */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-muted-foreground">
                      {r.sent ? "Sent" : "Not sent"}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        // quick action: mark as sent locally and in DB
                        try {
                          await supabase.from("reminders").update({ sent: true }).eq("id", r.id);
                          toast({ title: "Marked sent", description: r.title || "", variant: "default" });
                          // refresh list
                          fetchReminders();
                        } catch (e: any) {
                          toast({ title: "Failed", description: e?.message || String(e), variant: "destructive" });
                        }
                      }}
                    >
                      Mark sent
                    </Button>
                  </div>
                  
                </div>
                
              );
              
            })}
            <Button variant="link" onClick={() => navigate("/reminders")}>Create one</Button>
          </div>
          
        )}
      </CardContent>
    </Card>
  );
};

export default UpcomingReminders;
