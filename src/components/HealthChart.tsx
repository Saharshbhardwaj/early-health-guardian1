import React, { useMemo, useState } from "react";

/**
 * Lightweight, dependency-free chart component.
 * Accepts `data` where each item is: { date: string; heartRate?: number; bp?: string | null; bloodSugar?: number | null }
 *
 * Drop this file in: src/components/HealthChart.tsx
 * It intentionally avoids external chart libs so it works without installing new deps.
 */

export type Reading = {
  date: string;
  heartRate?: number;
  bp?: string | null;
  bloodSugar?: number | null;
};

type Props = {
  data: Reading[]; // chronological order expected (oldest -> newest)
  height?: number;
};

const padding = { top: 12, right: 12, bottom: 24, left: 36 };

export const HealthChart: React.FC<Props> = ({ data, height = 180 }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const processed = useMemo(() => {
    // Ensure we have a copy and remove invalid rows
    const arr = (data || []).map(d => ({
      date: d.date,
      hr: typeof d.heartRate === "number" ? d.heartRate : null,
      sugar: typeof d.bloodSugar === "number" ? d.bloodSugar : null,
      bp: d.bp ?? null
    }));
    // compute extents
    const hrValues = arr.map(r => r.hr).filter((v): v is number => v !== null);
    const sugarValues = arr.map(r => r.sugar).filter((v): v is number => v !== null);

    const allY = [...hrValues, ...sugarValues];
    const yMin = allY.length ? Math.min(...allY) : 0;
    const yMax = allY.length ? Math.max(...allY) : 100;

    return { arr, yMin, yMax, hrValues, sugarValues };
  }, [data]);

  // SVG dims
  const width = 720; // will scale
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // helpers
  const xFor = (i: number) => {
    const n = Math.max(1, processed.arr.length - 1);
    return padding.left + (i / n) * innerW;
  };
  const yFor = (value: number | null) => {
    if (value === null) return padding.top + innerH; // bottom
    const min = processed.yMin;
    const max = processed.yMax === min ? min + 1 : processed.yMax;
    const ratio = (value - min) / (max - min);
    return padding.top + (1 - Math.max(0, Math.min(1, ratio))) * innerH;
  };

  // build path for heart rate (primary)
  const hrPath = useMemo(() => {
    const points = processed.arr.map((r, i) => {
      const x = xFor(i);
      const y = yFor(r.hr);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    });
    return points.join(" ");
  }, [processed.arr, processed.yMin, processed.yMax, width, innerW]);

  // sugar path (secondary)
  const sugarPath = useMemo(() => {
    const points = processed.arr.map((r, i) => {
      const x = xFor(i);
      const y = yFor(r.sugar);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    });
    return points.join(" ");
  }, [processed.arr, processed.yMin, processed.yMax, width, innerW]);

  // x ticks (show up to 6)
  const ticks = useMemo(() => {
    const n = processed.arr.length;
    if (n === 0) return [];
    const step = Math.max(1, Math.floor(n / 6));
    return processed.arr.map((r, i) => ({ label: new Date(r.date).toLocaleDateString(), i })).filter((_, i) => i % step === 0 || i === n - 1);
  }, [processed.arr]);

  return (
    <div className="w-full" style={{ overflowX: "auto" }}>
      {(!data || data.length === 0) ? (
        <div className="p-4 text-sm text-muted-foreground">No trend data recorded yet — add a reading to see trends.</div>
      ) : (
        <svg width={width} height={height} style={{ display: "block", maxWidth: "100%" }}>
          {/* background */}
          <rect x={0} y={0} width={width} height={height} fill="transparent" />

          {/* horizontal grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
            const y = padding.top + t * innerH;
            return <line key={idx} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#eee" strokeWidth={1} />;
          })}

          {/* heart rate path */}
          <path d={hrPath} fill="none" stroke="#ef4444" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />

          {/* sugar path (dashed) */}
          <path d={sugarPath} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="6 6" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />

          {/* markers + hover circles */}
          {processed.arr.map((pt, i) => {
            const x = xFor(i);
            const yHR = yFor(pt.hr);
            const ySugar = yFor(pt.sugar);
            const isHover = hoverIndex === i;
            return (
              <g key={i} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)}>
                {/* HR dot */}
                {pt.hr !== null && <circle cx={x} cy={yHR} r={isHover ? 5 : 3.6} fill="#ef4444" stroke="#fff" strokeWidth={isHover ? 1.5 : 0.6} />}
                {/* Sugar dot */}
                {pt.sugar !== null && <rect x={x - (isHover ? 4.5 : 3)} y={ySugar - (isHover ? 4.5 : 3)} width={isHover ? 9 : 6} height={isHover ? 9 : 6} rx={2} fill="#f59e0b" stroke="#fff" strokeWidth={isHover ? 1.2 : 0.6} />}
              </g>
            );
          })}

          {/* x axis ticks */}
          {ticks.map((t, idx) => {
            const x = xFor(t.i);
            return (
              <g key={idx}>
                <line x1={x} x2={x} y1={padding.top + innerH} y2={padding.top + innerH + 6} stroke="#ccc" />
                <text x={x} y={padding.top + innerH + 18} fontSize={11} fill="#4b5563" textAnchor="middle">{new Date(t.label).toLocaleDateString()}</text>
              </g>
            );
          })}

          {/* hover tooltip */}
          {hoverIndex !== null && processed.arr[hoverIndex] && (() => {
            const pt = processed.arr[hoverIndex];
            const x = xFor(hoverIndex);
            const y = Math.min(padding.top + innerH - 6, (yFor(pt.hr ?? pt.sugar) || padding.top + innerH) - 24);
            const boxW = 170;
            const boxH = 60;
            const boxX = Math.max(padding.left, Math.min(width - padding.right - boxW, x - boxW / 2));
            return (
              <g>
                <rect x={boxX} y={y} rx={6} ry={6} width={boxW} height={boxH} fill="#111827" opacity={0.92} />
                <text x={boxX + 10} y={y + 18} fontSize={12} fill="#fff" fontWeight={600}> {new Date(pt.date).toLocaleString()} </text>
                <text x={boxX + 10} y={y + 34} fontSize={12} fill="#fff"> HR: {pt.hr !== null ? `${pt.hr} bpm` : "—"} </text>
                <text x={boxX + 10} y={y + 50} fontSize={12} fill="#fff"> Sugar: {pt.sugar !== null ? `${pt.sugar} mg/dL` : "—"} </text>
              </g>
            );
          })()}
        </svg>
      )}
      {/* legend */}
      {data && data.length > 0 && (
        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><span style={{ width: 10, height: 10, background: "#ef4444", display: "inline-block", borderRadius: 6 }} /> Heart Rate</div>
          <div className="flex items-center gap-2"><span style={{ width: 10, height: 10, background: "#f59e0b", display: "inline-block", borderRadius: 2 }} /> Blood Sugar</div>
        </div>
      )}
    </div>
  );
};

export default HealthChart;
