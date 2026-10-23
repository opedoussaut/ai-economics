"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { useCurrency } from "./currency";
import { EmptyState, cn } from "./ui";
import { fmtMoney, fmtNum } from "@/lib/format";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" },
  labelStyle: { color: "var(--muted)", marginBottom: 4 },
  itemStyle: { padding: 0 },
} as const;

export interface Series {
  key: string;
  label: string;
  color?: string;
  dashed?: boolean;
}

type Unit = "money" | "number" | "percent";

function useFormatter(unit: Unit, suffix = "") {
  const { convert, currency, usdPerEur } = useCurrency();
  const cur = currency === "EUR" && usdPerEur ? "EUR" : "USD";
  return (v: number) =>
    unit === "money" ? `${fmtMoney(convert(v), cur, { digits: Math.abs(v) < 1 ? 3 : 2 })}${suffix}` : unit === "percent" ? `${fmtNum(v, 1)}%` : `${fmtNum(v, 2, true)}${suffix}`;
}

export const WINDOWS = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "90d", label: "90D", days: 90 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: Infinity },
] as const;

export function WindowPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label="Time window" className="flex rounded-md border border-border bg-panel-2 p-0.5">
      {WINDOWS.map((w) => (
        <button key={w.id} type="button" aria-pressed={value === w.id} onClick={() => onChange(w.id)}
          className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", value === w.id ? "bg-panel text-text shadow-sm" : "text-muted")}>
          {w.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Time-series line chart with a history window selector. Shows an honest
 * insufficient-data state when the window holds fewer than two observations.
 */
export function TimeSeriesChart({
  data,
  series,
  unit = "money",
  suffix = "",
  height = 260,
  defaultWindow = "all",
  step = false,
}: {
  data: Record<string, number | string | null>[];
  series: Series[];
  unit?: Unit;
  suffix?: string;
  height?: number;
  defaultWindow?: string;
  step?: boolean;
}) {
  const [win, setWin] = useState(defaultWindow);
  const fmt = useFormatter(unit, suffix);
  const filtered = useMemo(() => {
    const days = WINDOWS.find((w) => w.id === win)?.days ?? Infinity;
    if (!Number.isFinite(days) || data.length === 0) return data;
    const last = Date.parse(String(data[data.length - 1].date));
    return data.filter((d) => Date.parse(String(d.date)) >= last - days * 86_400_000);
  }, [data, win]);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <WindowPicker value={win} onChange={setWin} />
      </div>
      {filtered.length < 2 ? (
        <EmptyState title="Insufficient data for a trend in this window">
          {filtered.length} observation(s) available. History accumulates with each scheduled refresh; no earlier values are fabricated.
        </EmptyState>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filtered} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" {...axis} minTickGap={24} />
              <YAxis {...axis} width={64} tickFormatter={fmt} />
              <Tooltip {...tooltipStyle} formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s, i) => (
                <Line key={s.key} type={step ? "stepAfter" : "monotone"} dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i % 5]}
                  strokeWidth={2} dot={filtered.length < 30} strokeDasharray={s.dashed ? "4 3" : undefined} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function SimpleLineChart({ data, xKey, series, unit = "money", xFormat, height = 240, suffix = "" }: {
  data: Record<string, number | string | null>[];
  xKey: string;
  series: Series[];
  unit?: Unit;
  xFormat?: (v: number) => string;
  height?: number;
  suffix?: string;
}) {
  const fmt = useFormatter(unit, suffix);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} {...axis} tickFormatter={xFormat} />
          <YAxis {...axis} width={64} tickFormatter={fmt} />
          <Tooltip {...tooltipStyle} formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))} labelFormatter={(l) => (xFormat ? xFormat(Number(l)) : String(l))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i % 5]} strokeWidth={2} dot={false} strokeDasharray={s.dashed ? "4 3" : undefined} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({ data, unit = "money", height, suffix = "", colorByIndex = false }: {
  data: { label: string; value: number; color?: string }[];
  unit?: Unit;
  height?: number;
  suffix?: string;
  colorByIndex?: boolean;
}) {
  const fmt = useFormatter(unit, suffix);
  return (
    <div style={{ height: height ?? Math.max(120, data.length * 30 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={fmt} />
          <YAxis type="category" dataKey="label" {...axis} width={170} interval={0} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--panel-2)" }} formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? (colorByIndex ? CHART_COLORS[i % 5] : "var(--chart-1)")} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedBarChart({ data, series, unit = "money", height = 260, xKey = "label" }: {
  data: Record<string, number | string>[];
  series: Series[];
  unit?: Unit;
  height?: number;
  xKey?: string;
}) {
  const fmt = useFormatter(unit);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} {...axis} interval={0} />
          <YAxis {...axis} width={64} tickFormatter={fmt} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--panel-2)" }} formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color ?? CHART_COLORS[i % 5]} maxBarSize={56} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Input vs output price scatter (log axes), one colour per channel. */
export function PriceScatter({ groups, height = 300 }: {
  groups: { name: string; color: string; points: { x: number; y: number; label: string }[] }[];
  height?: number;
}) {
  const fmt = useFormatter("money");
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 5, right: 12, bottom: 18, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" />
          <XAxis type="number" dataKey="x" name="Input $/1M" scale="log" domain={["auto", "auto"]} {...axis} tickFormatter={fmt}
            label={{ value: "Input price per 1M tokens (log)", position: "insideBottom", offset: -10, fill: "var(--faint)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="Output $/1M" scale="log" domain={["auto", "auto"]} {...axis} width={64} tickFormatter={fmt} />
          <ZAxis range={[28, 28]} />
          <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { x: number; y: number; label: string } | undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-border bg-panel px-2.5 py-1.5 text-xs shadow">
                  <p className="font-medium">{p.label}</p>
                  <p className="text-muted">In {fmt(p.x)} · Out {fmt(p.y)} per 1M</p>
                </div>
              );
            }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} verticalAlign="top" />
          {groups.map((g) => (
            <Scatter key={g.name} name={g.name} data={g.points} fill={g.color} fillOpacity={0.75} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
