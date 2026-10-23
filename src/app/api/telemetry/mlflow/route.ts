import { NextResponse } from "next/server";
import { telemetryEnv } from "@/lib/telemetry/config";
import { getMlflowMetricHistory, getMlflowRun } from "@/lib/telemetry/mlflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authenticated (middleware). Reads one MLflow run's metrics (no params/tags). */
export async function GET(req: Request) {
  const cfg = telemetryEnv().mlflow;
  if (!cfg) return NextResponse.json({ error: "MLflow not configured" }, { status: 503 });
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  if (!runId || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) return NextResponse.json({ error: "invalid runId" }, { status: 400 });
  try {
    const run = await getMlflowRun(cfg, runId);
    const keys = run.metrics.map((m) => m.key).filter((k) => /loss|reward|kl|accuracy|tokens|step/i.test(k)).slice(0, 6);
    const history = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await getMlflowMetricHistory(cfg, runId, k, 500)] as const)));
    return NextResponse.json({ run, history });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "MLflow request failed" }, { status: 502 });
  }
}
