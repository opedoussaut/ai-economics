"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Download, ExternalLink as ExtIcon, Search, X } from "lucide-react";
import type { TokenPrices } from "@/lib/data/schemas";
import { computeTokenCost, type ServiceTier, type TokenWorkload } from "@/lib/calc/tokens";
import { fmtDate, fmtNum, fmtTokens } from "@/lib/format";
import { downloadFile, toCsv, useUrlState } from "@/lib/url-state";
import { Money, useCurrency } from "@/components/currency";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Formula, Note, cn, inputClass, td, th } from "@/components/ui";
import { FieldGroup, NumberField, PercentField, SelectField, Toggle } from "@/components/fields";
import { HBarChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";

export interface CatalogRow {
  id: string;
  modelId: string;
  developer: string;
  provider: string;
  channel: string;
  source: string;
  prices: TokenPrices;
  longContext: { thresholdTokens: number; input: number | null; output: number | null; cacheRead?: number | null } | null;
  contextWindow: number | null;
  maxOutput: number | null;
  modalities: string[];
  features: string[];
  webSearch: number | null;
  officialUrl: string | null;
  collectedFrom: string;
  observedAt: string;
  listed: boolean;
  deprecation: string | null;
  confidence: string;
}

const CHANNELS = [
  { value: "all", label: "All channels" },
  { value: "direct", label: "First-party developer APIs" },
  { value: "cloud-platform", label: "Cloud platforms" },
  { value: "third-party-host", label: "Third-party hosts" },
  { value: "reseller", label: "Reseller (OpenRouter)" },
];
const CHANNEL_LABEL: Record<string, string> = { direct: "Direct", "cloud-platform": "Cloud", "third-party-host": "Host", reseller: "Reseller" };

type SortKey = "modelId" | "provider" | "input" | "output" | "cacheRead" | "contextWindow";
const PAGE = 50;

const WORKLOAD_DEFAULTS = {
  prompt: 3000, output: 600, reasoning: 0, reasoningIncl: true, cacheHit: 0.3, cacheWrite: 0.05, rpd: 10000, tier: "standard",
};

export function TokenCatalog({ rows, defaultCompare }: { rows: CatalogRow[]; defaultCompare: string[] }) {
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("all");
  const [developer, setDeveloper] = useState("all");
  const [provider, setProvider] = useState("all");
  const [features, setFeatures] = useState<string[]>([]);
  const [hideFree, setHideFree] = useState(true);
  const [showDelisted, setShowDelisted] = useState(false);
  const [hideDeprecated, setHideDeprecated] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "output", dir: -1 });
  const [page, setPage] = useState(0);
  const [compare, setCompare] = useState<string[]>(defaultCompare);
  const [w, setW] = useUrlState(WORKLOAD_DEFAULTS);
  const { currency } = useCurrency();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("developer")) setDeveloper(p.get("developer")!);
    if (p.get("channel")) setChannel(p.get("channel")!);
    if (p.get("q")) setQ(p.get("q")!);
    if (p.get("compare")) setCompare(p.get("compare")!.split(",").filter((id) => rows.some((r) => r.id === id)).slice(0, 8));
  }, [rows]);

  const developers = useMemo(() => [...new Set(rows.map((r) => r.developer))].sort(), [rows]);
  const providers = useMemo(() => [...new Set(rows.map((r) => r.provider))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (!showDelisted && !r.listed) return false;
      if (hideDeprecated && r.deprecation && r.deprecation <= new Date().toISOString().slice(0, 10)) return false;
      if (channel !== "all" && r.channel !== channel) return false;
      if (developer !== "all" && r.developer !== developer) return false;
      if (provider !== "all" && r.provider !== provider) return false;
      if (hideFree && !((r.prices.input ?? 0) > 0 || (r.prices.output ?? 0) > 0)) return false;
      if (features.some((f) => !r.features.includes(f))) return false;
      if (needle && !`${r.modelId} ${r.developer} ${r.provider}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const val = (r: CatalogRow): number | string =>
      sort.key === "modelId" ? r.modelId : sort.key === "provider" ? r.provider : sort.key === "contextWindow" ? (r.contextWindow ?? -1) : (r.prices[sort.key] ?? -1);
    out.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number)) * sort.dir;
    });
    return out;
  }, [rows, q, channel, developer, provider, features, hideFree, showDelisted, hideDeprecated, sort]);

  useEffect(() => setPage(0), [q, channel, developer, provider, features, hideFree, showDelisted, hideDeprecated]);

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const toggleCompare = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 8 ? c : [...c, id]));
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "modelId" || key === "provider" ? 1 : -1 }));

  const workload: TokenWorkload = {
    promptTokens: w.prompt, outputTokens: w.output, reasoningTokens: w.reasoning, reasoningIncludedInOutput: w.reasoningIncl,
    cacheHitRate: w.cacheHit, cacheWriteRate: w.cacheWrite, requestsPerDay: w.rpd, tier: w.tier as ServiceTier,
  };
  const compared = compare.map((id) => rows.find((r) => r.id === id)).filter((r): r is CatalogRow => !!r);
  const results = compared.map((r) => ({ row: r, res: computeTokenCost({ prices: r.prices, longContext: r.longContext }, workload) }));

  const exportCsv = () =>
    downloadFile(
      `ai-economics-token-prices-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered.map((r) => ({
        offering_id: r.id, model_id: r.modelId, developer: r.developer, provider: r.provider, channel: r.channel, source: r.source,
        input_usd_per_m: r.prices.input, output_usd_per_m: r.prices.output, cache_read_usd_per_m: r.prices.cacheRead ?? "",
        cache_write_usd_per_m: r.prices.cacheWrite ?? "", batch_input_usd_per_m: r.prices.batchInput ?? "", batch_output_usd_per_m: r.prices.batchOutput ?? "",
        context_window: r.contextWindow ?? "", price_observed_at: r.observedAt, listed: r.listed, official_url: r.officialUrl ?? "", collected_from: r.collectedFrom,
      }))),
    );

  const SortTh = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn(th, className)} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 uppercase hover:text-text">
        {children} <ArrowUpDown className="size-3" aria-hidden />
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* ── Workload calculator ─────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Workload cost calculator"
          subtitle={`Compare up to 8 offerings for the same workload. Select models with the checkboxes in the catalogue. Display currency: ${currency}.`}
          actions={<><ValueClassBadge kind="calculated" /><Button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(window.location.search)), compare: compare.join(",") })}`)}>Copy share link</Button></>}
        />
        <CardBody className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-5">
            <FieldGroup title="Per request">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Prompt tokens" value={w.prompt} min={0} onChange={(v) => setW({ prompt: v })} hint="All input incl. cached" />
                <NumberField label="Output tokens" value={w.output} min={0} onChange={(v) => setW({ output: v })} />
                <NumberField label="Reasoning tokens" value={w.reasoning} min={0} onChange={(v) => setW({ reasoning: v })} />
                <NumberField label="Requests / day" value={w.rpd} min={0} onChange={(v) => setW({ rpd: v })} />
              </div>
              <Toggle label="Output count already includes reasoning tokens" checked={w.reasoningIncl} onChange={(v) => setW({ reasoningIncl: v })}
                hint="On for OpenAI-style usage and OTel gen_ai.usage.output_tokens; off if your provider reports reasoning separately." />
            </FieldGroup>
            <FieldGroup title="Caching & tier">
              <PercentField label="Cache hit rate (of prompt tokens)" value={w.cacheHit} onChange={(v) => setW({ cacheHit: Math.min(v, 1 - w.cacheWrite) })} />
              <PercentField label="Cache write rate (of prompt tokens)" value={w.cacheWrite} onChange={(v) => setW({ cacheWrite: Math.min(v, 1 - w.cacheHit) })} />
              <SelectField label="Service tier" value={w.tier} onChange={(v) => setW({ tier: v })} options={[
                { value: "standard", label: "Standard" }, { value: "batch", label: "Batch (async)" }, { value: "priority", label: "Priority" }, { value: "flex", label: "Flex" },
              ]} />
            </FieldGroup>
          </div>
          <div className="min-w-0 space-y-4">
            {results.length === 0 ? (
              <EmptyState title="No offerings selected">Tick models in the catalogue below to compare them.</EmptyState>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr><th className={th}>Offering</th><th className={th}>Per request</th><th className={th}>Per 1K req.</th><th className={th}>Daily</th><th className={th}>Monthly</th><th className={th}>Effective $/1M</th><th className={th} /></tr>
                    </thead>
                    <tbody>
                      {results.map(({ row, res }) => (
                        <tr key={row.id} className="border-b border-border/60 last:border-0">
                          <td className={td}>
                            <div className="font-medium">{row.modelId}</div>
                            <div className="text-[11px] text-muted">{row.provider}{res.ok && res.longContextApplied && <Badge tone="warn" className="ml-1">long-context rate</Badge>}</div>
                          </td>
                          {res.ok ? (
                            <>
                              <td className={td}><Money usd={res.perRequest.toNumber()} digits={6} /></td>
                              <td className={td}><Money usd={res.per1kRequests.toNumber()} /></td>
                              <td className={td}><Money usd={res.daily.toNumber()} /></td>
                              <td className={`${td} font-semibold`}><Money usd={res.monthly.toNumber()} /></td>
                              <td className={td}><Money usd={res.blendedPerMTokens.toNumber()} /></td>
                            </>
                          ) : (
                            <td className={`${td} text-warn`} colSpan={5}>{res.reason}</td>
                          )}
                          <td className={td}>
                            <button type="button" onClick={() => toggleCompare(row.id)} aria-label={`Remove ${row.modelId}`} className="text-faint hover:text-text"><X className="size-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <HBarChart
                  data={results.filter((r) => r.res.ok).map(({ row, res }) => ({ label: row.modelId.slice(0, 28), value: res.ok ? res.monthly.toNumber() : 0 }))}
                  colorByIndex
                />
                {results.some((r) => r.res.ok && r.res.notes.length) && (
                  <Note>{[...new Set(results.flatMap((r) => (r.res.ok ? r.res.notes : [])))].map((n) => <div key={n}>{n}</div>)}</Note>
                )}
              </>
            )}
            <Formula>{`Per-request cost (each token billed once):
  uncached = prompt × (1 − cache_hit − cache_write)  → × input rate
  + prompt × cache_hit                               → × cache-read rate
  + prompt × cache_write                             → × cache-write rate (input rate if none published)
  + visible output = output − reasoning (if output includes reasoning) → × output rate
  + reasoning tokens                                 → × reasoning rate (output rate if none published)
Daily = per request × requests/day;  Monthly = daily × 365/12
Effective $/1M = per-request cost ÷ billed tokens × 1,000,000 (for THIS workload mix only)
Batch/priority/flex use that tier's published rates; unavailable tiers are reported, never substituted.`}</Formula>
          </div>
        </CardBody>
      </Card>

      {/* ── Catalogue ─────────────────────────────────── */}
      <Card>
        <CardHeader
          title={`Catalogue · ${filtered.length.toLocaleString("en-US")} offerings`}
          subtitle="USD per 1M tokens. Click headers to sort. Tick up to 8 rows to compare."
          actions={<Button onClick={exportCsv}><Download className="size-3.5" /> CSV</Button>}
        />
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block sm:col-span-2 lg:col-span-1">
            <span className="sr-only">Search models</span>
            <Search className="pointer-events-none absolute left-2 top-2 size-4 text-faint" />
            <input className={cn(inputClass, "pl-8")} placeholder="Search model, developer, provider…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select aria-label="Channel" className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select aria-label="Model developer" className={inputClass} value={developer} onChange={(e) => setDeveloper(e.target.value)}>
            <option value="all">All developers</option>
            {developers.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label="API provider" className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">All API providers</option>
            {providers.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-4">
            {["reasoning", "tools", "vision", "caching", "batch"].map((f) => (
              <label key={f} className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={features.includes(f)} onChange={() => setFeatures((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]))} />
                {f}
              </label>
            ))}
            <span className="h-4 w-px bg-border" />
            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={hideFree} onChange={(e) => setHideFree(e.target.checked)} /> hide zero-priced</label>
            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={hideDeprecated} onChange={(e) => setHideDeprecated(e.target.checked)} /> hide past deprecation date</label>
            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={showDelisted} onChange={(e) => setShowDelisted(e.target.checked)} /> include delisted</label>
          </div>
        </div>
        {filtered.length === 0 ? (
          <CardBody><EmptyState title="No offerings match these filters" /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="catalog-table">
              <thead className="border-b border-border bg-panel-2/50">
                <tr>
                  <th className={th}><span className="sr-only">Compare</span></th>
                  <SortTh k="modelId">Model</SortTh>
                  <SortTh k="provider">Provider</SortTh>
                  <SortTh k="input" className="text-right">Input</SortTh>
                  <SortTh k="output" className="text-right">Output</SortTh>
                  <SortTh k="cacheRead" className="text-right">Cache read</SortTh>
                  <th className={cn(th, "text-right")}>Cache write</th>
                  <th className={cn(th, "text-right")}>Batch in/out</th>
                  <SortTh k="contextWindow" className="text-right">Context</SortTh>
                  <th className={th}>Source</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className={cn("border-b border-border/60 last:border-0 hover:bg-panel-2/60", !r.listed && "opacity-60")}>
                    <td className={td}>
                      <input type="checkbox" aria-label={`Compare ${r.modelId}`} checked={compare.includes(r.id)} onChange={() => toggleCompare(r.id)} />
                    </td>
                    <td className={cn(td, "max-w-[280px]")}>
                      <div className="truncate font-medium" title={r.modelId}>{r.modelId}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted">
                        {r.developer}
                        {r.features.includes("reasoning") && <Badge>reasoning</Badge>}
                        {r.modalities.includes("image") && <Badge>vision</Badge>}
                        {!r.listed && <Badge tone="warn">delisted</Badge>}
                        {r.deprecation && <Badge tone="warn" title="Deprecation date recorded upstream">depr. {r.deprecation}</Badge>}
                      </div>
                    </td>
                    <td className={td}>
                      <div>{r.provider}</div>
                      <Badge tone={r.channel === "reseller" ? "violet" : r.channel === "direct" ? "accent" : "neutral"}>{CHANNEL_LABEL[r.channel]}</Badge>
                    </td>
                    <td className={cn(td, "text-right")}><Money usd={r.prices.input} /></td>
                    <td className={cn(td, "text-right")}><Money usd={r.prices.output} /></td>
                    <td className={cn(td, "text-right text-muted")}>{r.prices.cacheRead != null ? <Money usd={r.prices.cacheRead} /> : "—"}</td>
                    <td className={cn(td, "text-right text-muted")}>{r.prices.cacheWrite != null ? <Money usd={r.prices.cacheWrite} /> : "—"}</td>
                    <td className={cn(td, "text-right text-muted")}>{r.prices.batchInput != null ? <><Money usd={r.prices.batchInput} /> / <Money usd={r.prices.batchOutput} /></> : "—"}</td>
                    <td className={cn(td, "num text-right text-muted")}>
                      {fmtTokens(r.contextWindow)}
                      {r.longContext && <div className="text-[10px] text-warn" title="Higher rates above this prompt size">tier &gt;{fmtTokens(r.longContext.thresholdTokens)}</div>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-[11px]")}>
                      {r.officialUrl && <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={r.officialUrl} target="_blank" rel="noopener noreferrer">official <ExtIcon className="size-3" /></a>}
                      <div className="text-faint">via {r.source === "litellm" ? "LiteLLM" : "OpenRouter"}</div>
                      <div className="text-faint" title="When the current price was first observed">since {fmtDate(r.observedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
          <span>Showing {filtered.length ? page * PAGE + 1 : 0}–{Math.min(filtered.length, (page + 1) * PAGE)} of {fmtNum(filtered.length, 0)}</span>
          <div className="flex gap-2">
            <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
