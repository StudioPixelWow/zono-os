/**
 * Per-aspect reflow tests (pure layout for all formats × fixtures) + a real
 * PNG artifact generated with sharp (no OpenAI, no Docker).
 *   npx tsx src/lib/creative-studio/reflow.qa.ts
 */
import { buildReflowPlan, reflowQA, REFLOW_FORMATS, measureText, wrapText, fitText, MIN_FONT_PX } from "./reflow";
import type { OverlayContent, ReflowPlan } from "./reflow";

let passed = 0; const failures: string[] = [];
function ok(n: string, c: boolean) { if (c) passed++; else { failures.push(n); console.error("  x " + n); } }

const base: OverlayContent = {
  headline: "דירת 4 חדרים מרווחת", secondary: "קומה גבוהה עם נוף פתוח", price: "₪2,450,000",
  facts: ["4 חד'", "112 מ\"ר", "קומה 7"], cta: "לפרטים", phone: "050-1234567",
  identity: "דנה כהן · תיווך", footer: "© ZONO", marketSource: null, hasLogo: true, backgroundHex: "#101014",
};
const fixtures: Record<string, OverlayContent> = {
  short: { ...base, headline: "דירה למכירה" },
  long: { ...base, headline: "דירת גן ייחודית 5 חדרים עם חצר פרטית גדולה וממ\"ד במיקום מבוקש" },
  mixed: { ...base, headline: "Penthouse יוקרתי בלב תל אביב" },
  longAddress: { ...base, secondary: "רחוב אבן גבירול 125, תל אביב יפו, קומה 12" },
  bigPrice: { ...base, price: "₪18,900,000" },
  noPrice: { ...base, price: null },
  office: { ...base, headline: "משרד הנדל\"ן שלכם", identity: "סניף מרכז", price: null, facts: [] },
  market: { ...base, headline: "מחירים עלו 3.2%", price: null, facts: [], marketSource: "רשות המסים · 2026-07", identity: null },
  lightBg: { ...base, backgroundHex: "#F4F4F2" },
};

function testPrimitives() {
  ok("measure hebrew > 0", measureText("שלום", 40) > 0);
  ok("wrap splits long", wrapText("מילה אחת שתיים שלוש ארבע חמש שש שבע", 200, 40).length >= 2);
  const fit = fitText("כותרת ארוכה מאוד מאוד מאוד מאוד ארוכה", 400, 2, 72);
  ok("fit reduces font", fit.fontPx <= 72 && fit.fontPx >= MIN_FONT_PX);
}

function testAllFormatsFixtures() {
  let combos = 0, clean = 0;
  for (const f of REFLOW_FORMATS) {
    for (const [name, content] of Object.entries(fixtures)) {
      combos++;
      const plan: ReflowPlan = buildReflowPlan(f.key, content);
      const qa = reflowQA(plan);
      ok(`${f.key}/${name} dims`, plan.width === f.width && plan.height === f.height);
      if (qa.ok) clean++; else console.error(`  ! ${f.key}/${name}: ${qa.violations.join("; ")}`);
      ok(`${f.key}/${name} QA clean`, qa.ok);
    }
  }
  console.log(`  reflow combinations: ${combos}, QA-clean: ${clean}`);
}

async function testArtifact() {
  try {
    const sharp = (await import("sharp")).default;
    const plan = buildReflowPlan("ig_portrait", base);
    // deterministic SVG overlay from the plan (RTL right-aligned text)
    const texts = plan.elements.filter((e) => e.name !== "logo").map((e) => {
      const size = e.fontPx; const yBase = e.rect.y + size;
      return e.lines.map((ln, i) =>
        `<text x="${e.rect.x + e.rect.w}" y="${yBase + i * Math.round(size * 1.25)}" font-size="${size}" fill="#fff" text-anchor="end" font-family="sans-serif" direction="rtl">${ln.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`
      ).join("");
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.width}" height="${plan.height}"><rect width="100%" height="100%" fill="${base.backgroundHex}"/>${texts}</svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const meta = await sharp(png).metadata();
    ok("artifact dims 1080x1350", meta.width === 1080 && meta.height === 1350);
    ok("artifact non-empty png", png.length > 1000);
  } catch (e) {
    console.error("  (artifact generation skipped: " + (e as Error).message + ")");
    ok("artifact generation available", false);
  }
}

async function main() {
  console.log("Creative-Studio — Per-Aspect Reflow Tests");
  testPrimitives();
  testAllFormatsFixtures();
  await testArtifact();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL REFLOW TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
