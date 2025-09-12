// src/components/HealthChart.tsx
import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData,
  ScriptableContext
} from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

export type HealthChartDatum = {
  date: string; // ISO or parseable date string
  heartRate?: number | null;
  sugar?: number | null;
  bp?: string | null;
  risks?: { [k: string]: number } | null;
};

type Props = {
  data: HealthChartDatum[];
  height?: number;
};

const DEFAULT_COLORS = [
  "#ef4444", // red
  "#0ea5a4", // teal
  "#f59e0b", // amber
  "#6366f1", // indigo
  "#10b981", // green
  "#ef6aa7", // pink
  "#06b6d4", // cyan
  "#8b5cf6", // violet
];

function pickColor(idx: number) {
  return DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
}

export const HealthChart: React.FC<Props> = ({ data, height = 320 }) => {
  // normalize and sort by date asc
  const normalized = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const parsed = data
      .map((d) => {
        const dateVal = d?.date ? new Date(d.date).getTime() : NaN;
        return {
          ...d,
          dateVal,
          heartRate: d.heartRate == null ? null : Number(d.heartRate),
          sugar: d.sugar == null ? null : Number(d.sugar),
          risks: d.risks ?? null,
          bp: d.bp ?? null
        };
      })
      .filter((d) => !Number.isNaN(d.dateVal))
      .sort((a, b) => a.dateVal - b.dateVal);
    return parsed;
  }, [data]);

  const labels = normalized.map((d) => new Date(d.dateVal).toISOString());

  // collect unique risk keys across points (preserve order)
  const riskKeys = useMemo(() => {
    const set = new Set<string>();
    normalized.forEach((pt) => {
      if (pt.risks && typeof pt.risks === "object") {
        Object.keys(pt.risks).forEach((k) => set.add(k));
      }
    });
    return Array.from(set);
  }, [normalized]);

  // define datasets: vitals first, then risks
  const datasets: ChartData<"line">["datasets"] = [];

  // Heart Rate dataset (left axis)
  datasets.push({
    label: "Heart Rate (bpm)",
    data: normalized.map((d) => (d.heartRate ?? null)),
    yAxisID: "y",
    tension: 0.3,
    fill: true,
    borderColor: pickColor(0),
    backgroundColor: (ctx: ScriptableContext<"line">) => {
      const c = pickColor(0);
      return c + "33";
    },
    pointRadius: 3,
    spanGaps: true,
  });

  // Blood Sugar dataset (left axis)
  datasets.push({
    label: "Blood Sugar (mg/dL)",
    data: normalized.map((d) => (d.sugar ?? null)),
    yAxisID: "y",
    tension: 0.25,
    fill: false,
    borderColor: pickColor(1),
    pointRadius: 2,
    spanGaps: true,
  });

  // Risk datasets (right axis 0..100)
  riskKeys.forEach((rk, idx) => {
    const color = pickColor(2 + idx);
    datasets.push({
      label: `${rk}`,
      data: normalized.map((d) => (d.risks && typeof d.risks === "object" ? (d.risks[rk] ?? null) : null)),
      yAxisID: "yRisk",
      tension: 0.35,
      fill: false,
      borderColor: color,
      backgroundColor: color,
      pointRadius: 2,
      borderDash: [4, 4],
      spanGaps: true,
    });
  });

  const chartData: ChartData<"line"> = {
    labels,
    datasets,
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", labels: { boxWidth: 12, padding: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label ?? "";
            const val = ctx.parsed.y;
            const idx = ctx.dataIndex ?? 0;
            const bpVal = normalized[idx]?.bp;
            const unit = label.includes("Heart") ? " bpm" : label.includes("Sugar") ? " mg/dL" : "%";
            return bpVal && (label.includes("Heart") || label.includes("Sugar"))
              ? `${label}: ${val}${unit} — BP: ${bpVal}`
              : `${label}: ${val}${unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "time",
        time: { unit: normalized.length <= 7 ? "day" : "day", tooltipFormat: "PP p" },
      },
      y: {
        position: "left",
        title: { display: true, text: "Vitals" },
        beginAtZero: false,
      },
      yRisk: {
        position: "right",
        title: { display: true, text: "Risk (%)" },
        min: 0,
        max: 100,
        grid: { drawOnChartArea: false },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

// both named and default export so other files can import either way
export default HealthChart;
