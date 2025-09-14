// src/lib/types.ts
export type CaregiverRow = {
  id: string;
  user_id?: string | null;
  patient_id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
};

export type ReminderRow = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  description?: string | null;
  notify_at?: string | null;        // ISO timestamp string
  repeat?: string | null;           // 'daily' | 'weekly' | 'monthly' | null
  repeat_interval?: number | null;  // number (minutes/days depending on your semantics)
  sent?: boolean | null;
  created_at?: string | null;
  recipient_email?: string | null;  // newly added column
  caregiver_id?: string | null;     // optional FK
  // when doing joined selects you may get nested objects:
  caregiver?: { email?: string | null } | null;
};