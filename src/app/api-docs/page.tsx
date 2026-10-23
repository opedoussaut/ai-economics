import type { Metadata } from "next";
import { Card, CardBody, CardHeader, Formula, PageHeader, td, th } from "@/components/ui";

export const metadata: Metadata = { title: "Public API" };

const ENDPOINTS = [
  ["GET /api/v1/token-prices", "Current token price snapshot (JSON). Add ?format=csv for CSV.", "Published"],
  ["GET /api/v1/gpu-prices", "Current GPU price snapshot (JSON). Add ?format=csv for CSV.", "Published"],
  ["GET /api/v1/changes", "Latest 500 observed price-change events.", "Published"],
  ["GET /api/v1/sources", "Source registry with health and freshness.", "—"],
  ["GET /api/v1/tools", "Cost-measurement tools directory.", "—"],
  ["GET /feed.xml", "RSS feed of observed price changes.", "Published"],
  ["POST /api/ingest/otlp/v1/traces", "OTLP/HTTP JSON trace ingestion (Bearer INGEST_TOKEN). Private.", "Measured"],
];

export default function ApiDocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Public API"
        title="Datasets API"
        description="Read-only JSON/CSV endpoints for the public datasets. No key required; responses are cached for 5 minutes. Please attribute AI Economics and the upstream sources."
      />
      <Card>
        <CardHeader title="Endpoints" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border"><tr><th className={th}>Endpoint</th><th className={th}>Description</th><th className={th}>Value class</th></tr></thead>
            <tbody>
              {ENDPOINTS.map(([e, d, c]) => (
                <tr key={e} className="border-b border-border/60"><td className={`${td} num text-xs`}>{e}</td><td className={td}>{d}</td><td className={td}>{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Example" />
        <CardBody>
          <Formula>{`curl -s https://<host>/api/v1/token-prices | jq '.offerings[] | select(.modelId=="gpt-5") | .prices'
curl -s "https://<host>/api/v1/gpu-prices?format=csv" -o gpu-prices.csv`}</Formula>
          <p className="mt-3 text-xs text-muted">
            The same data is versioned in the Git repository under <code>data/</code> (snapshots, append-only price history, daily index), so every change is auditable.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
