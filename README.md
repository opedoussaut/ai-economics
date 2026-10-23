# AI Economics

Frequently updated intelligence on the economics of artificial intelligence: published API token prices, GPU rental prices, inference / training / fine-tuning / RL cost models, an AI-factory financial simulator, a directory of cost-measurement tools, and a private monitoring area that turns real telemetry into calculated costs.

**Live:** https://ai-economics-beta.vercel.app (Vercel; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))

Every economic value is labelled as one of **Published price · Measured usage · Calculated cost · Modeled estimate · Billed cost · Benchmark**. Nothing is invented: failed sources keep their last verified snapshot and are flagged stale, missing history shows an *insufficient data* state, and no telemetry is shown unless a real source is connected.

## What's inside

| Area | Route | Data |
|---|---|---|
| Overview dashboard | `/` | KPIs, price trend, input-vs-output scatter, GPU ranges, recent changes, source health |
| Token pricing | `/token-pricing` | ~2,000 offerings (LiteLLM map + OpenRouter), filters, CSV, compare up to 8, workload calculator with cache/reasoning/batch tiers |
| GPU pricing | `/gpu-pricing` | Azure Retail Prices API (265 VM×region list prices) + Vast.ai marketplace statistics |
| Inference economics | `/inference` | Self-host vs API, rented vs owned, break-even utilization, sensitivity |
| Training economics | `/training` | 6ND estimate mode, measured-run mode, cost attribution methods |
| Fine-tuning | `/fine-tuning` | Full / LoRA / QLoRA / managed API comparison |
| Reinforcement learning | `/reinforcement-learning` | PPO, GRPO, RLOO, online agent RL, DPO, reward modelling |
| AI factory simulator | `/ai-factory` | CAPEX/OPEX/TCO, capacity, margin, payback, scenarios |
| Monitoring & telemetry | `/monitoring`, `/monitoring/live` | Prometheus, vLLM, DCGM, MLflow, OTLP GenAI (live view requires sign-in) |
| Cost measurement tools | `/tools`, `/tools/[slug]` | 29 curated tools, filterable by workload, cost capability, licence |
| Market trends | `/trends` | Population medians (backfilled 18 months), per-model price histories |
| Sources & methodology | `/methodology` | Source health, refresh jobs, all conventions |
| Public API / RSS | `/api-docs`, `/api/v1/*`, `/feed.xml` | JSON/CSV datasets, price-change feed |

Stack: Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · Recharts · Zod · decimal.js · Drizzle ORM (PostgreSQL / embedded PGlite) · Vitest · Playwright · GitHub Actions.

## Run locally on Windows (PowerShell)

Requirements: Node.js ≥ 20.9 (tested with Node 24) and Git. Docker is optional.

```powershell
cd E:\users\opt2.ai\NOVA\ai-economics
npm install
```

The repository already contains a data snapshot, so the site works immediately. To fetch fresh public data:

```powershell
npm run refresh                        # all sources
npm run refresh -- litellm openrouter  # selected sources: litellm openrouter azure vast ecb-fx
```

Start the development server and open http://localhost:3000:

```powershell
npm run dev
```

### Environment (optional)

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

No variable is needed for the public portal. See the table below for what each feature requires.

### Database

Private telemetry (workload runs, OTLP token usage) uses PostgreSQL through Drizzle:

* **No setup (default):** with `DATABASE_URL` unset, an embedded PGlite database is created in `.data\pglite` and migrations run automatically.
* **Docker:** `docker compose up -d`, then
  ```powershell
  $env:DATABASE_URL = "postgres://aie:aie@localhost:5432/aie"
  npm run db:migrate
  ```
* **Hosted PostgreSQL** (Neon, Supabase, RDS, Azure Database for PostgreSQL…): set `DATABASE_URL` to its connection string and run `npm run db:migrate`.

`npm run db:import` mirrors the public file datasets (offerings, price observations, GPU offerings, tools) into the database. `npm run db:generate` creates a new migration after editing `src/lib/db/schema.ts`.

### Tests and production build

```powershell
npm run lint
npm run typecheck
npm test                         # Vitest unit + adapter integration tests
npm run build
npx playwright install chromium  # first time only
npm run test:e2e                 # Playwright against the production build (port 3200)
npm start                        # serve the production build on :3000
```

Stop any running `npm run dev` before `npm run build`: both write to `.next`.

### Data maintenance commands

```powershell
npm run refresh                          # collect public prices (idempotent)
npm run backfill:litellm -- --months 18  # rebuild history from LiteLLM Git revisions
npm run check:links                      # verify tool-directory links
```

## Which features need credentials

| Feature | Requires |
|---|---|
| All public pages, calculators, tools directory, public API, RSS | nothing |
| Data refresh (`npm run refresh`, scheduled workflow) | nothing (public, unauthenticated sources) |
| LiteLLM history backfill | optional `GITHUB_TOKEN` (higher rate limit) |
| Private live view `/monitoring/live` | `ADMIN_TOKEN`, `SESSION_SECRET` (≥ 32 chars) |
| OTLP GenAI ingestion | `INGEST_TOKEN` |
| Prometheus / vLLM / DCGM live metrics | `PROMETHEUS_URL` and/or `VLLM_METRICS_URL`, `DCGM_EXPORTER_URL` |
| MLflow run metrics | `MLFLOW_TRACKING_URI` (+ `MLFLOW_TRACKING_TOKEN`) |
| PostgreSQL instead of PGlite | `DATABASE_URL` |
| Benchmark price/performance | `ARTIFICIAL_ANALYSIS_API_KEY` + licence (adapter not implemented; shown as not connected) |

## Automated freshness

GitHub Actions (`.github/workflows/`):

* `refresh-data.yml` — token prices + Azure every 6 h, Vast.ai every 3 h, ECB FX on business days; commits changed files under `data/`.
* `link-check.yml` — weekly tool-link verification.
* `ci.yml` — lint, typecheck, unit tests, build, E2E on pushes and PRs.

Scheduled workflows need *Settings → Actions → General → Workflow permissions → Read and write*. Deploying on a platform that rebuilds on push (e.g. Vercel) republishes the site after each data commit.

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, data flow, storage, security
* [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) — every source, method, terms, cadence, gaps
* [docs/METHODOLOGY.md](docs/METHODOLOGY.md) — value classes, formulas, conventions, limitations
* [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — connecting Prometheus, vLLM, DCGM, MLflow, OTel, Langfuse, LiteLLM
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel (current hosting), environment variables, database, self-hosting

## Disclaimer

Public API prices are what customers are charged, not providers' internal production costs. Modeled outputs depend entirely on stated assumptions. Verify prices against the linked official pages before making purchasing decisions.
