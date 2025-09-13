// src/components/HealthChart.tsx
import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type Reading = {
  created_at?: string;
  heart_rate?: number | null;
  blood_sugar?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
};

export const HealthChart: React.FC<{ data: Reading[] }> = ({ data }) => {
  // Ensure ascending chronological order for chart
  const sorted = [...(data || [])].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });

  const labels = sorted.map((r) => (r.created_at ? new Date(r.created_at).toLocaleString() : ""));

  const heartData = sorted.map((r) => (typeof r.heart_rate === "number" ? r.heart_rate : null));
  const sugarData = sorted.map((r) => (typeof r.blood_sugar === "number" ? r.blood_sugar : null));
  const systolicData = sorted.map((r) => (typeof r.systolic_bp === "number" ? r.systolic_bp : null));
  const diastolicData = sorted.map((r) => (typeof r.diastolic_bp === "number" ? r.diastolic_bp : null));
  const tempData = sorted.map((r) => (typeof r.temperature === "number" ? r.temperature : null));

  const chartData = {
    labels,
    datasets: [
      {
        label: "Heart Rate (bpm)",
        data: heartData,
        tension: 0.2,
        fill: false,
        borderWidth: 2,
        borderColor: "#ef4444", // red
        pointBackgroundColor: "#ef4444"
      },
      {
        label: "Blood Sugar (mg/dL)",
        data: sugarData,
        tension: 0.2,
        fill: false,
        borderWidth: 2,
        borderColor: "#f59e0b", // orange
        pointBackgroundColor: "#f59e0b"
      },
      {
        label: "Systolic BP (mmHg)",
        data: systolicData,
        tension: 0.2,
        fill: false,
        borderWidth: 1.5,
        borderDash: [6, 4],
        borderColor: "#3b82f6", // blue
        pointBackgroundColor: "#3b82f6"
      },
      {
        label: "Diastolic BP (mmHg)",
        data: diastolicData,
        tension: 0.2,
        fill: false,
        borderWidth: 1.5,
        borderDash: [3, 3],
        borderColor: "#60a5fa", // lighter blue
        pointBackgroundColor: "#60a5fa"
      },
      {
        label: "Temperature (°F)",
        data: tempData,
        tension: 0.2,
        fill: false,
        borderWidth: 1.5,
        borderColor: "#10b981", // green
        pointBackgroundColor: "#10b981"
      }
    ]
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" },
      title: { display: false },
      tooltip: { mode: "index", intersect: false }
    },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
      },
      y: {
        beginAtZero: false
      }
    }
  };

  return (
    <div style={{ width: "100%", minHeight: 300 }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default HealthChart;
