// src/pages/Reminders.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash, Plus, Check } from "lucide-react";
import type { ReminderRow, CaregiverRow } from "@/lib/types/type";

const defaultNewReminder = {
  title: "",
  description: "",
  notify_at: "",
  repeat: "none",
  repeat_interval: 1,
  recipient_email: "",
  caregiver_id: ""
};

const Reminders: React.FC = () => {
  const { toast } = useToast();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [caregivers, setCaregivers] = useState<CaregiverRow[]>([]);
  const [loading, setLoading] = useState(false);

  // form state
  const [title, setTitle] = useState(defaultNewReminder.title);
  const [description, setDescription] = useState<string | null>(defaultNewReminder.description);
  const [notifyAt, setNotifyAt] = useState<string>(defaultNewReminder.notify_at);
  const [repeat, setRepeat] = useState<string>(defaultNewReminder.repeat);
  const [repeatInterval, setRepeatInterval] = useState<number>(defaultNewReminder.repeat_interval);
  const [recipientEmail, setRecipientEmail] = useState<string>(defaultNewReminder.recipient_email);
  const [selectedCaregiver, setSelectedCaregiver] = useState<string | null>(null);

  useEffect(() => {
    fetchReminders();
    fetchCaregiversForUser();
  }, []);

  async function fetchReminders() {
  setLoading(true);
  try {
    const { data, error } = await supabase
      .from("reminders")
      .select("id,user_id,title,description,notify_at,repeat,repeat_interval,sent,created_at,recipient_email,caregiver_id")
      .order("notify_at", { ascending: true });

    if (error) {
      console.error("fetch reminders error", error);
      toast({ title: "Failed to load reminders", description: error.message, variant: "destructive" });
      setReminders([]);
    } else {
      setReminders(Array.isArray(data) ? data : []);
    }
  } catch (err: any) {
    console.error("fetch reminders exception", err);
    toast({ title: "Failed to load reminders", description: String(err?.message ?? err), variant: "destructive" });
    setReminders([]);
  } finally {
    setLoading(false);
  }
}

  // Fetch caregivers associated with the current user (patient)
  async function fetchCaregiversForUser() {
    try {
      // We assume API will filter caregivers where patient_id = auth.uid() or similar;
      // If you store patient user id in state, replace the filter. For now, fetch caregivers and let UI filter.
      const { data, error } = await supabase
        .from("caregivers")
        .select("id,name,email,patient_id,user_id")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("fetch caregivers error", error);
        setCaregivers([]);
      } else {
        setCaregivers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("fetch caregivers exception", err);
      setCaregivers([]);
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

  function dateTimeLocalToISO(value: string) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  async function handleAddReminder(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a title", variant: "default" });
      return;
    }

    const recip = (recipientEmail || "").trim();
    if (recip && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recip)) {
      toast({ title: "Invalid email", description: "Please enter a valid recipient email or leave blank", variant: "destructive" });
      return;
    }

    const payload: any = {
      title: title.trim(),
      description: description?.trim() || null,
      notify_at: dateTimeLocalToISO(notifyAt),
      repeat: repeat === "none" ? null : repeat,
      repeat_interval: repeatInterval || null,
      sent: false
    };

    if (recip) payload.recipient_email = recip;
    if (selectedCaregiver) payload.caregiver_id = selectedCaregiver;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reminders")
        .insert([payload])
        .select("id,title,description,notify_at,repeat,repeat_interval,sent,created_at,recipient_email,caregiver_id");

      if (error) {
        console.error("insert reminder error", error);
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Reminder saved", description: "Your reminder was added." });
        await fetchReminders();
        // reset form
        setTitle("");
        setDescription("");
        setNotifyAt("");
        setRepeat("none");
        setRepeatInterval(1);
        setRecipientEmail("");
        setSelectedCaregiver(null);
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
    const newSent = !Boolean(rem.sent);
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
                <Label htmlFor="recipient_email">Recipient email (optional)</Label>
                <Input id="recipient_email" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="caregiver@example.com" />
                <p className="text-xs text-muted-foreground">If left empty, select a caregiver below or the system will fallback to a linked caregiver.</p>
              </div>

              <div>
                <Label htmlFor="caregiver">Select caregiver (optional)</Label>
                <select id="caregiver" value={selectedCaregiver || ""} onChange={(e) => setSelectedCaregiver(e.target.value || null)} className="w-full border rounded px-2 py-1">
                  <option value="">— No selection —</option>
                  {caregivers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || c.email}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Choosing a caregiver will set that caregiver as the recipient for the reminder.</p>
              </div>

              <div>
                <Label htmlFor="notify_at">Date & Time</Label>
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
                <Button type="button" variant="ghost" onClick={() => { setTitle(""); setDescription(""); setNotifyAt(""); setRepeat("none"); setRepeatInterval(1); setRecipientEmail(""); setSelectedCaregiver(null); }}>
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
          {reminders.map((r) => {
            const emailToShow = r.recipient_email || (r.caregiver && (r.caregiver as any).email) || "—";
            return (
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
                      Recipient: {emailToShow}
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

                      <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id!)}>
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
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Reminders;