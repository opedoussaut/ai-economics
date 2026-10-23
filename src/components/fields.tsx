"use client";

import type { ReactNode } from "react";
import { cn, inputClass } from "./ui";

export function NumberField({
  label, value, onChange, step, min, max, unit, hint, id,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  hint?: ReactNode;
  id?: string;
}) {
  const fid = id ?? `f-${String(label).replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={fid} className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        {unit && <span className="text-[10px] text-faint">{unit}</span>}
      </span>
      <input
        id={fid}
        type="number"
        inputMode="decimal"
        className={cn(inputClass, "num")}
        value={Number.isFinite(value) ? value : 0}
        step={step ?? "any"}
        min={min}
        max={max}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {hint && <span className="mt-1 block text-[11px] leading-4 text-faint">{hint}</span>}
    </label>
  );
}

export function PercentField({ label, value, onChange, hint, max = 100 }: { label: ReactNode; value: number; onChange: (v: number) => void; hint?: ReactNode; max?: number }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="num text-text">{(value * 100).toFixed(0)}%</span>
      </span>
      <input type="range" min={0} max={max} step={1} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="w-full" aria-label={String(label)} />
      {hint && <span className="block text-[11px] leading-4 text-faint">{hint}</span>}
    </label>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, hint }: {
  label: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-[11px] leading-4 text-faint">{hint}</span>}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs">
      <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-text">{label}</span>
        {hint && <span className="block text-[11px] leading-4 text-faint">{hint}</span>}
      </span>
    </label>
  );
}

export function FieldGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("space-y-3", className)}>
      <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</legend>
      {children}
    </fieldset>
  );
}
