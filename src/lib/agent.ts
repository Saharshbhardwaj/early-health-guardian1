// src/lib/agent.ts
import { supabase } from "@/lib/supabaseClient";

/**
 * Types
 */
export type RisksMap = { [disease: string]: number };
export type VitalsRow = {
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  blood_sugar?: number | null;
  weight?: number | null;
  temperature?: number | null;
  sleep_hours?: number | null;
  exercise_minutes?: number | null;
  mood?: string | null;
  symptoms?: string | null;
  medications?: string | null;
  notes?: string | null;
  age?: number | null;
  [k: string]: any;
};

/**
 * computeRisks - heuristic risk estimates (UI-facing; NOT medical advice)
 *
 * Returns an object mapping disease keys -> integer percent [0..100].
 */
export function computeRisks(row: Partial<VitalsRow> | any): RisksMap {
  const hr = Number(row?.heart_rate ?? 0) || 0;
  const sbp = Number(row?.systolic_bp ?? 0) || 0;
  const dbp = Number(row?.diastolic_bp ?? 0) || 0;
  const sugar = Number(row?.blood_sugar ?? 0) || 0;
  const weight = Number(row?.weight ?? 0) || 0;
  const temp = Number(row?.temperature ?? 0) || 0;
  const sleepHours = Number(row?.sleep_hours ?? 0) || 0;

  // Attempt to read age from row or stored user metadata
  let age = Number(row?.age ?? 0) || 0;
  if (!age) {
    try {
      const maybe = localStorage.getItem("user");
      if (maybe) {
        const parsed = JSON.parse(maybe);
        age = Number(parsed?.age ?? parsed?.user_metadata?.age ?? 0) || age;
      }
    } catch {}
  }

  const symptomsRaw = row?.symptoms ?? row?.notes ?? "";
  const symptoms =
    typeof symptomsRaw === "string"
      ? symptomsRaw.toLowerCase()
      : Array.isArray(symptomsRaw)
      ? symptomsRaw.join(" ").toLowerCase()
      : "";

  // initialize default risk map
  const risks: RisksMap = {
    diabetes: 0,
    hypertension: 0,
    heartDisease: 0,
    stroke: 0,
    alzheimer: 0,
    copd: 0,
    kidneyDisease: 0,
    obesity: 0,
  };

  // Diabetes heuristic (glucose-driven)
  if (sugar >= 200) risks.diabetes = 96;
  else if (sugar >= 160) risks.diabetes = 85;
  else if (sugar >= 140) risks.diabetes = 70;
  else if (sugar >= 110) risks.diabetes = 35;
  else if (sugar > 100) risks.diabetes = 12;
  else risks.diabetes = 5;

  // Hypertension heuristic (BP-driven)
  if (sbp >= 180 || dbp >= 120) risks.hypertension = 98;
  else if (sbp >= 160 || dbp >= 100) risks.hypertension = 88;
  else if (sbp >= 140 || dbp >= 90) risks.hypertension = 65;
  else if (sbp >= 130 || dbp >= 80) risks.hypertension = 32;
  else risks.hypertension = 8;

  // Heart disease heuristic (combo)
  let heartScore = 0;
  if (hr && (hr < 50 || hr > 100)) heartScore += 18;
  if (risks.hypertension >= 65) heartScore += 26;
  if (weight && weight > 90) heartScore += 12;
  if (age && age > 60) heartScore += 16;
  if (symptoms.includes("chest") || symptoms.includes("palpit") || symptoms.includes("irregular"))
    heartScore += 20;
  risks.heartDisease = Math.min(99, Math.max(4, Math.round(heartScore)));

  // Stroke (bp + age + diabetes + symptom clues)
  let strokeScore = 0;
  if (risks.hypertension >= 85) strokeScore += 52;
  if (age > 65) strokeScore += 22;
  if (risks.diabetes >= 70) strokeScore += 14;
  if (symptoms.includes("numb") || symptoms.includes("weak") || symptoms.includes("slurred"))
    strokeScore += 18;
  risks.stroke = Math.min(99, Math.round(strokeScore));

  // Alzheimer's (age & cognitive symptoms)
  let alz = 0;
  if (age >= 80) alz = 42;
  else if (age >= 70) alz = 28;
  else if (age >= 60) alz = 12;
  if (symptoms.includes("confusion") || symptoms.includes("memory") || symptoms.includes("forget"))
    alz += 30;
  risks.alzheimer = Math.min(95, Math.round(alz));

  // COPD (respiratory symptoms)
  let copd = 0;
  if (symptoms.includes("shortness") || symptoms.includes("breath") || symptoms.includes("cough")) copd += 35;
  if (symptoms.includes("wheeze")) copd += 25;
  risks.copd = Math.min(95, Math.round(copd));

  // Kidney disease (bp + diabetes + swelling)
  let kidney = 0;
  if (risks.hypertension >= 70) kidney += 30;
  if (risks.diabetes >= 60) kidney += 34;
  if (age > 60) kidney += 12;
  if (symptoms.includes("swelling") || symptoms.includes("edema") || symptoms.includes("urine")) kidney += 22;
  risks.kidneyDisease = Math.min(95, Math.round(kidney));

  // Obesity crude estimate (weight only; better with BMI)
  let obesity = 0;
  if (weight > 110) obesity = 88;
  else if (weight > 100) obesity = 72;
  else if (weight > 85) obesity = 46;
  else if (weight > 70) obesity = 22;
  else obesity = 8;
  if (sleepHours && (sleepHours < 4 || sleepHours > 10)) obesity = Math.min(95, obesity + 4);
  risks.obesity = Math.round(obesity);

  // final normalization (clamp 0..100)
  Object.keys(risks).forEach((k) => {
    const v = Number(risks[k] ?? 0);
    risks[k] = Math.max(0, Math.min(100, Math.round(v)));
  });

  return risks;
}

/**
 * pickTips - returns a short list of human-friendly tips based on vitals & risks
 */
export function pickTips(row: Partial<VitalsRow> | any, risks: RisksMap): string[] {
  const tips: string[] = [];

  if ((risks.diabetes ?? 0) >= 80) tips.push("Very high blood sugar — contact a clinician urgently.");
  else if ((risks.diabetes ?? 0) >= 50) tips.push("Elevated blood sugar — consider a fasting test and review diet.");

  if ((risks.hypertension ?? 0) >= 85) tips.push("Dangerously high blood pressure — seek immediate medical help.");
  else if ((risks.hypertension ?? 0) >= 50) tips.push("Blood pressure elevated — reduce salt intake and monitor daily.");

  if ((risks.heartDisease ?? 0) >= 70) tips.push("High heart disease risk — avoid heavy exertion and consult your doctor.");
  if ((risks.stroke ?? 0) >= 60) tips.push("High stroke risk — urgent review is recommended.");

  if ((risks.copd ?? 0) >= 50) tips.push("Breathing issues noted — consider respiratory assessment.");

  if ((risks.kidneyDisease ?? 0) >= 50) tips.push("Kidney function may be at risk — discuss renal tests with your physician.");

  if ((risks.obesity ?? 0) >= 70) tips.push("Weight may be a risk factor — consider a nutrition consultation.");

  // gentle lifestyle tips
  tips.push("Drink water throughout the day to stay hydrated.");
  tips.push("Aim for a short daily walk (15–30 minutes) if possible.");
  tips.push("Keep a regular sleep schedule and avoid large meals before bedtime.");

  // de-duplicate & keep up to 6
  const uniq = Array.from(new Set(tips)).slice(0, 6);
  return uniq;
}

/**
 * shouldAlert - decide whether risks are high enough to trigger urgent actions
 */
export function shouldAlert(risks: RisksMap): boolean {
  if (!risks) return false;
  return (risks.diabetes ?? 0) >= 80 || (risks.hypertension ?? 0) >= 90 || (risks.heartDisease ?? 0) >= 85;
}

/**
 * formatInsightText - produce a readable insight body text from risks & vitals
 */
export function formatInsightText(title: string, risks: RisksMap, vitals: Partial<VitalsRow> | any): string {
  const riskSummary = Object.entries(risks)
    .map(([k, v]) => `${k}: ${v}%`)
    .join(", ");
  const vitalsParts: string[] = [];
  if (vitals.heart_rate != null) vitalsParts.push(`HR ${vitals.heart_rate} bpm`);
  if (vitals.systolic_bp != null && vitals.diastolic_bp != null)
    vitalsParts.push(`BP ${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg`);
  if (vitals.blood_sugar != null) vitalsParts.push(`Sugar ${vitals.blood_sugar} mg/dL`);
  if (vitals.weight != null) vitalsParts.push(`Weight ${vitals.weight} kg`);
  const vitalsText = vitalsParts.join("; ") || "No vitals provided";

  const lines = [
    title || "Health reading",
    `Risks — ${riskSummary}.`,
    `Vitals — ${vitalsText}.`,
    `Notes: ${String(vitals.notes ?? vitals.symptoms ?? "-")}`
  ];
  return lines.join("\n");
}

/**
 * createInsightForUser - inserts an insight row into health_insights (supabase)
 */
export async function createInsightForUser(
  userId: string,
  title: string,
  body: string,
  metadata: any = {},
  source = "client"
): Promise<{ data?: any; error?: any }> {
  try {
    const payload = {
      user_id: userId,
      title,
      body,
      metadata,
      source,
      created_at: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };
    const { data, error } = await supabase.from("health_insights").insert([payload]);
    return { data, error };
  } catch (e) {
    return { error: e };
  }
}

/**
 * callServerAgent - placeholder to call a server-side agent / function for heavier work.
 * Implement the actual call (fetch to /api/agent-run) on your serverless host.
 */
export async function callServerAgent(userId: string): Promise<any> {
  try {
    // Example: call an API route (Vercel/Netlify/Azure) you deploy separately:
    // const res = await fetch("/api/agent-run", { method: "POST", body: JSON.stringify({ userId }), headers: { "Content-Type": "application/json" }});
    // return await res.json();
    return null;
  } catch (e) {
    console.warn("callServerAgent error:", e);
    return null;
  }
}

/**
 * Export default object for convenience
 */
export default {
  computeRisks,
  pickTips,
  shouldAlert,
  formatInsightText,
  createInsightForUser,
  callServerAgent
};
