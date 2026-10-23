"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { CurrencyProvider } from "./currency";

export function Providers({ children, usdPerEur, rateDate }: { children: ReactNode; usdPerEur: number | null; rateDate: string | null }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <CurrencyProvider usdPerEur={usdPerEur} rateDate={rateDate}>
        {children}
      </CurrencyProvider>
    </ThemeProvider>
  );
}
