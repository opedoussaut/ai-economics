import { promises as fs } from "node:fs";
import path from "node:path";
import type { z } from "zod";

/**
 * File-backed storage for the public, versioned datasets (git-scraping
 * pattern). The scheduled workflow commits these files, so every published
 * price change is auditable in Git history.
 */
export const DATA_DIR = process.env.AIE_DATA_DIR ?? path.join(process.cwd(), "data");

export const DATA_FILES = {
  tokenSnapshot: "snapshots/token-prices.json",
  gpuSnapshot: "snapshots/gpu-prices.json",
  fx: "snapshots/fx-rates.json",
  health: "source-health.json",
  changes: "changes.json",
  tokenHistory: "history/token-prices.jsonl",
  gpuHistory: "history/gpu-prices.jsonl",
  dailyIndex: "history/daily-index.jsonl",
  tools: "curated/tools.json",
} as const;

export const dataPath = (rel: string, dir = DATA_DIR) => path.join(dir, rel);

export async function readJson<S extends z.ZodType>(
  rel: string,
  schema: S,
  dir = DATA_DIR,
): Promise<z.infer<S> | null> {
  try {
    const text = await fs.readFile(dataPath(rel, dir), "utf8");
    return schema.parse(JSON.parse(text));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write via temp file + rename so readers never see a half-written file. */
export async function writeJsonAtomic(rel: string, value: unknown, dir = DATA_DIR) {
  const file = dataPath(rel, dir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 1) + "\n", "utf8");
  await fs.rename(tmp, file);
}

export async function readJsonl<S extends z.ZodType>(rel: string, schema: S, dir = DATA_DIR) {
  let text: string;
  try {
    text = await fs.readFile(dataPath(rel, dir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [] as z.infer<S>[];
    throw err;
  }
  const rows: z.infer<S>[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    rows.push(schema.parse(JSON.parse(line)));
  }
  return rows;
}

export async function appendJsonl(rel: string, rows: unknown[], dir = DATA_DIR) {
  if (rows.length === 0) return;
  const file = dataPath(rel, dir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

export async function writeJsonl(rel: string, rows: unknown[], dir = DATA_DIR) {
  const file = dataPath(rel, dir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  await fs.rename(tmp, file);
}
