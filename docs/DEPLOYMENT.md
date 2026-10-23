# Deployment

AI Economics is a standard Next.js 15 app. The public portal needs no environment variables or database; private telemetry needs PostgreSQL on serverless hosts.

## Current deployment

| | |
|---|---|
| Production URL | https://ai-economics-beta.vercel.app |
| Platform | Vercel (project `ai-economics`) |
| Created | 2026-10-23 with `vercel deploy --temporary` (Vercel CLI 65.2.0) — no account was logged in |
| Verified | all public routes return 200; `/monitoring/live` redirects to sign-in; `/api/telemetry/live` returns 401; `/api/v1/token-prices` serves 1,979 offerings |
| Git integration | **not connected** — this deployment does not update automatically yet |
| Environment variables | none set (public portal only; private monitoring disabled) |

A temporary deployment belongs to a temporary Vercel identity held by the CLI on the machine that created it (`%APPDATA%\com.vercel.cli`). To keep it, sign in from the same machine and directory and attach the project to your account, or simply create a permanent project as below (recommended) and delete the temporary one.

## Permanent Vercel setup (recommended)

1. **Create/sign in to a Vercel account** at https://vercel.com (GitHub login is simplest).
2. **Import the repository:** *Add New → Project → Import* `opedoussaut/ai-economics`. Vercel detects Next.js and uses `vercel.json` (`npm ci`, `npm run build`). Keep the root directory as `/`.
3. **Deploy.** The public portal works immediately.
4. **Automatic freshness:** with the Git integration connected, every push to `main` redeploys — including the data commits made by `.github/workflows/refresh-data.yml` (every 3–6 h). Enable *Settings → Actions → General → Workflow permissions → Read and write* in the GitHub repository so the workflow can commit.
5. Optional: add a custom domain under *Project → Settings → Domains* and set `PUBLIC_SITE_URL` to it (used in the RSS feed).

Equivalent CLI flow (PowerShell, from `E:\users\opt2.ai\NOVA\ai-economics`):

```powershell
npx vercel login
npx vercel link          # choose your account and the ai-economics project (or create one)
npx vercel git connect   # connect the GitHub repository for automatic deploys
npx vercel deploy --prod
```

## Enabling private monitoring on Vercel

Serverless functions have a read-only, per-instance filesystem, so the embedded PGlite fallback is **disabled on Vercel**. Without `DATABASE_URL` the live view still reads Prometheus/vLLM/DCGM/MLflow, but workload runs and OTLP token usage cannot be stored (the UI says so; OTLP returns 503).

1. **Provision PostgreSQL**, e.g. Vercel Marketplace → Neon (adds `DATABASE_URL` automatically), or any hosted Postgres (Supabase, RDS, Azure Database for PostgreSQL). Prefer a pooled connection string for serverless.
2. **Run migrations** once from your machine:
   ```powershell
   $env:DATABASE_URL = "<connection string>"
   npm run db:migrate
   npm run db:import     # optional: mirror public datasets into SQL
   ```
   Migrations also run automatically on the first database request.
3. **Set environment variables** (*Project → Settings → Environment Variables*, Production):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_TOKEN` | sign-in token for `/monitoring/live` |
| `SESSION_SECRET` | ≥ 32 random characters, signs the session cookie |
| `INGEST_TOKEN` | bearer token for `POST /api/ingest/otlp/v1/traces` |
| `PROMETHEUS_URL`, `PROMETHEUS_BEARER_TOKEN` | read-only Prometheus |
| `VLLM_METRICS_URL`, `DCGM_EXPORTER_URL` | direct scrapes |
| `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_TOKEN` | MLflow REST |
| `TELEMETRY_POLL_SECONDS` | live view polling interval |
| `PUBLIC_SITE_URL` | canonical URL for the RSS feed |

Redeploy after changing variables. Telemetry endpoints must be reachable **from Vercel's network** — private cluster addresses (e.g. `http://10.x.x.x:9090`) are not. Expose them through an authenticated gateway or tunnel, or self-host AI Economics inside your network (below).

## How data reaches the deployment

Public datasets live in `data/` and are bundled with each build (`outputFileTracingIncludes` in `next.config.ts`). Pages revalidate every 5 minutes, but new prices appear only after a new deployment, which the Git integration triggers on each data commit. The scheduled workflow, not Vercel, does the collecting; no Vercel Cron Job is needed.

## Self-hosting (Node server, any OS)

```powershell
npm ci
npm run build
$env:PORT = "3000"; npm start
```

Here the embedded PGlite database works (data in `.data\pglite`), or set `DATABASE_URL`. Run `npm run refresh` on a schedule (Windows Task Scheduler / cron), then rebuild and restart — or keep the GitHub workflow and `git pull && npm run build` after each data commit. Put the app behind HTTPS (reverse proxy) so the session cookie is sent with `Secure`.

## Security headers

`vercel.json` adds `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, and `noindex` for the live view. Deployment Protection applies to preview URLs only; the production alias is public by design.
