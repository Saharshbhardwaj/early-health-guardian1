import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash, Plus, Check } from "lucide-react";

/**
 * Types - adjust if your DB schema differs
 *
 * Expected reminders table columns:
 * - id: uuid
 * - user_id: uuid
 * - title: text
 * - description: text (nullable)
 * - notify_at: timestamp (nullable) -> stored as ISO string
 * - repeat: text (nullable) - e.g. "daily" / "weekly" / "none"
 * - repeat_interval: integer (nullable) - number of days/hours depending on repeat
 * - sent: boolean (nullable)
 * - created_at: timestamp
 */
type ReminderRow = {
  id: string;
  user_id?: string | null;
  title: string;
  description?: string | null;
  notify_at?: string | null; // ISO string from DB
  repeat?: string | null;
  repeat_interval?: number | null;
  sent?: boolean | null;
  created_at?: string | null;
};

const defaultNewReminder = {
  title: "",
  description: "",
  notify_at: "",
  repeat: "none",
  repeat_interval: 1,
};

const Reminders: React.FC = () => {
  const { toast } = useToast();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(false);

  // form state
  const [title, setTitle] = useState(defaultNewReminder.title);
  const [description, setDescription] = useState(defaultNewReminder.description);
  const [notifyAt, setNotifyAt] = useState(defaultNewReminder.notify_at); // datetime-local value
  const [repeat, setRepeat] = useState<string>(defaultNewReminder.repeat);
  const [repeatInterval, setRepeatInterval] = useState<number>(defaultNewReminder.repeat_interval);

  // load on mount
  useEffect(() => {
    fetchReminders();
    // optionally you can subscribe to real-time changes here
  }, []);

  async function fetchReminders() {
    setLoading(true);
    try {
      // Remove generic <ReminderRow>
      const { data, error } = await supabase
        .from("reminders")
        .select("id,title,description,notify_at,repeat,repeat_interval,sent,created_at")
        .order("notify_at", { ascending: true });

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
      console.error("fetch reminders exception", err);
      toast({
        title: "Failed to load reminders",
        description: String(err?.message ?? err),
        variant: "destructive",
      });
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }


  function formatNotifyAt(iso?: string | null) {
    if (!iso) return "No time set";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  // convert datetime-local value ("YYYY-MM-DDTHH:mm") to ISO string
  function dateTimeLocalToISO(value: string) {
    if (!value) return null;
    // treat as local time -> toISOString will convert to UTC
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  async function handleAddReminder(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a title", variant: "default" });
      return;
    }

    const payload = {
      title: title.trim(),
      description: description?.trim() || null,
      notify_at: dateTimeLocalToISO(notifyAt) as string | null,
      repeat: repeat === "none" ? null : repeat,
      repeat_interval: repeatInterval || null,
      sent: false,
    };

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reminders")
        .insert([payload])
        .select("id,title,description,notify_at,repeat,repeat_interval,sent,created_at");

      if (error) {
        console.error("insert reminder error", error);
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
      } else if (Array.isArray(data) && data.length > 0) {
        toast({ title: "Reminder saved", description: "Your reminder was added." });
        // prepend or re-fetch
        fetchReminders();
        // reset form
        setTitle("");
        setDescription("");
        setNotifyAt("");
        setRepeat("none");
        setRepeatInterval(1);
      } else {
        // unexpected
        fetchReminders();
      }
    } catch (err: any) {
      console.error("save reminder exception", err);
      toast({ title: "Save failed", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this reminder?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("reminders").delete().eq("id", id);
      if (error) {
        console.error("delete reminder error", error);
        toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Deleted", description: "Reminder removed." });
        setReminders((r) => r.filter((x) => x.id !== id));
      }
    } catch (err: any) {
      console.error("delete reminder exception", err);
      toast({ title: "Delete failed", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleSent(rem: ReminderRow) {
    // flip sent boolean
    const newSent = !rem.sent;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reminders")
        .update({ sent: newSent })
        .eq("id", rem.id)
        .select("id,sent");

      if (error) {
        console.error("toggle sent error", error);
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
      } else {
        setReminders((r) => r.map((x) => (x.id === rem.id ? { ...x, sent: newSent } : x)));
      }
    } catch (err: any) {
      console.error("toggle sent exception", err);
      toast({ title: "Update failed", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <p className="text-sm text-muted-foreground">Add medicine, appointment or general reminders.</p>
      </header>

      <form onSubmit={handleAddReminder} className="space-y-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Add Reminder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Take aspirin" />
              </div>

              <div>
                <Label htmlFor="description">Description / Notes</Label>
                <Textarea id="description" value={description || ""} onChange={(e) => setDescription(e.target.value)} placeholder="Take after food..." />
              </div>

              <div>
                <Label htmlFor="notify_at">Date & Time</Label>
                {/* datetime-local input gives local time string like "2025-09-14T13:30" */}
                <Input id="notify_at" type="datetime-local" value={notifyAt || ""} onChange={(e) => setNotifyAt(e.target.value)} />
              </div>

              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <Label htmlFor="repeat">Repeat</Label>
                  <select id="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)} className="w-full border rounded px-2 py-1">
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="w-36">
                  <Label htmlFor="interval">Interval</Label>
                  <Input id="interval" type="number" min={1} value={repeatInterval || 1} onChange={(e) => setRepeatInterval(Number(e.target.value))} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setTitle(""); setDescription(""); setNotifyAt(""); setRepeat("none"); setRepeatInterval(1); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  <Plus className="mr-2 h-4 w-4" /> Add reminder
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>

      <div>
        <h2 className="text-xl font-semibold mb-3">Upcoming reminders</h2>
        {loading && <div className="mb-4 text-sm text-muted-foreground">Loading…</div>}

        {reminders.length === 0 && !loading && <div className="text-sm text-muted-foreground">No reminders yet.</div>}

        <div className="space-y-3">
          {reminders.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-lg font-medium">{r.title}</h3>
                    <span className="text-sm text-muted-foreground">{formatNotifyAt(r.notify_at)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {r.description ? r.description : <em>No details</em>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Repeat: {r.repeat ?? "none"}{r.repeat !== "none" && r.repeat_interval ? ` • every ${r.repeat_interval}` : ""}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant={r.sent ? "outline" : "secondary"} onClick={() => toggleSent(r)}>
                      <Check className="mr-2 h-3 w-3" />
                      {r.sent ? "Marked sent" : "Mark as sent"}
                    </Button>

                    <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)}>
                      <Trash className="mr-2 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created: {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reminders;
