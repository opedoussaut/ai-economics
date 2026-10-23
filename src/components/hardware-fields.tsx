"use client";

import type { RatePreset } from "@/lib/rate-presets";
import { FieldGroup, NumberField, SelectField, Toggle } from "./fields";
import { Money } from "./currency";

/** Shared state shape for rent/own hardware inputs (flat, URL-serialisable). */
export const HARDWARE_DEFAULTS = {
  mode: "rent",
  rent: 3,
  rentSource: "manual",
  inclPower: true,
  gpuPrice: 30000,
  serverNet: 12000,
  life: 4,
  residual: 10,
  capital: 8,
  maint: 3,
  facility: 0,
  gpuW: 700,
  hostW: 300,
  pue: 1.3,
  kwh: 0.1,
  storage: 0.02,
  software: 0.05,
};
export type HardwareState = typeof HARDWARE_DEFAULTS;

export function toHardwareInputs(s: HardwareState) {
  const power = { gpuPowerW: s.gpuW, hostPowerPerGpuW: s.hostW, pue: Math.max(1, s.pue), electricityPerKwh: s.kwh };
  const common = { storageBandwidthPerGpuHour: s.storage, softwareOpsPerGpuHour: s.software };
  return s.mode === "rent"
    ? { mode: "rent" as const, rentalPerGpuHour: s.rent, rentalIncludesPower: s.inclPower, ...power, ...common }
    : {
        mode: "own" as const, gpuPrice: s.gpuPrice, serverNetworkPerGpu: s.serverNet, usefulLifeYears: Math.max(0.5, s.life), residualValuePct: s.residual,
        costOfCapitalPct: s.capital, maintenancePctPerYear: s.maint, facilityPerGpuHour: s.facility, ...power, ...common,
      };
}

export function HardwareFields<T extends HardwareState>({ s, set, rates }: { s: T; set: (p: Partial<HardwareState>) => void; rates: RatePreset[] }) {
  return (
    <FieldGroup title="Hardware cost">
      <SelectField label="Acquisition" value={s.mode} onChange={(v) => set({ mode: v })} options={[{ value: "rent", label: "Rent (cloud / marketplace)" }, { value: "own", label: "Own (buy hardware)" }]} />
      {s.mode === "rent" ? (
        <>
          {rates.length > 0 && (
            <SelectField
              label="Use a live published rate"
              value={rates.some((r) => r.id === s.rentSource) ? s.rentSource : "manual"}
              onChange={(id) => {
                const r = rates.find((x) => x.id === id);
                set(r ? { rentSource: r.id, rent: r.rate } : { rentSource: "manual" });
              }}
              options={[{ value: "manual", label: "Manual rate" }, ...rates.map((r) => ({ value: r.id, label: `${r.label} — $${r.rate.toFixed(2)}/GPU-h` }))]}
              hint={rates.find((r) => r.id === s.rentSource)?.source}
            />
          )}
          <NumberField label="Rental price per GPU-hour" unit="USD" value={s.rent} min={0} onChange={(v) => set({ rent: v, rentSource: "manual" })} />
          <Toggle label="Rental includes power, cooling & space" checked={s.inclPower} onChange={(v) => set({ inclPower: v })}
            hint="True for virtually all cloud/marketplace rentals. Turn off only if your contract bills energy separately — otherwise electricity would be double counted." />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="GPU purchase price" unit="USD" value={s.gpuPrice} onChange={(v) => set({ gpuPrice: v })} />
          <NumberField label="Server+network / GPU" unit="USD" value={s.serverNet} onChange={(v) => set({ serverNet: v })} />
          <NumberField label="Useful life" unit="years" value={s.life} min={0.5} onChange={(v) => set({ life: v })} />
          <NumberField label="Residual value" unit="%" value={s.residual} onChange={(v) => set({ residual: v })} />
          <NumberField label="Cost of capital" unit="%/yr" value={s.capital} onChange={(v) => set({ capital: v })} />
          <NumberField label="Maintenance" unit="% capex/yr" value={s.maint} onChange={(v) => set({ maint: v })} />
          <NumberField label="Colocation / GPU-h" unit="USD" value={s.facility} onChange={(v) => set({ facility: v })} />
        </div>
      )}
      {(s.mode === "own" || !s.inclPower) && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="GPU power (avg)" unit="W" value={s.gpuW} onChange={(v) => set({ gpuW: v })} />
          <NumberField label="Host power / GPU" unit="W" value={s.hostW} onChange={(v) => set({ hostW: v })} />
          <NumberField label="PUE" value={s.pue} min={1} step={0.05} onChange={(v) => set({ pue: v })} />
          <NumberField label="Electricity" unit="USD/kWh" value={s.kwh} step={0.01} onChange={(v) => set({ kwh: v })} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Storage & bandwidth" unit="USD/GPU-h" value={s.storage} step={0.01} onChange={(v) => set({ storage: v })} />
        <NumberField label="Software & ops" unit="USD/GPU-h" value={s.software} step={0.01} onChange={(v) => set({ software: v })} />
      </div>
    </FieldGroup>
  );
}

export function HourlyBreakdown({ lines, total }: { lines: { key: string; label: string; perGpuHour: { toNumber(): number } }[]; total: number }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {lines.map((l) => (
          <tr key={l.key} className="border-b border-border/50">
            <td className="py-1 text-muted">{l.label}</td>
            <td className="py-1 text-right"><Money usd={l.perGpuHour.toNumber()} digits={4} /></td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td className="py-1">Fully loaded per GPU-hour</td>
          <td className="py-1 text-right"><Money usd={total} digits={4} /></td>
        </tr>
      </tbody>
    </table>
  );
}
