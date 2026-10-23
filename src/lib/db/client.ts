import { mkdir } from "node:fs/promises";
import path from "node:path";
import * as schema from "./schema";

/**
 * Database client.
 *  - DATABASE_URL set  → PostgreSQL via postgres.js (production).
 *  - otherwise         → embedded PGlite (Postgres in WASM) stored in
 *                        .data/pglite, so local development on Windows needs
 *                        no Docker or Postgres install.
 * Migrations in /drizzle are applied on first use.
 */
type Db = Awaited<ReturnType<typeof create>>;
let dbPromise: Promise<Db> | null = null;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * Serverless hosts (Vercel, AWS Lambda) have a read-only, per-instance
 * filesystem: an embedded database there would silently lose data, so
 * DATABASE_URL is mandatory for private telemetry in those environments.
 */
export const isServerless = () => !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Private telemetry needs PostgreSQL on serverless hosts (see docs/DEPLOYMENT.md).");
    this.name = "DatabaseNotConfiguredError";
  }
}

export const databaseConfigured = () => !!process.env.DATABASE_URL || !isServerless();

async function create() {
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(process.env.DATABASE_URL, { max: 5 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as import("drizzle-orm/pglite").PgliteDatabase<typeof schema>;
  }
  if (isServerless()) throw new DatabaseNotConfiguredError();
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== ":memory:") await mkdir(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir === ":memory:" ? undefined : dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export function getDb(): Promise<Db> {
  dbPromise ??= create().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

export { schema };
