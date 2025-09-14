// src/components/HealthChart.tsx
import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type Reading = {
  created_at: string;
  heart_rate?: number | null;
  blood_sugar?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  weight?: number | null;
  temperature?: number | null;
  sleep_hours?: number | null;
  exercise_minutes?: number | null;
  [k: string]: any;
};

const formatX = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
};

export const HealthChart: React.FC<{ data: Reading[] }> = ({ data }) => {
  // choose colors for each series
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="created_at"
            tickFormatter={formatX}
            minTickGap={20}
            tick={{ fontSize: 11 }}
          />
          <YAxis yAxisId="left" orientation="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip labelFormatter={(label) => formatX(label as string)} />
          <Legend />

          {/* Primary clinical series */}
          <Line yAxisId="left" type="monotone" dataKey="heart_rate" name="Heart Rate (bpm)" stroke="#10B981" dot={{ r: 2 }} />
          <Line yAxisId="left" type="monotone" dataKey="blood_sugar" name="Blood sugar (mg/dL)" stroke="#F59E0B" dot={{ r: 2 }} />
          <Line yAxisId="left" type="monotone" dataKey="systolic_bp" name="Systolic (mmHg)" stroke="#EF4444" dot={false} />
          <Line yAxisId="left" type="monotone" dataKey="diastolic_bp" name="Diastolic (mmHg)" stroke="#F97316" dot={false} />

          {/* Secondary values that might be on different scale — put on right axis */}
          <Line yAxisId="right" type="monotone" dataKey="weight" name="Weight (kg)" stroke="#6366F1" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="temperature" name="Temp (°F)" stroke="#06B6D4" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="sleep_hours" name="Sleep (hrs)" stroke="#8B5CF6" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="exercise_minutes" name="Exercise (min)" stroke="#F43F5E" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HealthChart;