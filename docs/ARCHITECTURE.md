# Architecture

## Overview

```
                ┌──────────────── GitHub Actions (cron) ────────────────┐
                │ npm run refresh → adapters → validate → merge → write │
                └───────────────┬───────────────────────────────────────┘
                                │ git commit data/**
   upstream APIs ───────────────┘
   (LiteLLM map, OpenRouter,          data/ (versioned public datasets)
    Azure Retail Prices, Vast.ai,      ├─ snapshots/*.json   current state
    ECB)                               ├─ history/*.jsonl    append-only, hash-deduplicated
                                       ├─ changes.json       change events
                                       ├─ source-health.json refresh jobs & status
                                       └─ curated/           tools.json, link-check.json
                                                │
                                    Next.js server (RSC, ISR 5 min)
                                                │
   private telemetry sources ──► /api/telemetry/* (admin session) ──► PostgreSQL / PGlite
   (Prometheus, vLLM, DCGM,       /api/ingest/otlp/v1/traces (bearer)    (runs, usage samples)
    MLflow, OTLP pushes)
```

## Why two stores

* **Public datasets as versioned files ("git scraping").** Prices are small, public and change rarely. Storing them as JSON/JSONL in the repository makes every change auditable in Git history, needs no database for the public site, survives on any static/serverless host, and lets the scheduled job run without credentials. The history log is append-only and idempotent (a row is written only when the hash of an offering's price fields changes).
* **PostgreSQL for private operational data.** Workload runs, token-usage samples, hardware samples, allocations and alerts are private, write-heavy and relational. Drizzle schema in `src/lib/db/schema.ts`; migrations in `drizzle/`. Locally, embedded PGlite (Postgres compiled to WASM) removes the Docker requirement on Windows; production uses `DATABASE_URL`. `npm run db:import` mirrors the public datasets into the same schema (`model_offering`, `pricing_observation`, `gpu_offering`, `infrastructure_cost_observation`, `tool`) for SQL analysis.

## Code map

| Path | Responsibility |
|---|---|
| `src/lib/types.ts` | Value classes, collection methods |
| `src/lib/money.ts` | decimal.js helpers, unit constants, FX conversion |
| `src/lib/data/schemas.ts` | Zod schemas for every dataset file |
| `src/lib/data/files.ts` | Atomic JSON writes, JSONL append/read |
| `src/lib/data/sources.ts` | Source registry: method, cadence, stale threshold, terms |
| `src/lib/data/freshness.ts` | fresh / failing / stale / never / not-configured |
| `src/lib/data/store.ts` | Request-cached server readers used by pages |
| `src/lib/ingest/http.ts` | Timeouts, retries with backoff, Retry-After, User-Agent |
| `src/lib/ingest/adapters/*` | One adapter per source: fetch + validate + normalise |
| `src/lib/ingest/merge.ts` | Idempotent merge, change detection, delisting |
| `src/lib/ingest/indexer.ts` | Daily population statistics (upsert per day) |
| `src/lib/ingest/run.ts` | Orchestrator; records health and jobs; never replaces data on failure |
| `src/lib/calc/*` | Token, hardware, inference, training, fine-tune, RL, factory, allocation models |
| `src/lib/telemetry/*` | Prometheus text parser & query client, vLLM/DCGM mappings, OTLP extraction, MLflow client, run economics |
| `src/lib/auth.ts`, `src/middleware.ts` | HMAC-signed admin session; protects `/monitoring/live` and `/api/telemetry/*` |
| `src/app/**` | Pages (server components) with client calculators/tables |
| `scripts/*` | `refresh`, `backfill-litellm`, `check-links`, `db-migrate`, `db-import` |

## Core entities

Provider, Model, ModelOffering, PricingObservation, PricingTier, GPUSKU, GPUOffering, InfrastructureCostObservation, BenchmarkObservation, Source, DataRefreshJob, Tool, Integration, Workload, WorkloadRun, HardwareSample, TokenUsageSample, CostAllocation, TrainingStepSample, Alert — all defined in the Drizzle schema; the public subset also exists as Zod-validated files.

Conventions: UTC ISO-8601 timestamps; money as NUMERIC(20,10) in SQL and Decimal in code; original currency kept (all current sources publish USD); observed time vs effective date stored separately (effective date is usually unknown and left null rather than guessed); confidence recorded per offering.

## Rendering

Pages read datasets on the server and are statically generated with 5-minute revalidation; calculators are client components whose state is serialised to the URL (shareable scenarios). Monitoring pages are dynamic and never cached.

## Security

* Integration endpoints and secrets come only from server environment variables; the UI shows only *configured / not connected*.
* `/monitoring/live` and `/api/telemetry/*` require a signed, httpOnly, SameSite=strict session (12 h). Login compares tokens in constant time; server actions re-verify the session.
* OTLP ingestion requires a bearer token, accepts JSON only, caps payloads at 5 MB, and reads an allow-list of usage attributes — prompt/completion content is never parsed into storage.
* Prometheus access is read-only (`GET /api/v1/query`). MLflow access reads runs and metric history only (params/tags not exposed).
* No secrets in workflows: data refresh uses only public endpoints.
