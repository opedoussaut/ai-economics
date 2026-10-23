/**
 * Manual / scheduled data refresh.
 *
 *   npm run refresh                       # all public sources
 *   npm run refresh -- litellm openrouter # selected sources
 *
 * Exits non-zero only if every requested source failed, so a single flaky
 * upstream does not block committing the others.
 */
import { ALL_SOURCES, refresh, type RefreshableSource } from "../src/lib/ingest/run";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const unknown = args.filter((a) => !(ALL_SOURCES as readonly string[]).includes(a));
  if (unknown.length) {
    console.error(`Unknown source(s): ${unknown.join(", ")}. Known: ${ALL_SOURCES.join(", ")}`);
    process.exit(2);
  }
  const sources = (args.length ? args : ALL_SOURCES) as RefreshableSource[];
  console.log(`Refreshing: ${sources.join(", ")}`);
  const results = await refresh(sources, { log: (m) => console.log(`  ${m}`) });
  const failed = results.filter((r) => r.status === "error");
  if (failed.length === results.length) {
    console.error("All sources failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
