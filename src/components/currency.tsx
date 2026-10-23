"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fmtMoney } from "@/lib/format";

/**
 * Display currency. Source values are USD; EUR uses the ECB reference rate
 * (shown in the top bar with its date). The choice is stored per browser.
 */
interface CurrencyCtx {
  currency: "USD" | "EUR";
  setCurrency: (c: "USD" | "EUR") => void;
  /** USD per EUR from ECB, null when FX data is unavailable. */
  usdPerEur: number | null;
  rateDate: string | null;
  convert: (usd: number | null | undefined) => number | null;
}

const Ctx = createContext<CurrencyCtx | null>(null);

export function CurrencyProvider({ usdPerEur, rateDate, children }: { usdPerEur: number | null; rateDate: string | null; children: ReactNode }) {
  const [currency, setCurrencyState] = useState<"USD" | "EUR">("USD");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aie-currency");
      if (saved === "EUR" && usdPerEur) setCurrencyState("EUR");
    } catch {}
  }, [usdPerEur]);
  const setCurrency = (c: "USD" | "EUR") => {
    setCurrencyState(c);
    try {
      localStorage.setItem("aie-currency", c);
    } catch {}
  };
  const convert = (usd: number | null | undefined) => {
    if (usd === null || usd === undefined) return null;
    if (currency === "USD" || !usdPerEur) return usd;
    return usd / usdPerEur;
  };
  return <Ctx.Provider value={{ currency, setCurrency, usdPerEur, rateDate, convert }}>{children}</Ctx.Provider>;
}

export function useCurrency() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCurrency outside provider");
  return c;
}

/** Renders a USD amount in the selected display currency. */
export function Money({ usd, digits, compact }: { usd: number | null | undefined; digits?: number; compact?: boolean }) {
  const { currency, convert, usdPerEur } = useCurrency();
  const shown = currency === "EUR" && usdPerEur ? "EUR" : "USD";
  return <span className="num">{fmtMoney(convert(usd), shown, { digits, compact })}</span>;
}
