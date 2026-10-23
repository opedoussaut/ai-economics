import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

/**
 * E2E tests run against a production build. Test-only secrets are generated
 * here and an isolated embedded database is used.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ADMIN_TOKEN: "e2e-admin-token",
      SESSION_SECRET: "e2e-session-secret-at-least-32-characters-long",
      INGEST_TOKEN: "e2e-ingest-token",
      PGLITE_DIR: ".data/pglite-e2e",
    },
  },
});
