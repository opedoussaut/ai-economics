/**
 * Reconstruct historical published-price observations from the Git history of
 * the LiteLLM price map (one revision per month).
 *
 *   npm run backfill:litellm -- --months 24
 *
 * Each backfilled row is tagged `origin: "backfill:litellm@<sha>"` and dated
 * with the commit date: it records when LiteLLM's map contained that price,
 * which is not necessarily the provider's effective date. Optional
 * GITHUB_TOKEN raises the GitHub API rate limit. Idempotent.
 */
import { DATA_FILES, appendJsonl, readJsonl, writeJsonl } from "../src/lib/data/files";
import { DailyIndexRowSchema, PriceHistoryRowSchema, type PriceHistoryRow, type TokenOffering } from "../src/lib/data/schemas";
import { fetchJson } from "../src/lib/ingest/http";
import { normalizeLiteLLM } from "../src/lib/ingest/adapters/litellm";
import { hashPrices } from "../src/lib/ingest/merge";
import { tokenIndexRows, upsertIndex } from "../src/lib/ingest/indexer";
import { tokenPriceFields } from "../src/lib/ingest/run";

const REPO = "BerriAI/litellm";
const FILE = "model_prices_and_context_window.json";

interface Commit {
  sha: string;
  commit: { committer: { date: string } };
}

async function main() {
  const monthsArg = process.argv.indexOf("--months");
  const months = monthsArg > 0 ? Number(process.argv[monthsArg + 1]) : 18;
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const history = await readJsonl(DATA_FILES.tokenHistory, PriceHistoryRowSchema);
  const existingKeys = new Set(history.map((r) => `${r.offeringId}|${r.observedAt}`));
  let index = await readJsonl(DATA_FILES.dailyIndex, DailyIndexRowSchema);

  const now = new Date();
  const targets: string[] = [];
  for (let i = months; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    targets.push(d.toISOString());
  }

  // Previous hash per offering *within the backfill sequence*, so that only
  // genuine changes between monthly revisions become history rows.
  const prevHash = new Map<string, string>();
  const newRows: PriceHistoryRow[] = [];
  const seenShas = new Set<string>();

  for (const until of targets) {
    const commits = await fetchJson<Commit[]>(
      `https://api.github.com/repos/${REPO}/commits?path=${FILE}&until=${until}&per_page=1`,
      { headers },
    );
    const c = commits[0];
    if (!c || seenShas.has(c.sha)) continue;
    seenShas.add(c.sha);
    const at = c.commit.committer.date.replace(/\.\d+Z$/, "Z");
    const raw = await fetchJson<Record<string, unknown>>(
      `https://raw.githubusercontent.com/${REPO}/${c.sha}/${FILE}`,
      { timeoutMs: 60_000 },
    );
    const observed = normalizeLiteLLM(raw, at);
    const origin = `backfill:litellm@${c.sha.slice(0, 7)}`;
    let added = 0;
    for (const o of observed) {
      const values = tokenPriceFields(o);
      const hash = hashPrices(values);
      if (prevHash.get(o.id) === hash) continue;
      prevHash.set(o.id, hash);
      if (existingKeys.has(`${o.id}|${at}`)) continue;
      newRows.push({ offeringId: o.id, observedAt: at, hash, origin, values });
      added++;
    }
    const asOfferings = observed.map((o) => ({ ...o, firstSeenAt: at, delistedAt: null, listed: true })) as TokenOffering[];
    index = upsertIndex(index, tokenIndexRows(asOfferings, at.slice(0, 10), "backfill:litellm"));
    console.log(`${at.slice(0, 10)} ${c.sha.slice(0, 7)}: ${observed.length} offerings, ${added} history rows`);
  }

  await appendJsonl(DATA_FILES.tokenHistory, newRows);
  await writeJsonl(DATA_FILES.dailyIndex, index);
  console.log(`Backfill complete: ${newRows.length} history rows from ${seenShas.size} revisions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
