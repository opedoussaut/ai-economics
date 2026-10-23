import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { getFx, getSourceStatuses } from "@/lib/data/store";
import { formatAge } from "@/lib/data/freshness";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AI Economics", template: "%s · AI Economics" },
  description:
    "Frequently updated intelligence on the economics of AI: API token prices, GPU rental prices, inference, training, fine-tuning and RL cost models, AI factory simulation and cost-measurement tools.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1c" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
  ],
};

async function FreshnessLine() {
  const statuses = await getSourceStatuses();
  const priced = statuses.filter((s) => s.source.dataset === "token" || s.source.dataset === "gpu");
  const ages = priced.map((s) => s.freshness.ageHours).filter((a): a is number => a !== null);
  const problems = priced.filter((s) => s.freshness.state !== "fresh");
  if (ages.length === 0) return <span>No ingestion recorded yet. Run <code>npm run refresh</code>.</span>;
  return (
    <span>
      <span className={problems.length ? "text-warn" : "text-pos"}>●</span> Price data refreshed {formatAge(Math.min(...ages))} ago
      {problems.length > 0 && <> · {problems.length} source(s) need attention</>} ·{" "}
      <a href="/methodology#source-health" className="underline-offset-2 hover:underline">source health</a>
    </span>
  );
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const fx = await getFx();
  const usdPerEur = fx?.eurRates.USD ?? null;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers usdPerEur={usdPerEur} rateDate={fx?.rateDate ?? null}>
          <Shell freshness={<FreshnessLine />}>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
