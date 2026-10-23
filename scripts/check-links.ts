/**
 * Weekly tool-directory link check: verifies website, docs and GitHub URLs
 * for every tool and writes data/curated/link-check.json.
 *
 *   npm run check:links
 */
import { DATA_FILES, readJson, writeJsonAtomic } from "../src/lib/data/files";
import { USER_AGENT } from "../src/lib/ingest/http";
import { ToolsFileSchema, type LinkCheck } from "../src/lib/tools";

async function check(url: string) {
  const attempt = async (method: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      return await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": USER_AGENT } });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await attempt("HEAD");
    // Many sites reject HEAD; retry with GET.
    if (res.status >= 400) res = await attempt("GET");
    return { url, status: res.status, ok: res.status < 400, error: null };
  } catch (err) {
    return { url, status: null, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const file = await readJson(DATA_FILES.tools, ToolsFileSchema);
  if (!file) throw new Error("tools.json missing");
  const results: LinkCheck["results"] = {};
  await Promise.all(
    file.tools.map(async (t) => {
      const urls = [...new Set([t.website, t.docs, t.github].filter((u): u is string => !!u))];
      results[t.slug] = await Promise.all(urls.map(check));
    }),
  );
  const out: LinkCheck = { checkedAt: new Date().toISOString(), results };
  await writeJsonAtomic("curated/link-check.json", out);
  const broken = Object.entries(results).flatMap(([slug, rs]) => rs.filter((r) => !r.ok).map((r) => `${slug}: ${r.url} → ${r.status ?? r.error}`));
  console.log(`Checked ${Object.values(results).flat().length} links; ${broken.length} failing.`);
  for (const b of broken) console.log(`  ✗ ${b}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
