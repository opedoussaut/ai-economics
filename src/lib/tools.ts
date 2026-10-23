import { z } from "zod";

export const WORKLOADS = {
  "api-inference": "API inference",
  "self-hosted-inference": "Self-hosted inference",
  pretraining: "Pretraining",
  "fine-tuning": "Fine-tuning",
  rl: "Reinforcement learning",
  agents: "Agent workloads",
  "gpu-monitoring": "GPU hardware monitoring",
  "infra-accounting": "Infrastructure accounting",
  energy: "Energy / environmental",
  profiling: "Profiling & benchmarking",
} as const;
export type Workload = keyof typeof WORKLOADS;

export const TOOL_CATEGORIES = {
  "llm-observability": "LLM cost tracking & observability",
  "experiment-tracking": "Training & experiment tracking",
  "gpu-infra": "GPU & infrastructure monitoring",
  "cost-allocation": "Infrastructure cost allocation",
  "inference-server": "Inference server metrics",
  energy: "Energy & sustainability",
  "post-training": "Fine-tuning & RL frameworks",
  standard: "Telemetry standards",
} as const;

/**
 * - none:        produces measurements only; join with price data for cost
 * - estimated:   computes monetary cost from usage × a price table
 * - billing:     reconciles against provider/cloud billing data
 */
export const COST_CAPABILITY = {
  none: "Measurements only (no monetary cost)",
  estimated: "Estimated cost from price tables",
  billing: "Billing / invoice reconciliation",
} as const;

export const ToolSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  summary: z.string(),
  category: z.enum(Object.keys(TOOL_CATEGORIES) as [keyof typeof TOOL_CATEGORIES]),
  workloads: z.array(z.enum(Object.keys(WORKLOADS) as [Workload])).min(1),
  measures: z.array(z.string()).min(1),
  costCapability: z.enum(["none", "estimated", "billing"]),
  costNotes: z.string(),
  liveMonitoring: z.boolean(),
  historicalRecords: z.boolean(),
  hosting: z.array(z.enum(["saas", "self-hosted", "library", "cli"])),
  licenseType: z.enum(["open-source", "open-core", "commercial", "proprietary-free", "specification"]),
  license: z.string(),
  integrations: z.array(z.string()),
  platforms: z.array(z.string()),
  website: z.string().url(),
  docs: z.string().url(),
  github: z.string().url().nullable(),
  install: z.string(),
  exportApi: z.string(),
  pricing: z.string(),
  caveats: z.string().nullable(),
  /** How AI Economics connects to it. */
  aieIntegration: z.enum(["adapter", "documented", "none"]),
  lastVerified: z.string(),
});
export type Tool = z.infer<typeof ToolSchema>;
export const ToolsFileSchema = z.object({ schemaVersion: z.literal(1), tools: z.array(ToolSchema) });

export const LinkCheckSchema = z.object({
  checkedAt: z.string(),
  results: z.record(z.string(), z.object({ url: z.string(), status: z.number().nullable(), ok: z.boolean(), error: z.string().nullable() }).array()),
});
export type LinkCheck = z.infer<typeof LinkCheckSchema>;
