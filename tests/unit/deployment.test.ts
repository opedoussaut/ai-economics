import { afterEach, describe, expect, it } from "vitest";
import { DatabaseNotConfiguredError, databaseConfigured, getDb, isServerless } from "@/lib/db/client";

const saved = { VERCEL: process.env.VERCEL, DATABASE_URL: process.env.DATABASE_URL };

describe("serverless database guard", () => {
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("allows embedded PGlite locally", () => {
    delete process.env.VERCEL;
    delete process.env.DATABASE_URL;
    expect(isServerless()).toBe(false);
    expect(databaseConfigured()).toBe(true);
  });

  it("requires DATABASE_URL on Vercel instead of writing to an ephemeral filesystem", async () => {
    process.env.VERCEL = "1";
    delete process.env.DATABASE_URL;
    expect(databaseConfigured()).toBe(false);
    await expect(getDb()).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
    expect(databaseConfigured()).toBe(true);
  });
});
