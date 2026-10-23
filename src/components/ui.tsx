import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Info } from "lucide-react";

export const cn = (...xs: Parameters<typeof clsx>) => twMerge(clsx(...xs));

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("min-w-0 rounded-xl border border-border bg-panel shadow-sm", className)} {...props} />;
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

const badgeTones = {
  neutral: "border-border bg-panel-2 text-muted",
  accent: "border-transparent bg-accent-soft text-accent",
  violet: "border-transparent bg-violet-soft text-violet",
  pos: "border-transparent bg-[color-mix(in_srgb,var(--pos)_14%,transparent)] text-pos",
  neg: "border-transparent bg-[color-mix(in_srgb,var(--neg)_14%,transparent)] text-neg",
  warn: "border-transparent bg-warn-soft text-warn",
} as const;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Button({ variant = "default", className, ...props }: ComponentProps<"button"> & { variant?: "default" | "primary" | "ghost" }) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:opacity-90",
        variant === "default" && "border border-border bg-panel-2 hover:border-accent/50",
        variant === "ghost" && "hover:bg-panel-2",
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 text-xs font-medium hover:border-accent/50", className)}
      {...props}
    />
  );
}

export const inputClass =
  "h-8 w-full rounded-md border border-border bg-panel-2 px-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none";

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  badge,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("animate-in p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {badge}
      </div>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs leading-5 text-muted">{sub}</p>}
    </Card>
  );
}

export function Note({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "warn"; className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border px-3 py-2 text-xs leading-5",
        tone === "warn" ? "border-warn/30 bg-warn-soft text-text" : "border-border bg-panel-2 text-muted",
        className,
      )}
    >
      <Info className={cn("mt-0.5 size-3.5 shrink-0", tone === "warn" ? "text-warn" : "text-faint")} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-xs leading-5 text-muted">{children}</div>}
    </div>
  );
}

export function Formula({ children }: { children: ReactNode }) {
  return <pre className="num overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-panel-2 p-3 text-[11.5px] leading-5 text-muted">{children}</pre>;
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("text-accent hover:underline", className)}>
      {children}
    </a>
  );
}

export const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-faint whitespace-nowrap";
export const td = "px-3 py-2 align-top";
