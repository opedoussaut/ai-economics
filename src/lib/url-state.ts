"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calculator state synced to the URL query string so scenarios are shareable.
 * Only keys that differ from defaults are written.
 */
export function useUrlState<T extends Record<string, string | number | boolean>>(defaults: T): [T, (patch: Partial<T>) => void, () => void] {
  const [state, setState] = useState<T>(defaults);
  const loaded = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    for (const [k, def] of Object.entries(defaults)) {
      const raw = params.get(k);
      if (raw === null) continue;
      if (typeof def === "number") {
        const n = Number(raw);
        if (Number.isFinite(n)) (next as Record<string, unknown>)[k] = n;
      } else if (typeof def === "boolean") (next as Record<string, unknown>)[k] = raw === "1" || raw === "true";
      else (next as Record<string, unknown>)[k] = raw;
    }
    setState(next);
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const params = new URLSearchParams(window.location.search);
    for (const [k, def] of Object.entries(defaults)) {
      const v = state[k];
      if (v === def) params.delete(k);
      else params.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [state, defaults]);

  const patch = useCallback((p: Partial<T>) => setState((s) => ({ ...s, ...p })), []);
  const reset = useCallback(() => setState(defaults), [defaults]);
  return [state, patch, reset];
}

export function downloadFile(name: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};
