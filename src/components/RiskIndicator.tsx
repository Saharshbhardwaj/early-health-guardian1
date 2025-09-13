// src/components/RiskIndicator.tsx
import React from "react";

type RiskIndicatorProps = {
  disease: string;
  risk: number | string;
  color?: string; // optional
  className?: string;
};

/**
 * RiskIndicator
 * - disease: display name or key (e.g. "diabetes")
 * - risk: numeric percent (0-100) or string
 * - color: optional CSS color string; if not provided component will pick a color based on disease
 */
const defaultColorFor = (disease: string) => {
  const key = String(disease || "").toLowerCase();
  if (key.includes("heart") || key.includes("cardio") || key.includes("hypertension")) return "rgb(220, 38, 38)"; // red
  if (key.includes("diabetes") || key.includes("sugar")) return "rgb(234, 88, 12)"; // orange
  if (key.includes("alzheimer") || key.includes("memory") || key.includes("neuro")) return "rgb(6, 78, 59)"; // teal/green
  if (key.includes("stroke")) return "rgb(154, 16, 255)"; // purple
  // fallback
  return "rgb(13, 148, 136)"; // emerald-ish
};

const RiskIndicator: React.FC<RiskIndicatorProps> = ({ disease, risk, color, className = "" }) => {
  const numericRisk = typeof risk === "number" ? Math.round(risk) : Number(risk) || 0;
  const displayName = String(disease)
    .split(/_|-|\s/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");

  const fillColor = color ?? defaultColorFor(displayName);

  const severityLabel = numericRisk >= 80 ? "High" : numericRisk >= 50 ? "Moderate" : "Low";

  return (
    <div className={`p-3 border rounded shadow-sm ${className}`} role="region" aria-label={`${displayName} risk`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{displayName}</div>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: fillColor
          }}
          aria-hidden
        />
      </div>

      <div className="text-2xl font-semibold mt-2" style={{ color: fillColor }}>
        {numericRisk}%
      </div>
      <div className="text-xs mt-1 text-muted-foreground">{severityLabel}</div>

      {/* optional small progress bar */}
      <div className="w-full bg-neutral-100 rounded-full h-2 mt-3 overflow-hidden">
        <div
          style={{
            width: `${Math.max(0, Math.min(100, numericRisk))}%`,
            height: "100%",
            background: fillColor,
            transition: "width 400ms ease"
          }}
        />
      </div>
    </div>
  );
};

export default RiskIndicator;
