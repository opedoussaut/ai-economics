import { expect, test } from "@playwright/test";

const PAGES = [
  ["/", "The economics of AI"],
  ["/token-pricing", "LLM API price catalogue"],
  ["/gpu-pricing", "AI accelerator rental prices"],
  ["/inference", "inference cost simulator"],
  ["/training", "Pretraining"],
  ["/fine-tuning", "SFT, LoRA"],
  ["/reinforcement-learning", "RLHF"],
  ["/ai-factory", "AI factory"],
  ["/monitoring", "Connect your instrumentation"],
  ["/tools", "Tools that measure"],
  ["/trends", "published AI prices move"],
  ["/methodology", "How every number"],
] as const;

test("sidebar navigation reaches every section", async ({ page }) => {
  await page.goto("/");
  for (const [href, heading] of PAGES) {
    await page.locator(`nav[aria-label="Main"] a[href="${href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${href === "/" ? "/$" : href}`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading, { ignoreCase: true });
  }
});

test("model comparison: search, add an offering and see its cost", async ({ page }) => {
  await page.goto("/token-pricing");
  await page.getByPlaceholder("Search model, developer, provider").fill("gpt-5-mini");
  const row = page.locator('[data-testid="catalog-table"] tbody tr').filter({ hasText: "gpt-5-mini" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").check();
  const compare = page.locator("table").first();
  await expect(compare).toContainText("gpt-5-mini");
  // Changing the workload updates the computed monthly cost.
  const cell = compare.locator("tr", { hasText: "gpt-5-mini" }).locator("td").nth(4);
  const before = await cell.innerText();
  await page.getByLabel("Requests / day").fill("50000");
  await expect(cell).not.toHaveText(before);
});

test("inference calculator updates when the GPU price changes", async ({ page }) => {
  await page.goto("/inference");
  const stat = page.locator("section", { hasText: "Infrastructure cost / hour (cluster)" }).locator("p.num");
  const before = await stat.innerText();
  await page.getByLabel("Rental price per GPU-hour").fill("6");
  await expect(stat).not.toHaveText(before);
  await expect(page).toHaveURL(/rent=6/); // shareable URL state
});

test("tool directory filters by workload and cost capability", async ({ page }) => {
  await page.goto("/tools");
  const count = page.getByTestId("tool-count");
  const total = await count.innerText();
  await page.getByRole("button", { name: "Energy / environmental" }).click();
  await expect(count).not.toHaveText(total);
  await expect(page.getByTestId("tool-grid")).toContainText("CodeCarbon");
  await expect(page.getByTestId("tool-grid")).not.toContainText("LangSmith");
  await page.getByLabel("Cost capability").selectOption("billing");
  await expect(page.getByText("No tools match these filters")).toBeVisible();
  await page.getByRole("button", { name: "All workloads" }).click();
  await expect(page.getByTestId("tool-grid")).toContainText("OpenCost");
  await page.getByTestId("tool-grid").getByRole("heading", { name: "OpenCost", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OpenCost");
});

test("private monitoring requires sign-in and shows an honest not-connected state", async ({ page }) => {
  await page.goto("/monitoring/live");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Admin token").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid token.")).toBeVisible();
  await page.getByLabel("Admin token").fill("e2e-admin-token");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/monitoring\/live/);
  // First request cold-starts the embedded database (WASM init + migrations).
  await expect(page.getByText("No telemetry source configured")).toBeVisible({ timeout: 20_000 });
});

test("telemetry API rejects unauthenticated access", async ({ request }) => {
  expect((await request.get("/api/telemetry/live")).status()).toBe(401);
});

test("OTLP ingestion stores usage only with a valid token", async ({ request }) => {
  const body = {
    resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "e2e" } }] },
      scopeSpans: [{ spans: [{ traceId: "a", spanId: "b", startTimeUnixNano: String(Date.now() * 1e6), endTimeUnixNano: String(Date.now() * 1e6 + 1e9),
        attributes: [
          { key: "gen_ai.provider.name", value: { stringValue: "openai" } },
          { key: "gen_ai.request.model", value: { stringValue: "gpt-5" } },
          { key: "gen_ai.usage.input_tokens", value: { intValue: "1000" } },
          { key: "gen_ai.usage.output_tokens", value: { intValue: "100" } },
        ] }] }] }],
  };
  const denied = await request.post("/api/ingest/otlp/v1/traces", { data: body });
  expect(denied.status()).toBe(401);
  const ok = await request.post("/api/ingest/otlp/v1/traces", { data: body, headers: { authorization: "Bearer e2e-ingest-token" } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ stored: 1, priced: 1 });
});

test("public dataset API serves JSON and CSV", async ({ request }) => {
  const json = await (await request.get("/api/v1/token-prices")).json();
  expect(json.offerings.length).toBeGreaterThan(100);
  const csv = await request.get("/api/v1/gpu-prices?format=csv");
  expect(csv.headers()["content-type"]).toContain("text/csv");
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("overview fits the viewport and the menu opens", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "GPU Pricing" }).click();
    await expect(page).toHaveURL(/gpu-pricing/);
  });
});
