import { defineConfig, devices } from "@playwright/test";

// Browser E2E for the deterministic Creative test runtime (/creative-lab).
// Boots the REAL Next.js app with the guarded test runtime enabled — in-memory
// store + mock providers + local storage — WITHOUT Supabase or OpenAI. No
// Docker. The webServer inherits ZONO_CREATIVE_TEST_RUNTIME=true and is started
// with NO Supabase/OpenAI env so the runtime guard permits the test runtime.
const PORT = Number(process.env.LAB_E2E_PORT ?? 3123);
// Use localhost (the Next dev server's canonical origin) — NOT 127.0.0.1 — so
// the browser is same-origin with the server. This keeps server actions from
// being treated as cross-origin and keeps the session cookie on one host.
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e/creative-lab",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e/creative-lab/.report.json" }]],
  use: {
    baseURL: BASE,
    headless: true,
    // On CI / a normal machine, use the Playwright-installed Chromium (no
    // executablePath). Only pin a path when PW_CHROMIUM is explicitly provided
    // (e.g. the authoring sandbox's preinstalled binary).
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `${BASE}/creative-lab`,
    reuseExistingServer: !process.env.CI,
    // A cold first compile of this large app (especially on a laptop) can take
    // several minutes; give the dev server room so readiness isn't a false timeout.
    timeout: 600_000,
    env: {
      ZONO_CREATIVE_TEST_RUNTIME: "true",
      NODE_ENV: "development",
      // Deliberately unset: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_*, OPENAI_API_KEY,
      // CREATIVE_PUBLISHING_PROVIDER — their absence is what the runtime guard requires.
    },
  },
});
