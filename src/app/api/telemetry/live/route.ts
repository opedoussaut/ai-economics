import { NextResponse } from "next/server";
import { collectLive } from "@/lib/telemetry/live";
import { listRuns, runEconomics, usageSummary } from "@/lib/telemetry/runs";
import { telemetryEnv } from "@/lib/telemetry/config";
import { databaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authenticated (middleware). Polled by the live view at TELEMETRY_POLL_SECONDS. */
export async function GET() {
  const database = databaseConfigured();
  const [live, runs, usage] = await Promise.all([
    collectLive(),
    database ? listRuns() : Promise.resolve([]),
    database ? usageSummary(24) : Promise.resolve([]),
  ]);
  const now = new Date();
  return NextResponse.json({
    pollSeconds: telemetryEnv().pollSeconds,
    database,
    live,
    runs: runs.map(({ run, workload }) => {
      const e = runEconomics(run, live.connected ? live : null, now);
      return {
        id: run.id, name: run.name, type: workload.type, project: workload.project, cluster: workload.cluster, model: workload.model,
        status: run.status, startedAt: run.startedAt, endedAt: run.endedAt, gpuCount: run.gpuCount, ratePerGpuHour: Number(run.ratePerGpuHour),
        rateSource: run.rateSource, mlflowRunId: run.mlflowRunId, allocationMethod: run.allocationMethod,
        elapsedHours: e.elapsedHours.toNumber(), gpuHours: e.gpuHours.toNumber(), costToDate: e.costToDate.toNumber(), costRatePerHour: e.costRatePerHour.toNumber(),
        generatedTokens: e.generatedTokens, inputTokens: e.inputTokens, costPerMGenerated: e.costPerMGenerated?.toNumber() ?? null,
        energyKwh: e.energyKwh?.toNumber() ?? null, energyCost: e.energyCost?.toNumber() ?? null, projectedTotal: e.projectedTotal?.toNumber() ?? null,
      };
    }),
    usage: usage.map((u) => ({ ...u, inputTokens: Number(u.inputTokens), outputTokens: Number(u.outputTokens), cost: u.cost === null ? null : Number(u.cost) })),
  });
}
