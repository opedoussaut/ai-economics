"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { COST_CAPABILITY, TOOL_CATEGORIES, WORKLOADS, type Tool, type Workload } from "@/lib/tools";
import { Badge, Card, EmptyState, cn, inputClass } from "@/components/ui";

const LICENSES = { "open-source": "Open source", "open-core": "Open core", commercial: "Commercial", "proprietary-free": "Free (proprietary)", specification: "Open standard" } as const;

export function ToolDirectory({ tools, broken }: { tools: Tool[]; broken: string[] }) {
  const [q, setQ] = useState("");
  const [workload, setWorkload] = useState<Workload | "all">("all");
  const [category, setCategory] = useState("all");
  const [cost, setCost] = useState("all");
  const [license, setLicense] = useState("all");
  const [live, setLive] = useState(false);
  const [integrated, setIntegrated] = useState(false);

  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("workload");
    if (w && w in WORKLOADS) setWorkload(w as Workload);
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return tools.filter(
      (t) =>
        (workload === "all" || t.workloads.includes(workload)) &&
        (category === "all" || t.category === category) &&
        (cost === "all" || (cost === "measures-only" ? t.costCapability === "none" : t.costCapability === cost)) &&
        (license === "all" || t.licenseType === license) &&
        (!live || t.liveMonitoring) &&
        (!integrated || t.aieIntegration !== "none") &&
        (!n || `${t.name} ${t.summary} ${t.measures.join(" ")} ${t.integrations.join(" ")}`.toLowerCase().includes(n)),
    );
  }, [tools, q, workload, category, cost, license, live, integrated]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Workload type">
        {(["all", ...Object.keys(WORKLOADS)] as (Workload | "all")[]).map((w) => (
          <button key={w} type="button" aria-pressed={workload === w} onClick={() => setWorkload(w)}
            className={cn("rounded-full border px-3 py-1 text-xs", workload === w ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-text")}>
            {w === "all" ? "All workloads" : WORKLOADS[w]}
          </button>
        ))}
      </div>
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative block lg:col-span-2">
          <span className="sr-only">Search tools</span>
          <Search className="pointer-events-none absolute left-2 top-2 size-4 text-faint" />
          <input className={cn(inputClass, "pl-8")} placeholder="Search tools, metrics, integrations…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label="Category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {Object.entries(TOOL_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Cost capability" className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)}>
          <option value="all">Any cost capability</option>
          <option value="measures-only">Actual measurement only</option>
          <option value="estimated">Estimated monetary cost</option>
          <option value="billing">Actual billing integration</option>
        </select>
        <select aria-label="License" className={inputClass} value={license} onChange={(e) => setLicense(e.target.value)}>
          <option value="all">Any license</option>
          {Object.entries(LICENSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex flex-wrap gap-4 text-xs text-muted lg:col-span-5">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> supports live monitoring</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={integrated} onChange={(e) => setIntegrated(e.target.checked)} /> integrates with AI Economics</label>
        </div>
      </Card>
      <p className="text-xs text-muted" aria-live="polite" data-testid="tool-count">{filtered.length} of {tools.length} tools</p>
      {filtered.length === 0 ? (
        <EmptyState title="No tools match these filters" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" data-testid="tool-grid">
          {filtered.map((t) => (
            <Link key={t.slug} href={`/tools/${t.slug}`} className="group animate-in">
              <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-accent/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold group-hover:text-accent">{t.name}</h3>
                    <p className="text-[11px] text-faint">{TOOL_CATEGORIES[t.category]}</p>
                  </div>
                  <Badge tone={t.licenseType === "open-source" ? "pos" : t.licenseType === "commercial" ? "neutral" : "accent"}>{LICENSES[t.licenseType]}</Badge>
                </div>
                <p className="mt-2 flex-1 text-xs leading-5 text-muted">{t.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge tone={t.costCapability === "none" ? "neutral" : t.costCapability === "billing" ? "pos" : "violet"}>
                    {t.costCapability === "none" ? "Measures only" : COST_CAPABILITY[t.costCapability]}
                  </Badge>
                  {t.liveMonitoring && <Badge>Live</Badge>}
                  {t.aieIntegration === "adapter" && <Badge tone="accent">AIE adapter</Badge>}
                  {t.aieIntegration === "documented" && <Badge tone="accent">AIE guide</Badge>}
                  {t.caveats && <Badge tone="warn">see caveats</Badge>}
                  {broken.includes(t.slug) && <Badge tone="neg">link check failed</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
