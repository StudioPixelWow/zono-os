/**
 * Creative-studio extension — unit tests (pure logic, no native deps/network).
 *   npx tsx src/lib/creative-studio/visual-gen-extensions.qa.ts
 * Covers: model config, retry classification/backoff/runner, brand resolution,
 * creative kinds + market-stat sourcing, output lineage, usage redaction,
 * contrast/safe-zone/logo math, platform sizes.
 */
import { resolveImageModel, DEFAULT_IMAGE_MODEL, validateImageConfig, SUPPORTED_IMAGE_MODELS } from "./model-config";
import {
  computeLogoPlacement, platformSize, PLATFORM_SIZES,
  relativeLuminance, chooseLogoVariant, placementCollides, safeLogoPlacement,
} from "./visual-gen-math";
import {
  classifyProviderError, isRetryable, computeBackoffMs, withProviderRetry,
} from "./provider-retry";
import { resolveBrandAssets } from "./brand-asset-resolver";
import type { BrandIdentityRow } from "./brand-asset-resolver";
import { validateMarketStat, requiredAssetsFor, isKnownKind, isNewKind, NEW_CREATIVE_KINDS } from "./creative-kinds";
import { buildDerivedLineage, buildRestoreLineage, isImmutableHistory, LineageError, orderVersions } from "./output-lineage";
import { buildUsageEvent, redact } from "./usage-logging";

let passed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) { if (cond) passed++; else { failures.push(name); console.error("  x " + name); } }
async function throws(name: string, fn: () => unknown, kind?: new (...a: never[]) => Error) {
  try { await fn(); failures.push(name + " (no throw)"); console.error("  x " + name); }
  catch (e) { if (kind && !(e instanceof kind)) { failures.push(name + " wrong err"); console.error("  x " + name); } else passed++; }
}

function testModelConfig() {
  const a = process.env.OPENAI_IMAGE_MODEL, b = process.env.ZONO_OPENAI_IMAGE_MODEL, k = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_IMAGE_MODEL; delete process.env.ZONO_OPENAI_IMAGE_MODEL; delete process.env.OPENAI_API_KEY;
  ok("default model gpt-image-2", resolveImageModel() === "gpt-image-2" && DEFAULT_IMAGE_MODEL === "gpt-image-2");
  ok("gpt-image-2 supported; gpt-image-1 retired", (SUPPORTED_IMAGE_MODELS as readonly string[]).includes("gpt-image-2") && !(SUPPORTED_IMAGE_MODELS as readonly string[]).includes("gpt-image-1"));  const noKey = validateImageConfig();
  ok("no key → mock + not liveReady", noKey.provider === "mock" && noKey.liveReady === false && noKey.notes.length > 0);
  process.env.OPENAI_API_KEY = "sk-test";
  const withKey = validateImageConfig();
  ok("key → openai + liveReady", withKey.provider === "openai" && withKey.liveReady === true);
  process.env.OPENAI_IMAGE_MODEL = "made-up-model";
  ok("unknown model flagged", validateImageConfig().modelRecognized === false);
  if (a === undefined) delete process.env.OPENAI_IMAGE_MODEL; else process.env.OPENAI_IMAGE_MODEL = a;
  if (b === undefined) delete process.env.ZONO_OPENAI_IMAGE_MODEL; else process.env.ZONO_OPENAI_IMAGE_MODEL = b;
  if (k === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = k;
}

async function testRetry() {
  ok("429 transient", classifyProviderError({ status: 429 }).klass === "transient");
  ok("502/503 transient", classifyProviderError({ status: 502 }).klass === "transient" && classifyProviderError({ status: 503 }).klass === "transient");
  ok("401 auth (no retry)", classifyProviderError({ status: 401 }).klass === "auth" && !isRetryable("auth"));
  ok("400 invalid (no retry)", classifyProviderError({ status: 400 }).klass === "invalid_input");
  ok("safety (no retry)", classifyProviderError({ message: "content policy violation" }).klass === "safety");
  ok("unsupported model (no retry)", classifyProviderError({ message: "model_not_found" }).klass === "unsupported");
  ok("timeout transient", classifyProviderError({ message: "socket hang up ETIMEDOUT" }).klass === "transient");
  ok("only transient retryable", isRetryable("transient") && !isRetryable("permanent"));
  const d1 = computeBackoffMs(1, { jitter: false }), d2 = computeBackoffMs(2, { jitter: false }), d3 = computeBackoffMs(3, { jitter: false });
  ok("backoff grows + caps", d1 === 500 && d2 === 1000 && d3 === 2000);
  ok("backoff jitter within bound", computeBackoffMs(2, {}, () => 0) === 500);
  let calls = 0;
  const r = await withProviderRetry(async () => { calls++; if (calls < 3) throw { status: 503 }; return "ok"; }, { maxAttempts: 3 }, { sleep: async () => {}, now: () => 0 });
  ok("retry succeeds on transient", r.ok && r.value === "ok" && r.attempts === 3);
  let calls2 = 0;
  const r2 = await withProviderRetry(async () => { calls2++; throw { status: 400 }; }, { maxAttempts: 3 }, { sleep: async () => {}, now: () => 0 });
  ok("no retry on permanent", !r2.ok && calls2 === 1 && r2.lastClass === "invalid_input");
}

function testBrandResolution() {
  const agentApproved: BrandIdentityRow = {
    entity_type: "agent", status: "approved", logo_status: "approved", profile_image_status: "approved",
    logo_transparent_url: "agent-logo.png", profile_image_url: "agent-photo.jpg",
    brand_primary: "#0A0A0A", phone: "050-1112222", display_name: "דנה", office_name: "משרד א",
  };
  const office: BrandIdentityRow = { entity_type: "office", status: "approved", logo_status: "approved", logo_url: "office-logo.png", brand_primary: "#111111", office_name: "משרד המשרד", phone: "03-0000000" };
  const r = resolveBrandAssets({ identities: [office, agentApproved], org: { name: "Org", logo_url: "org.png" }, agentUser: { full_name: "פולבק", avatar_url: "avatar.jpg", phone: "051" } });
  ok("agent transparent logo wins", r.logoTransparent === "agent-logo.png");
  ok("brand profile image beats avatar", r.profileImage === "agent-photo.jpg" && r.sources.profileImage === "agent.profile_image");
  ok("agent phone preferred", r.phone === "050-1112222");
  ok("agent name resolved", r.agentName === "דנה");

  const agentDraft: BrandIdentityRow = { entity_type: "agent", status: "approved", profile_image_status: "draft", profile_image_url: "draft.jpg" };
  const r2 = resolveBrandAssets({ identities: [agentDraft], agentUser: { avatar_url: "avatar.jpg", full_name: "x" } });
  ok("unapproved brand photo not used", r2.profileImage === "avatar.jpg" && r2.warnings.some((w) => w.includes("legacy")));

  const rejected: BrandIdentityRow = { entity_type: "agent", status: "rejected", logo_transparent_url: "nope.png" };
  const r3 = resolveBrandAssets({ identities: [rejected] });
  ok("rejected identity ignored", r3.logoTransparent === null && r3.warnings.some((w) => w.includes("logo")));
}

function testCreativeKinds() {
  ok("new kinds present", NEW_CREATIVE_KINDS.length === 3 && isNewKind("agent_brand") && isNewKind("market_stat"));
  ok("existing kinds still known", isKnownKind("property_ad_post") && isKnownKind("sold_post"));
  ok("agent_brand needs photo+logo", requiredAssetsFor("agent_brand").agentPhoto && requiredAssetsFor("agent_brand").logo);
  ok("property needs property", requiredAssetsFor("property_ad_post").property);
  const bad = validateMarketStat({ subtype: "price_change", value: 5 });
  ok("market stat missing provenance rejected", !bad.ok && bad.missing.includes("source"));
  const good = validateMarketStat({ subtype: "price_change", value: 5, source: "gov.il", period: "2026-07", geography: "TLV", freshnessTimestamp: "2026-08-01T00:00:00Z", comparisonBasis: "MoM", classification: "factual" });
  ok("fully-sourced stat accepted", good.ok);
}

function testLineage() {
  const l0 = buildDerivedLineage(null, { mode: "initial", provider: "openai", model: "gpt-image-2" });
  ok("initial round 1, no parent", l0.generationRound === 1 && l0.parentOutputId === null && l0.rootOutputId === null);
  const parent = { id: "o1", generation_round: 1, status: "generated" };
  const l1 = buildDerivedLineage(parent, { mode: "refine", provider: "openai", model: "gpt-image-2", refinementReason: "brighter" });
  ok("refine round 2, root=parent", l1.generationRound === 2 && l1.rootOutputId === "o1" && l1.parentOutputId === "o1");
  ok("approved is immutable", isImmutableHistory({ id: "a", is_approved: true }) && isImmutableHistory({ id: "b", status: "rejected" }));
  const restore = buildRestoreLineage({ id: "o1", generation_round: 3 }, "openai", "gpt-image-2");
  ok("restore creates new version", restore.mode === "restore" && restore.generationRound === 4);
  ok("order versions oldest→newest", orderVersions([{ id: "b", generation_round: 3 }, { id: "a", generation_round: 1 }])[0].id === "a");
}

async function testLineageGuard() {
  await throws("cannot overwrite approved in place", () =>
    buildDerivedLineage({ id: "o1", is_approved: true }, { mode: "refine", provider: "openai", model: "m", overwriteInPlace: true }), LineageError);
}

function testUsageLogging() {
  const ev = buildUsageEvent({ orgId: "org1", actorId: "u1", provider: "openai", model: "gpt-image-2", operation: "generate", inputImages: 3, outputImages: 1, width: 1080, height: 1350, durationMs: 4200, success: true, cost: { basis: "unavailable" } });
  ok("usage event org-scoped", ev.org_id === "org1" && ev.event_type === "creative_generation");
  ok("usage records model+op", ev.payload.model === "gpt-image-2" && ev.payload.operation === "generate");
  ok("cost basis preserved, no invented cost", ev.payload.cost_basis === "unavailable" && ev.payload.cost_usd === null);
  const red = redact({ apiKey: "sk-secret", authorization: "Bearer x", model: "gpt-image-2", prompt: "long", huge: "y".repeat(1000) });
  ok("redaction drops secrets/prompt/blobs", !("apiKey" in red) && !("authorization" in red) && !("prompt" in red) && !("huge" in red) && red.model === "gpt-image-2");
}

function testMathAndSizes() {
  const p = computeLogoPlacement(1080, 1350, 400, 120);
  ok("logo 35% width", p.targetLogoW === Math.round(1080 * 0.35));
  ok("logo centered + 3% margin", p.left === Math.round((1080 - p.targetLogoW) / 2) && p.top === Math.round(1350 - p.targetLogoH - 1350 * 0.03));
  ok("maxWidth cap respected", computeLogoPlacement(2000, 2000, 100, 30, { maxWidthPx: 300 }).targetLogoW === 300);
  ok("dark bg → light logo", chooseLogoVariant("#000000") === "light");
  ok("light bg → dark logo", chooseLogoVariant("#FFFFFF") === "dark");
  ok("luminance ordered", relativeLuminance("#000000") < relativeLuminance("#808080") && relativeLuminance("#808080") < relativeLuminance("#FFFFFF"));
  const zones = [{ name: "price", x: 0.2, y: 0.9, w: 0.6, h: 0.08 }];
  const base = computeLogoPlacement(1080, 1350, 400, 120);
  ok("center-bottom collides with price zone", placementCollides(1080, 1350, base, zones) !== null);
  const safe = safeLogoPlacement(1080, 1350, 400, 120, zones);
  ok("safe placement avoids price zone", placementCollides(1080, 1350, safe.placement, zones) === null);
  ok("five platform sizes", PLATFORM_SIZES.length === 5);
  ok("fb 1200x630", platformSize("facebook")!.width === 1200 && platformSize("facebook")!.height === 630);
  ok("ig portrait 1080x1350", platformSize("instagram_portrait")!.width === 1080 && platformSize("instagram_portrait")!.height === 1350);
  ok("story 1080x1920", platformSize("story")!.width === 1080 && platformSize("story")!.height === 1920);
  ok("aspect computed", platformSize("instagram_square")!.aspect === "1:1" && platformSize("story")!.aspect === "9:16");
}

async function main() {
  console.log("Creative-Studio Extension — Unit Tests");
  testModelConfig();
  await testRetry();
  testBrandResolution();
  testCreativeKinds();
  testLineage();
  await testLineageGuard();
  testUsageLogging();
  testMathAndSizes();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL CREATIVE-STUDIO EXTENSION TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
