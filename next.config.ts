import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM/data files from its package directory at runtime,
  // so it must not be bundled; postgres.js is also kept external.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Public datasets are read from /data at request time; include them in the
  // server output for serverless deployments.
  outputFileTracingIncludes: { "/**": ["./data/**/*", "./drizzle/**/*"] },
};

export default nextConfig;
