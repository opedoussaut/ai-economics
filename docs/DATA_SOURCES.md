# Data sources

Verified reachable and parsed on 2026-10-23. Cadences are collection targets, not guarantees of upstream freshness.

## Automated

| Source | Dataset | Method | Endpoint | Auth | Cadence / stale after | Terms & notes |
|---|---|---|---|---|---|---|
| LiteLLM model price map | Token prices | Aggregator feed (JSON) | `raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` | none | 6 h / 36 h | MIT licence. Community-maintained; most entries carry the provider's official pricing URL (`source`), which we display. Includes direct APIs, cloud platforms and third-party hosts. |
| OpenRouter | Token prices (reseller) | Reseller API | `openrouter.ai/api/v1/models` | none | 6 h / 36 h | OpenRouter's own offered prices; kept in a separate `reseller` channel and never merged with direct prices. Variable-priced routers (−1) skipped. |
| Azure Retail Prices API | GPU VM list prices | Official API | `prices.azure.com/api/retail/prices` | none | 6 h / 48 h | Linux pay-as-you-go, spot, 1-yr and 3-yr reservations for 11 GPU VM sizes across all regions (H100, H200, A100, MI300X, GB200). Reservation rows are term totals, amortised per hour. Windows, DevTest and low-priority rows excluded. |
| Vast.ai search API | GPU marketplace | Marketplace API | `console.vast.ai/api/v0/bundles/` | none | 3 h / 24 h | Documented at vast.ai/developers/api. Verified, rentable, on-demand offers for 15 GPU models. Only aggregate statistics are republished (min, P25, median, P75, max, count; ≥ 3 offers required). |
| ECB reference rates | FX | Official XML | `ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` | none | daily / 96 h | For EUR display only; "for information purposes". |
| LiteLLM Git history | Historical token prices | GitHub API + raw files | `api.github.com/repos/BerriAI/litellm/commits` | optional `GITHUB_TOKEN` | manual (`npm run backfill:litellm`) | One revision per month; observations dated by commit date (not provider effective date). |

### LiteLLM providers ingested

First-party developer APIs: OpenAI, Anthropic, Google Gemini API, Mistral AI, DeepSeek, xAI, Moonshot AI, Z.ai, Alibaba Model Studio, MiniMax, Cohere, AI21, Perplexity.
Cloud platforms: Google Vertex AI, Amazon Bedrock (Converse, non-regional IDs), Azure AI Foundry, Azure OpenAI.
Third-party hosts: Together AI, Fireworks AI, Groq, DeepInfra, Cerebras, SambaNova, Nebius, Lambda, Novita, Hyperbolic, Baseten.

Only `mode: chat` entries with both input and output prices are kept; regional duplicates (`us.`, `eu.`, `/global/` …) are skipped. The developer is inferred from the model name; a developer API serving another developer's model (e.g. a GLM model on Mistral) is classified as a third-party host, not first-party.

## Not automated (and why)

| Provider | Reason | What we do |
|---|---|---|
| OpenAI / Anthropic / Google official pricing pages | HTML pages; scraping is brittle and not a supported interface | Link each price to the official page for verification (via LiteLLM `source`) |
| AWS EC2 | Price List bulk files are multi-GB; Query API needs AWS credentials | Link out |
| Google Cloud GPUs | Cloud Billing Catalog API requires an API key | Link out |
| RunPod, Lambda | Pricing APIs need account keys | Link out |
| CoreWeave | No public price API | Link out |
| Artificial Analysis | Licensed API (key + terms) | Registered as *not connected*; no benchmark data shown |

## Change handling

* Price change → history row + `price-change` event per field; visible in the Overview feed and `/feed.xml`.
* Missing from a successful fetch → `delisted` (kept 90 days with last verified price).
* Reappears → `relisted`.
* Fetch/validation failure → last snapshot kept; `source-health.json` records error and consecutive failures; UI badge shows *failing* then *stale*.

## Population statistics

`history/daily-index.jsonl` stores unweighted statistics per population and date: `token:direct`, `token:third-party-host`, `token:cloud-platform`, `token:openrouter` (input and output), `gpu:<family>:cloud-list` and `gpu:<family>:marketplace` (per-GPU-hour). Zero-priced (free/promotional) offerings and populations under 5 members are excluded.
