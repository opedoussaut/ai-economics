"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Activity, BookOpen, Coins, Cpu, Factory, Gauge, GraduationCap, LayoutDashboard, Menu, Moon, Repeat,
  SlidersHorizontal, Sun, TrendingUp, Wrench, X,
} from "lucide-react";
import { cn } from "./ui";
import { useCurrency } from "./currency";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/token-pricing", label: "Token Pricing", icon: Coins },
  { href: "/gpu-pricing", label: "GPU Pricing", icon: Cpu },
  { href: "/inference", label: "Inference Economics", icon: Gauge },
  { href: "/training", label: "Training Economics", icon: GraduationCap },
  { href: "/fine-tuning", label: "Fine-Tuning Economics", icon: SlidersHorizontal },
  { href: "/reinforcement-learning", label: "Reinforcement Learning", icon: Repeat },
  { href: "/ai-factory", label: "AI Factory Simulator", icon: Factory },
  { href: "/monitoring", label: "Monitoring & Telemetry", icon: Activity },
  { href: "/tools", label: "Cost Measurement Tools", icon: Wrench },
  { href: "/trends", label: "Market Trends", icon: TrendingUp },
  { href: "/methodology", label: "Data Sources & Methodology", icon: BookOpen },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-panel-2 hover:text-text",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 px-2.5">
      <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-accent to-violet text-[11px] font-bold text-white">AE</span>
      <span className="text-sm font-semibold tracking-tight">AI Economics</span>
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : true;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="grid size-8 place-items-center rounded-md border border-border bg-panel-2 text-muted hover:text-text"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function CurrencyToggle() {
  const { currency, setCurrency, usdPerEur, rateDate } = useCurrency();
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Display currency" className="flex rounded-md border border-border bg-panel-2 p-0.5">
        {(["USD", "EUR"] as const).map((c) => (
          <button
            key={c}
            type="button"
            disabled={c === "EUR" && !usdPerEur}
            onClick={() => setCurrency(c)}
            aria-pressed={currency === c}
            className={cn("rounded px-2 py-1 text-[11px] font-semibold", currency === c ? "bg-panel text-text shadow-sm" : "text-muted")}
          >
            {c}
          </button>
        ))}
      </div>
      {currency === "EUR" && usdPerEur && (
        <span className="hidden text-[11px] text-faint lg:inline" title="ECB euro reference rate">
          ECB {rateDate}: 1 EUR = {usdPerEur} USD
        </span>
      )}
    </div>
  );
}

export function Shell({ children, freshness }: { children: ReactNode; freshness: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-5 border-r border-border bg-panel px-3 py-4 lg:flex">
        <Logo />
        <NavLinks />
        <div className="mt-auto px-2.5 text-[11px] leading-4 text-faint">
          Published prices, measurements and modeled estimates are labelled separately.
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-5 overflow-y-auto border-r border-border bg-panel px-3 py-4">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="grid size-8 place-items-center rounded-md hover:bg-panel-2">
                <X className="size-4" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" className="grid size-8 place-items-center rounded-md border border-border lg:hidden">
            <Menu className="size-4" />
          </button>
          <div className="min-w-0 flex-1 truncate text-xs text-muted">{freshness}</div>
          <CurrencyToggle />
          <ThemeToggle />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="mx-auto max-w-[1400px] px-4 pb-8 text-[11px] leading-5 text-faint sm:px-6">
          AI Economics · Public API prices are not providers&apos; internal production costs. Modeled estimates depend on stated assumptions.
          Data: LiteLLM (MIT), OpenRouter, Azure Retail Prices, Vast.ai (aggregates), ECB. ·{" "}
          <Link href="/methodology" className="hover:text-text">Methodology</Link> · <Link href="/api-docs" className="hover:text-text">Public API</Link> ·{" "}
          <a href="/feed.xml" className="hover:text-text">Price-change RSS</a>
        </footer>
      </div>
    </div>
  );
}
