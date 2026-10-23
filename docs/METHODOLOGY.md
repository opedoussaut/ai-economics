# Methodology

## 1. Value classes

| Class | Meaning | Example on this site |
|---|---|---|
| Published price | Provider's documented public list price | $/1M tokens in the catalogue; Azure on-demand VM price |
| Measured usage | Directly observed | vLLM token counters, DCGM power/energy, OTel span token counts |
| Calculated cost | Measurement × documented price or allocation rule | Run cost to date = GPUs × elapsed h × rate; OTLP usage × matched price |
| Modeled estimate | Output of adjustable assumptions | All calculators |
| Billed cost | Reconciled against an invoice/billing API | Not available (no billing integration connected) |
| Benchmark | Independent measurement under documented conditions | Not available (no licensed feed connected) |

Public API prices are not providers' production costs; modeled self-hosting costs are not estimates of any company's costs.

## 2. Token pricing

All prices are USD per 1M tokens, converted from per-token values with decimal arithmetic (e.g. 2.8e-7 → 0.28 exactly).

Per-request cost (each token billed once):

```
prompt = uncached + cache_read + cache_write
cost  = uncached × input + cache_read × cache_read_rate + cache_write × cache_write_rate
      + visible_output × output + reasoning × reasoning_rate
visible_output = output − reasoning   if usage output already includes reasoning (OpenAI usage; OTel)
               = output               otherwise
```

* Missing cache-write price → input rate (noted). Missing cache-read price with a non-zero hit rate → error, not substitution.
* Batch/priority/flex use that tier's published rates; unpublished tiers are reported as unavailable.
* Long-context tiers (e.g. > 200K prompt tokens) apply to the whole request, as providers bill them.
* Daily = per request × requests/day; monthly = daily × 365/12.
* Blended $/1M = per-request cost ÷ billed tokens for the stated workload, or input/output prices weighted by an explicit ratio. Always state the mix.

## 3. GPU prices

Per-GPU-hour = instance price ÷ GPU count. Full-instance prices include vCPUs, RAM, local storage and networking, so normalised values are comparable only with that caveat (shown per row). Reserved prices are term totals ÷ (years × 8,760). Marketplace per-GPU = offer `dph_total` ÷ GPUs in offer (includes the host's CPU/RAM share and default disk; excludes bandwidth).

## 4. Hardware cost per GPU-hour

```
owned:  depreciation = (gpu + server/network − residual) ÷ (life × 8760)
        capital      = [capex − PV(residual)] × CRF(rate, life) ÷ 8760 − depreciation
        electricity  = (GPU W + host W)/1000 × PUE × $/kWh
        maintenance  = capex × maint% ÷ 8760 ; + colocation
rented: rental + (electricity ONLY if the contract excludes it) + storage/bandwidth + software/ops
```

## 5. Inference (phase-time allocation)

```
GPU-s/request   = uncached_input ÷ prefill_rate + output ÷ decode_rate
$/productive s  = $/GPU-h ÷ (3600 × utilization)
$/1M output     = $/productive s ÷ decode_rate × 1e6
$/1M input      = $/productive s ÷ prefill_rate × 1e6
blended         = cost/request ÷ (input + output) × 1e6
break-even util = $/GPU-h × GPU-s/request ÷ (3600 × revenue/request)
energy/1M out   = kWh/GPU-h ÷ (decode_rate × 3600 × utilization) × 1e6
```

Rates are aggregate per-GPU throughputs measured or assumed at a given concurrency, batch size and quantization — those settings are recorded but not used to derive throughput. Prefill and decode are treated as non-overlapping (conservative); prefix-cached tokens skip prefill. Rented cost does not fall with lower utilization.

## 6. Training

```
processed tokens = unique dataset tokens × epochs
FLOPs ≈ 6 × N × processed tokens           (dense; N = active params for MoE; excludes attention FLOPs)
compute h = FLOPs ÷ (GPUs × peak × MFU) ÷ 3600 ; wall-clock = compute ÷ goodput
GPU-h = wall-clock × GPUs ; steps = ceil(processed ÷ global batch tokens)
fully loaded = compute + evaluation + checkpoint storage + dataset storage
```

Peak TFLOPS presets are vendor-datasheet dense BF16 values (user-editable). MFU and goodput are assumptions unless measured. Measured mode multiplies measured GPU-hours by the rate (calculated) and extrapolates cost/step to planned steps (forecast).

## 7. Fine-tuning

FLOPs/token ≈ 6N (full), ≈ 4N (LoRA, QLoRA). Resident memory lower bound ≈ 16 B/param (full, mixed-precision AdamW), 2 B/param (LoRA bf16 base), 0.55 B/param (QLoRA 4-bit); activations excluded. QLoRA applies a 0.7× MFU factor for de-quantisation. Validation ≈ 2N FLOPs/token. Managed API = price per 1M training tokens × tokens × epochs + fees (price entered by the user from the provider page). Techniques are not assumed to reach equal quality.

## 8. Reinforcement learning

Online methods (PPO, GRPO, RLOO, online agent RL) per step: rollout generation (decode + prefill), scoring (reward-model GPU, judge API tokens or verifier CPU), reference-model forward (KL), value model (PPO only), policy fwd+bwd, environment/tool calls, plus checkpoint and eval amortised per step. GPU components are divided by (1 − idle fraction) for synchronisation time. DPO and reward-model training are offline: no rollouts, two sequences per preference pair. Cost per successful trajectory = total ÷ (rollouts × success rate).

## 9. AI factory

IT load = GPUs × (GPU W + host W); facility = IT × PUE (energy at full deployed draw). CAPEX = GPUs × (unit + server/network) + facility $/MW × IT MW. Depreciation straight-line (hardware net of residual; facility separately). Interest = level debt service − straight-line principal. TCO = OPEX + depreciation + interest. Capacity by phase-time allocation with an input:output traffic ratio. Break-even utilization = TCO ÷ revenue at 100%. Payback = CAPEX ÷ (EBITDA − interest); simple ROI = net profit × GPU life ÷ CAPEX (no tax, no discounting). Scenarios shift utilization, price, electricity and GPU price; they are sensitivity cases, not forecasts.

## 10. Cost attribution

* **Reserved:** pool rate × reserved GPU-hours; unreserved capacity reported as unallocated idle.
* **Billed runtime:** pool rate × billed GPU-hours from billing records (required).
* **Proportional usage:** entire pool cost split by measured usage share — an approximation, labelled as such.

Invariant (tested): allocations + unallocated = pool cost; allocating more GPU-hours than the pool is rejected as double counting. GPU utilisation % is never used as an exact billing share.

## 11. Live telemetry

Run baselines capture counters (tokens, energy) at creation; values "to date" are deltas. A counter reset makes the delta unknown (null), never negative. Cost to date is calculated (reserved allocation); projected total is a forecast. OTLP usage follows OTel GenAI semantics: `input_tokens` includes cache read/creation, `output_tokens` includes reasoning.

## 12. Statistics and trends

Population statistics are unweighted (one offering = one observation) with the population stated. Composition changes over time; per-offering histories give like-for-like evolution. Backfilled observations are dated by LiteLLM commit date. With fewer than two observations in a window, charts show an insufficient-data state.

## 13. Currency

Values are stored in original currency (USD for all current sources). EUR is a display conversion using the ECB reference rate and date shown in the header.

## 14. Freshness

fresh → last success within the stale threshold and last attempt succeeded; failing → last attempt failed but last good data is recent; stale → last success older than the threshold; never → no success recorded; not-configured → requires a key that is absent. Stale data stays visible with its timestamp.
