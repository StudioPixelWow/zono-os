import { test, expect, type Page } from "@playwright/test";

// ============================================================================
// Browser E2E — Creative test runtime (/creative-lab). Drives the REAL Next.js
// app + real CreativeContentService through the guarded in-memory test runtime.
// No Supabase, no OpenAI, no Docker. 40 scenarios: session/guard, generation,
// role/active enforcement, approval lifecycle, publish eligibility, org
// isolation, and the bulk generator (partial failure + idempotent re-run).
// ============================================================================

const E2E_PORT = Number(process.env.LAB_E2E_PORT ?? 3123);
const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;

async function loginAs(page: Page, as: string) {
  // Set the deterministic session cookie DIRECTLY on the browser context —
  // robust to dev-server host/redirect quirks (127.0.0.1 vs localhost) that
  // otherwise dropped the session. Same-origin (localhost) so it's always sent.
  await page.context().addCookies([
    { name: "zono_lab_session", value: as, url: E2E_ORIGIN, httpOnly: true, sameSite: "Lax" },
  ]);
  await page.goto("/creative-lab");
  await expect(page.getByTestId("lab-root")).toBeVisible();
}
async function generate(page: Page, kind: string, prompt: string) {
  await page.getByTestId(`kind-${kind}`).click();
  await page.getByTestId("prompt").fill(prompt);
  await page.getByTestId("generate").click();
}
async function newestOutputId(page: Page): Promise<string> {
  const first = page.locator('[data-testid^="output-"]').first();
  await expect(first).toBeVisible();
  const tid = await first.getAttribute("data-testid");
  return tid!.replace("output-", "");
}

test.describe("session + guard", () => {
  test("01 workspace page loads", async ({ page }) => {
    await page.goto("/creative-lab");
    await expect(page.getByRole("heading", { name: /Test Runtime/ })).toBeVisible();
  });
  test("02 default is anonymous", async ({ page }) => {
    await loginAs(page, "anonymous");
    await expect(page.getByTestId("lab-session")).toContainText("anonymous");
  });
  test("03 anonymous sees sign-in hint (cannot generate)", async ({ page }) => {
    await loginAs(page, "anonymous");
    await expect(page.getByTestId("signin-hint")).toBeVisible();
    await expect(page.getByTestId("generate")).toHaveCount(0);
  });
  test("04 login as alpha-owner", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await expect(page.getByTestId("lab-session")).toContainText("org-alpha");
    await expect(page.getByTestId("lab-session")).toContainText("owner");
  });
  test("05 login as alpha-agent", async ({ page }) => {
    await loginAs(page, "alpha-agent");
    await expect(page.getByTestId("lab-session")).toContainText("agent");
  });
  test("06 login as beta-owner shows beta org", async ({ page }) => {
    await loginAs(page, "beta-owner");
    await expect(page.getByTestId("lab-session")).toContainText("org-beta");
    await expect(page.getByTestId("org-name")).toContainText("Beta");
  });
  test("07 inactive user cannot generate", async ({ page }) => {
    await loginAs(page, "alpha-inactive");
    await expect(page.getByTestId("lab-session")).toContainText("inactive");
    await expect(page.getByTestId("signin-hint")).toBeVisible();
    await expect(page.getByTestId("generate")).toHaveCount(0);
  });
  test("08 nav to bulk generator works", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.getByTestId("nav-bulk").click();
    await expect(page.getByTestId("bulk")).toBeVisible();
  });
});

test.describe("generation", () => {
  test.beforeEach(async ({ page }) => { await loginAs(page, "alpha-owner"); });

  test("09 generate property ad → review", async ({ page }) => {
    await generate(page, "property_ad_post", "בית פרטי מרווח 09");
    await expect(page.getByTestId("ok-msg")).toBeVisible();
    const id = await newestOutputId(page);
    await expect(page.getByTestId(`state-${id}`)).toContainText("בבדיקה");
  });
  test("10 empty prompt → error", async ({ page }) => {
    await page.getByTestId("kind-property_ad_post").click();
    await page.getByTestId("prompt").fill("   ");
    await page.getByTestId("generate").click();
    await expect(page.getByTestId("err-msg")).toBeVisible();
  });
  test("11 generate market_stat kind", async ({ page }) => {
    await generate(page, "market_stat", "מחירים עלו 3.2% 11");
    await expect(page.getByTestId("ok-msg")).toBeVisible();
    const id = await newestOutputId(page);
    await expect(page.getByTestId(`output-${id}`)).toContainText("market_stat");
  });
  test("12 generate agent_brand kind", async ({ page }) => {
    await generate(page, "agent_brand", "היכרות עם הסוכן 12");
    await expect(page.getByTestId("ok-msg")).toBeVisible();
    await expect(page.locator('[data-testid^="output-"]').filter({ hasText: "agent_brand" }).first()).toBeVisible();
  });
  test("13 generate office_brand kind", async ({ page }) => {
    await generate(page, "office_brand", "המשרד שלנו 13");
    await expect(page.getByTestId("ok-msg")).toBeVisible();
    await expect(page.locator('[data-testid^="output-"]').filter({ hasText: "office_brand" }).first()).toBeVisible();
  });
  test("14 generate sold_post kind", async ({ page }) => {
    await generate(page, "sold_post", "נמכר בהצלחה 14");
    await expect(page.getByTestId("ok-msg")).toBeVisible();
    await expect(page.locator('[data-testid^="output-"]').filter({ hasText: "sold_post" }).first()).toBeVisible();
  });
  test("15 outputs count increments", async ({ page }) => {
    const before = Number((await page.getByTestId("outputs-count").innerText()).replace(/\D/g, ""));
    await generate(page, "property_ad_post", "עוד קריאייטיב ייחודי 15");
    await expect.poll(async () => Number((await page.getByTestId("outputs-count").innerText()).replace(/\D/g, ""))).toBeGreaterThan(before);
  });
  test("16 identical prompt is idempotent (no duplicate)", async ({ page }) => {
    const count = async () => Number((await page.getByTestId("outputs-count").innerText()).replace(/\D/g, ""));
    const before = await count();
    await generate(page, "property_ad_post", "מפתח ייחודי לבדיקת כפילות 16");
    await expect.poll(count).toBe(before + 1);            // first generation has landed
    const id1 = await newestOutputId(page);
    await generate(page, "property_ad_post", "מפתח ייחודי לבדיקת כפילות 16");
    await expect(page.getByTestId("ok-msg")).toBeVisible();
    await expect(page.getByTestId(`output-${id1}`)).toBeVisible();
    await expect.poll(count).toBe(before + 1);            // idempotent: no duplicate row
    expect(await newestOutputId(page)).toBe(id1);         // same output returned
  });
});

test.describe("lifecycle + eligibility", () => {
  test.beforeEach(async ({ page }) => { await loginAs(page, "alpha-owner"); });

  test("17 approve → approved", async ({ page }) => {
    await generate(page, "property_ad_post", "לאישור 17");
    const id = await newestOutputId(page);
    await page.getByTestId(`approve-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("מאושר");
  });
  test("18 reject → qa_failed", async ({ page }) => {
    await generate(page, "property_ad_post", "לדחייה 18");
    const id = await newestOutputId(page);
    await page.getByTestId(`reject-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("נדחה");
  });
  test("19 publish before approve blocked", async ({ page }) => {
    await generate(page, "property_ad_post", "פרסום מוקדם 19");
    const id = await newestOutputId(page);
    await page.getByTestId(`publish-${id}`).click();
    await expect(page.getByTestId("err-msg")).toContainText(/cannot be published|approved/);
  });
  test("20 schedule before approve blocked", async ({ page }) => {
    await generate(page, "property_ad_post", "תזמון מוקדם 20");
    const id = await newestOutputId(page);
    await page.getByTestId(`schedule-${id}`).click();
    await expect(page.getByTestId("err-msg")).toContainText(/cannot be published|approved/);
  });
  test("21 approve then schedule → scheduled", async ({ page }) => {
    await generate(page, "property_ad_post", "אישור ואז תזמון 21");
    const id = await newestOutputId(page);
    await page.getByTestId(`approve-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("מאושר");
    await page.getByTestId(`schedule-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("מתוזמן");
  });
  test("22 approve then publish → published", async ({ page }) => {
    await generate(page, "property_ad_post", "אישור ואז פרסום 22");
    const id = await newestOutputId(page);
    await page.getByTestId(`approve-${id}`).click();
    await page.getByTestId(`publish-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("פורסם");
  });
  test("23 reject then approve blocked (qa-failed not approvable)", async ({ page }) => {
    await generate(page, "property_ad_post", "דחייה ואז אישור 23");
    const id = await newestOutputId(page);
    await page.getByTestId(`reject-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("נדחה");
    await page.getByTestId(`approve-${id}`).click();
    await expect(page.getByTestId("err-msg")).toContainText(/QA-failed|cannot approve/);
  });
  test("24 publish twice is idempotent (stays published)", async ({ page }) => {
    await generate(page, "property_ad_post", "פרסום כפול 24");
    const id = await newestOutputId(page);
    await page.getByTestId(`approve-${id}`).click();
    await page.getByTestId(`publish-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("פורסם");
    await page.getByTestId(`publish-${id}`).click();
    await expect(page.getByTestId(`state-${id}`)).toContainText("פורסם");
    await expect(page.getByTestId("err-msg")).toHaveCount(0);
  });
});

test.describe("organization isolation", () => {
  test("25 beta cannot see alpha outputs", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await generate(page, "property_ad_post", "בלעדי לאלפא 25");
    const alphaId = await newestOutputId(page);
    await loginAs(page, "beta-owner");
    await expect(page.getByTestId(`output-${alphaId}`)).toHaveCount(0);
  });
  test("26 beta has its own independent workspace", async ({ page }) => {
    await loginAs(page, "beta-owner");
    await generate(page, "property_ad_post", "בלעדי לביתא 26");
    const betaId = await newestOutputId(page);
    await loginAs(page, "alpha-owner");
    await expect(page.getByTestId(`output-${betaId}`)).toHaveCount(0);
  });
  test("27 alpha output still visible to alpha after switching back", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await generate(page, "property_ad_post", "התמדה לאלפא 27");
    const id = await newestOutputId(page);
    await loginAs(page, "beta-owner");
    await loginAs(page, "alpha-owner");
    await expect(page.getByTestId(`output-${id}`)).toBeVisible();
  });
  test("28 alpha-agent shares org with alpha-owner", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await generate(page, "property_ad_post", "משותף לצוות אלפא 28");
    const id = await newestOutputId(page);
    await loginAs(page, "alpha-agent");
    await expect(page.getByTestId(`output-${id}`)).toBeVisible();
  });
});

test.describe("bulk generator", () => {
  test("29 bulk page lists org properties", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await expect(page.getByTestId("prop-alpha-prop-1")).toBeVisible();
    await expect(page.getByTestId("prop-alpha-prop-2")).toBeVisible();
  });
  test("30 invalid property is flagged", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await expect(page.getByTestId("invalid-alpha-prop-invalid")).toBeVisible();
  });
  test("31 anonymous cannot run bulk", async ({ page }) => {
    await loginAs(page, "anonymous");
    await page.goto("/creative-lab/bulk");
    await expect(page.getByTestId("bulk-signin-hint")).toBeVisible();
  });
  test("32 bulk over valid props succeeds", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("select-alpha-prop-invalid").setChecked(false);
    await page.getByTestId("run-bulk").click();
    await expect(page.getByTestId("bulk-result")).toBeVisible();
    await expect(page.getByTestId("bulk-failed")).toContainText("0");
    await expect(page.getByTestId("bulk-succeeded")).not.toContainText("0");
  });
  test("33 bulk with invalid selected → partial failure", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("select-alpha-prop-invalid").setChecked(true);
    await page.getByTestId("run-bulk").click();
    await expect(page.getByTestId("row-fail-alpha-prop-invalid")).toBeVisible();
  });
  test("34 valid rows still succeed despite invalid one", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("select-alpha-prop-invalid").setChecked(true);
    await page.getByTestId("run-bulk").click();
    await expect(page.getByTestId("row-ok-alpha-prop-1")).toBeVisible();
  });
  test("35 bulk totals add up", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("run-bulk").click();
    const total = Number(await page.getByTestId("bulk-total").innerText());
    const ok = Number(await page.getByTestId("bulk-succeeded").innerText());
    const fail = Number(await page.getByTestId("bulk-failed").innerText());
    expect(ok + fail).toBe(total);
  });
  test("36 bulk re-run dedupes valid rows", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("select-alpha-prop-invalid").setChecked(false);
    await page.getByTestId("run-bulk").click();
    await expect(page.getByTestId("bulk-result")).toBeVisible();
    await page.getByTestId("rerun-bulk").click();
    await expect(page.getByTestId("row-ok-alpha-prop-1")).toContainText(/דילוג/);
  });
  test("37 beta bulk only sees beta property", async ({ page }) => {
    await loginAs(page, "beta-owner");
    await page.goto("/creative-lab/bulk");
    await expect(page.getByTestId("prop-beta-prop-1")).toBeVisible();
    await expect(page.getByTestId("prop-alpha-prop-1")).toHaveCount(0);
  });
  test("38 bulk result rows match selection count", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("select-alpha-prop-2").setChecked(false);
    await page.getByTestId("select-alpha-prop-invalid").setChecked(false);
    await page.getByTestId("run-bulk").click();
    await expect(page.getByTestId("bulk-total")).toContainText("1");
  });
  test("39 bulk-generated output visible in single workspace", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("select-alpha-prop-invalid").setChecked(false);
    await page.getByTestId("run-bulk").click();
    await expect(page.getByTestId("bulk-result")).toBeVisible();
    await page.getByTestId("nav-workspace").click();
    await expect(page.locator('[data-testid^="output-"]').first()).toBeVisible();
  });
  test("40 market_stat bulk kind runs", async ({ page }) => {
    await loginAs(page, "alpha-owner");
    await page.goto("/creative-lab/bulk");
    await page.getByTestId("select-alpha-prop-invalid").setChecked(false);
    await page.getByTestId("bulk-kind").selectOption("market_stat");
    await page.getByTestId("run-bulk").click();
    await expect(page.getByTestId("bulk-succeeded")).not.toContainText("0");
  });
});
