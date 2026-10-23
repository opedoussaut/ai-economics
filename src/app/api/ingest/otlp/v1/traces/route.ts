import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { bearerOk } from "@/lib/auth";
import { extractGenAiUsage } from "@/lib/telemetry/otlp";
import { storeUsage } from "@/lib/telemetry/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * OTLP/HTTP trace receiver (JSON encoding only). Authenticated with
 * `Authorization: Bearer $INGEST_TOKEN`. Stores token usage per GenAI span;
 * message content is never read or persisted.
 */
export async function POST(req: Request) {
  if (!process.env.INGEST_TOKEN) return NextResponse.json({ error: "OTLP ingestion disabled: INGEST_TOKEN not set" }, { status: 503 });
  if (!bearerOk(req.headers.get("authorization"), process.env.INGEST_TOKEN)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    return NextResponse.json({ error: "Only OTLP/HTTP JSON is supported (set the exporter protocol to http/json)" }, { status: 415 });
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });
    const usages = extractGenAiUsage(JSON.parse(text));
    const result = await storeUsage(usages);
    // OTLP success response shape (partialSuccess omitted when all accepted).
    return NextResponse.json({ ...result });
  } catch (err) {
    if (err instanceof ZodError || err instanceof SyntaxError) return NextResponse.json({ error: "invalid OTLP JSON payload" }, { status: 400 });
    console.error("OTLP ingest failed", err);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
