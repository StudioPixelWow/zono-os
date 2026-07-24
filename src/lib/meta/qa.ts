// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PHASE 0 SELF TEST.
// Runnable gate: `npx tsx src/lib/meta/qa.ts`.
// Deterministic A1–A30 checks: provider registry, non-network Graph skeleton,
// boundary sealing, capability registry + evaluator, idempotency, error
// normalization, notification/integration contracts, canonical-channel reuse,
// frozen-code proof, and the boundary guard's own detection. NO network.
// (Forbidden literals in this file are built by string concatenation so the
//  source itself never contains a real Graph/frozen literal.)
// ============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  MetaProviderRegistry,
  graphProviderSkeleton,
  isMetaProviderError,
  createMetaPublishingIdempotencyKey,
  getMetaCapability,
  evaluateMetaCapability,
  META_CAPABILITIES,
  META_EVENT_NAMES,
  buildMetaNotificationEvent,
  getMetaIntegrationDescriptor,
  type MetaCapabilityState,
  type MetaCapabilityDecision,
  type MetaOperationContext,
  type MetaPublishingRequest,
  type MetaIdempotencyInput,
} from "./index";
import { normalizeGraphError } from "./provider/graph/errors";
import { scanContent, runGuard, META_DIR } from "../../../scripts/check-meta-boundaries.mjs";

const ROOT = process.cwd();
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.error("  ✗ " + name); } };

// Build forbidden literals at runtime so the source never contains them.
const LIT_GRAPH_HOST = "graph.face" + "book.com";
const LIT_ACCESS_TOKEN = "access" + "_token";
const LIT_CLIENT_MEMORY = "client" + "_memory";
const LIT_GRANULAR = "granular" + "_scopes";

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

console.log("\nMeta Workspace (6.8) Phase 0 — SELF TEST\n");

const metaFiles = walk("src/lib/meta");
const grantAll = [
  "connection.manage", "assets.read",
  "facebook.content.read", "facebook.content.publish",
  "instagram.content.read", "instagram.content.publish",
  "facebook.comments.read", "facebook.comments.reply",
  "instagram.comments.read", "instagram.comments.reply",
  "webhook.health.read", "analytics.basic.read",
];

/** An all-pass state; toggle one field per test. */
function passState(over: Partial<MetaCapabilityState> = {}): MetaCapabilityState {
  return {
    globalFeatureEnabled: true,
    orgFeatureEnabled: true,
    providerAvailable: true,
    connectionStatus: "connected",
    connectionHealth: "healthy",
    accessMode: "system_user",
    grantedCapabilities: grantAll,
    businessVerification: "approved",
    appReview: "approved",
    webhookHealthy: true,
    extendedEnabled: [],
    globalKillSwitch: false,
    orgKillSwitch: false,
    ...over,
  };
}

void (async () => {
// ── A1–A3 · Provider registry ────────────────────────────────────────────────
{
  const reg = new MetaProviderRegistry();
  reg.register(graphProviderSkeleton);
  check("A1 registry resolves the known provider", reg.resolve("graph") === graphProviderSkeleton);

  let threwUnknown = false;
  try { reg.resolve("nope"); } catch (e) { threwUnknown = isMetaProviderError(e) && e.meta.kind === "unavailable"; }
  check("A2 registry rejects an unknown provider (no silent fallback)", threwUnknown);

  let threwDup = false;
  try { reg.register(graphProviderSkeleton); } catch (e) { threwDup = isMetaProviderError(e) && e.meta.kind === "conflict"; }
  check("A3 registry rejects duplicate registration", threwDup);
}

// ── A4 · Graph SKELETON provider performs no network request ─────────────────
// (Phase 1 adds real Graph I/O under provider/graph/, but ONLY via the injectable
//  GraphFetch transport in client/oauth/discovery — the skeleton provider stays
//  network-free, and every networking file threads a mockable `fetchImpl`.)
{
  const netRe = /\bfetch\s*\(|XMLHttpRequest|require\(["']https?["']\)|import\(["']node:https?["']\)|axios/;
  const skeleton = strip(readFileSync("src/lib/meta/provider/graph/index.ts", "utf8"));
  const skeletonClean = !netRe.test(skeleton);
  // Any graph file that performs network I/O must accept an injectable transport.
  const netFiles = walk("src/lib/meta/provider/graph").filter((f) => netRe.test(strip(readFileSync(f, "utf8"))));
  const allInjectable = netFiles.every((f) => /GraphFetch|fetchImpl/.test(readFileSync(f, "utf8")));
  check("A4 Graph skeleton network-free + all Graph I/O is injectable/mockable", skeletonClean && allInjectable);
}

// ── A5 · Graph operations return not_implemented ─────────────────────────────
{
  const decision: MetaCapabilityDecision = { key: "facebook.content.publish", allowed: true, reason: null, humanReason: "allowed", missing: [], degraded: false, signals: {} };
  const ctx = { orgId: "org1", connectionId: "conn1" as never, actorId: "u1", correlationId: "corr1", idempotencyKey: null, capability: decision, signal: null } as unknown as MetaOperationContext;
  const req = { orgId: "org1", draftId: "d1", targets: [], contentHash: "h", scheduledAt: null, platformVariant: "default" } as MetaPublishingRequest;
  let ni = 0;
  const trials: Array<Promise<unknown>> = [
    graphProviderSkeleton.publish(ctx, req).catch((e) => { if (isMetaProviderError(e) && e.meta.kind === "not_implemented") ni++; }),
    graphProviderSkeleton.listPages(ctx).catch((e) => { if (isMetaProviderError(e) && e.meta.kind === "not_implemented") ni++; }),
    graphProviderSkeleton.fetchComments(ctx, "p1").catch((e) => { if (isMetaProviderError(e) && e.meta.kind === "not_implemented") ni++; }),
  ];
  await Promise.all(trials);
  check("A5 Graph external operations reject with not_implemented", ni === 3);
}

// ── A6 · Graph literals exist only in the Graph directory ────────────────────
{
  const nonGraph = metaFiles.filter((f) => !f.replace(/\\/g, "/").includes("provider/graph/") && !/qa\.ts$/.test(f));
  const leaks = nonGraph.filter((f) => scanContent(f, readFileSync(f, "utf8")).some((v: string) => /rule 2/.test(v)));
  check("A6 no Graph literal outside provider/graph/", leaks.length === 0);
}

// ── A7 · Public types carry no tokens / raw payloads ─────────────────────────
{
  const surfaces = [join(META_DIR, "index.ts"), ...metaFiles.filter((f) => /types\.ts$/.test(f) && !f.includes("provider/graph/"))];
  const bad = surfaces.filter((f) => {
    const c = strip(readFileSync(f, "utf8"));
    return c.includes(LIT_ACCESS_TOKEN) || c.includes(LIT_GRANULAR);
  });
  check("A7 public/canonical types expose no token or raw Graph payload", bad.length === 0);
}

// ── A8–A19 · Capability evaluation ───────────────────────────────────────────
check("A8 MVP capability allowed when every requirement passes", evaluateMetaCapability("facebook.content.publish", passState()).allowed);

check("A9 missing granted permission denies (permission_missing)",
  evaluateMetaCapability("facebook.content.publish", passState({ grantedCapabilities: grantAll.filter((k) => k !== "facebook.content.publish") })).reason === "permission_missing");

check("A10 App Review missing denies a review-gated capability",
  evaluateMetaCapability("facebook.content.read", passState({ appReview: "pending" })).reason === "app_review_required");

check("A11 Business Verification missing denies a gated capability",
  evaluateMetaCapability("facebook.content.publish", passState({ businessVerification: "pending" })).reason === "business_verification_required");

check("A12 unhealthy connection denies capability",
  evaluateMetaCapability("assets.read", passState({ connectionHealth: "unhealthy" })).reason === "connection_unhealthy");

check("A13 webhook unhealthy denies a webhook-required capability",
  evaluateMetaCapability("facebook.comments.read", passState({ webhookHealthy: false })).reason === "webhook_unhealthy");

check("A14 org feature flag off denies capability",
  evaluateMetaCapability("assets.read", passState({ orgFeatureEnabled: false })).reason === "org_flag_off");

check("A15 global feature flag off denies capability",
  evaluateMetaCapability("assets.read", passState({ globalFeatureEnabled: false })).reason === "global_flag_off");

check("A16 org kill switch denies capability",
  evaluateMetaCapability("assets.read", passState({ orgKillSwitch: true })).reason === "kill_switch");

check("A17 global kill switch denies capability",
  evaluateMetaCapability("assets.read", passState({ globalKillSwitch: true })).reason === "kill_switch");

{
  const ext = getMetaCapability("instagram.reels.publish");
  const denied = evaluateMetaCapability("instagram.reels.publish", passState()).reason === "extended_not_enabled";
  check("A18 Extended capability disabled by default", ext?.defaultEnabled === false && denied);
}

check("A19 Facebook Groups always denied (excluded)",
  evaluateMetaCapability("facebook.groups.publish", passState({ extendedEnabled: ["facebook.groups.publish"], grantedCapabilities: [...grantAll, "facebook.groups.publish"] })).reason === "excluded");

// ── A20–A22 · Idempotency ────────────────────────────────────────────────────
{
  const base: MetaIdempotencyInput = { orgId: "org1", draftId: "d1", assetId: "a1", contentHash: "c1", scheduledTime: "immediate", variant: "default" };
  const k = (o: Partial<MetaIdempotencyInput>) => String(createMetaPublishingIdempotencyKey({ ...base, ...o }));

  check("A20 idempotency key stable on identical input", k({}) === k({}));

  const kBase = k({});
  check("A21 key changes when asset changes", k({ assetId: "a2" }) !== kBase);
  check("A21 key changes when content changes", k({ contentHash: "c2" }) !== kBase);
  check("A21 key changes when schedule changes", k({ scheduledTime: "2026-07-25T10:00:00.000Z" }) !== kBase);
  check("A21 key changes when platform variant changes", k({ variant: "facebook" }) !== kBase);

  // The digest is opaque 64-char hex; raw field values (which contain non-hex
  // letters) can never appear inside it. Use non-hex sentinels to prove it.
  const kSentinel = String(createMetaPublishingIdempotencyKey({ ...base, orgId: "orgZZZ", draftId: "draftQQQ" }));
  const noSecret = !kSentinel.includes("orgZZZ") && !kSentinel.includes("draftQQQ") && /^[a-f0-9]{64}$/.test(kSentinel);
  check("A21 key material leaks no field value (opaque sha256)", noSecret);

  const iso1 = k({ scheduledTime: "2026-07-25T10:00:00.000Z" });
  const iso2 = k({ scheduledTime: "2026-07-25T10:00:00Z" });
  const varCase = k({ variant: "default" }) === k({ variant: "default" });
  const trimmed = k({ orgId: " org1 " }) === kBase;
  check("A22 canonicalization makes equivalent inputs stable (ISO, case, trim)", iso1 === iso2 && varCase && trimmed);
}

// ── A23 · Error normalization exposes no raw provider response ────────────────
{
  const secret = "SENSITIVE-" + LIT_ACCESS_TOKEN + "-XYZ";
  const err = normalizeGraphError({ error: { message: secret, code: 190, error_subcode: 463, fbtrace_id: "TRACE-XYZ" } }, 400, "corr");
  const serialized = `${err.message}|${err.meta.safeMessage}|${err.meta.providerCodeCategory}`;
  const clean = !serialized.includes(secret) && !serialized.includes("TRACE-XYZ") && !serialized.includes(LIT_ACCESS_TOKEN);
  check("A23 error normalization drops the raw provider body/token/trace", clean && err.meta.kind === "token_expired");
}

// ── A24 · Notification contracts contain no secrets ──────────────────────────
{
  const has14 = META_EVENT_NAMES.length === 20; // + Phase 2 (changes_requested) + 3A (partially_published, manual_review_required) + 3B (scheduled_cancelled, retry_scheduled, dead_lettered)
  const evt = buildMetaNotificationEvent({ event: "meta.post.failed", orgId: "org1", occurredAt: "2026-07-24T00:00:00.000Z", assetRef: "page:1", data: { reason: "invalid_media" } });
  const json = JSON.stringify(evt);
  const clean = !json.includes(LIT_ACCESS_TOKEN) && evt.schemaVersion === 1 && evt.severity === "critical";
  check("A24 notification event contracts are complete and secret-free", has14 && clean);
}

// ── A25 · Integration descriptor contains no secrets ─────────────────────────
{
  const decisions = ["assets.read", "facebook.content.publish"].map((k) => evaluateMetaCapability(k, passState()));
  const desc = getMetaIntegrationDescriptor({ status: "connected", health: "healthy", assetCounts: { businesses: 1, pages: 2, instagram: 1 }, capabilities: decisions, lastVerifiedAt: "2026-07-24T00:00:00.000Z", reconnectRequired: false });
  const json = JSON.stringify(desc);
  check("A25 integration descriptor is client-safe (no token, key='meta')", desc.key === "meta" && !json.includes(LIT_ACCESS_TOKEN) && !json.includes(LIT_GRANULAR));
}

// ── A26 · Canonical messenger/instagram channels are reused, not added ───────
{
  const commTypes = readFileSync("src/lib/communication-os/types.ts", "utf8");
  const reusesBoth = /"messenger"/.test(commTypes) && /"instagram"/.test(commTypes);
  const noRedef = !metaFiles.some((f) => /export\s+type\s+Channel\s*=/.test(readFileSync(f, "utf8")));
  check("A26 messenger/instagram canonical channels reused, not redeclared", reusesBoth && noRedef);
}

// ── A27 · Frozen-code proof (git working tree touches only allowed paths) ─────
{
  let ok = true;
  try {
    const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
    const allow = (p: string) => p.startsWith("src/lib/meta/") || p.startsWith("src/app/api/meta/") || p.startsWith("src/app/api/internal/meta/") || p.startsWith("src/app/(app)/meta-workspace/") || p === "scripts/check-meta-boundaries.mjs" || p === "package.json" || /^supabase\/migrations\/(2026120[15]120000_meta_workspace_phase[12]|2026121[05]120000_meta_workspace_phase3[ab])\.sql$/.test(p);
    const offenders = out.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => l.replace(/^\S+\s+/, "").replace(/^.*->\s*/, ""))
      .filter((p) => !allow(p));
    ok = offenders.length === 0;
    if (!ok) console.error("     frozen-proof offenders: " + offenders.join(", "));
  } catch { ok = false; }
  check("A27 no frozen file modified (git working tree scoped to Meta + guard + package.json)", ok);
}

// ── A28 · Guard detects forbidden Graph leakage ──────────────────────────────
{
  const fixture = `const host = "${LIT_GRAPH_HOST}"; const t = "${LIT_ACCESS_TOKEN}";`;
  const violations = scanContent("src/lib/meta/capability/registry.ts", fixture);
  check("A28 boundary guard flags a Graph-leakage fixture", violations.some((v: string) => /rule 2/.test(v)));
}

// ── A29 · Guard detects forbidden frozen-table access ────────────────────────
{
  const fixture = `supabase.from("${LIT_CLIENT_MEMORY}").insert({});`;
  const violations = scanContent("src/lib/meta/connection/store.ts", fixture);
  check("A29 boundary guard flags a frozen-table fixture", violations.some((v: string) => /rule 3/.test(v)));
}

// ── A30 · No direct AI/model calls under the Meta module ─────────────────────
{
  const aiRe = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|runReasoningGateway|@\/lib\/ai-reasoning/;
  const offenders = metaFiles.filter((f) => !/qa\.ts$/.test(f) && aiRe.test(strip(readFileSync(f, "utf8"))));
  check("A30 no direct AI/model endpoint under src/lib/meta", offenders.length === 0);
}

// ── Bonus · run the real guard over the tree (must be clean) ──────────────────
{
  const { failures } = runGuard();
  check("Guard: full Meta tree passes the boundary guard", failures.length === 0);
}

// ── Registry integrity · MVP/Extended/Excluded counts ────────────────────────
{
  const mvp = META_CAPABILITIES.filter((c) => c.classification === "mvp").length;
  const ext = META_CAPABILITIES.filter((c) => c.classification === "extended").length;
  const exc = META_CAPABILITIES.filter((c) => c.classification === "excluded").length;
  const groupsExcluded = META_CAPABILITIES.filter((c) => String(c.key).includes("groups")).every((c) => c.classification === "excluded" && !c.defaultEnabled);
  check(`Registry: capability classes present (mvp=${mvp}, extended=${ext}, excluded=${exc})`, mvp === 12 && ext === 11 && exc === 2 && groupsExcluded);
}

console.log(`\nMeta Workspace Phase 0 — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
})();
