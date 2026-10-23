import { getChanges } from "@/lib/data/store";

export const revalidate = 300;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** RSS 2.0 feed of observed price changes (not provider announcements). */
export async function GET(req: Request) {
  const origin = process.env.PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const changes = (await getChanges()).slice(0, 100);
  const items = changes
    .map((c) => {
      const title =
        c.kind === "price-change" ? `${c.label}: ${c.field} ${c.oldValue} → ${c.newValue}` : `${c.kind}: ${c.label}`;
      const page = c.dataset === "token" ? "token-pricing" : "gpu-pricing";
      return `<item><title>${esc(title)}</title><link>${origin}/${page}</link><guid isPermaLink="false">${esc(`${c.offeringId}|${c.field ?? c.kind}|${c.at}`)}</guid><pubDate>${new Date(c.at).toUTCString()}</pubDate><description>${esc(`Observed by AI Economics from ${c.sourceId}. Observation time, not provider effective date.`)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>AI Economics: observed price changes</title><link>${origin}</link><description>Changes detected between consecutive snapshots of published AI token and GPU prices.</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
