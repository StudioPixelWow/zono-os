// ============================================================================
// ZONO — P4.6 social-ingestion SMOKE TEST (offline, CI-safe, read-only).
// Proves the ingestion → processing → cron pipeline is ASSEMBLED correctly
// (files, DDL, flag default, cron schedule, pure contracts). It does NOT hit a
// deployment or a database — the DEPLOYED smoke test is a manual curl procedure
// in docs/SOCIAL_INGESTION_PRODUCTION_READINESS.md.
//
// Run: npx tsx scripts/social-ingestion-smoke.ts
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeInteractionInput } from "../src/lib/social/ingest-normalize";
import { detectIntent } from "../src/lib/social/engine";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log("FAIL  " + name); } };
const has = (p: string) => existsSync(join(root, p));

// ── Migrations present with the required DDL ─────────────────────────────────
const m1 = "supabase/migrations/20270110120000_p4_1_social_interactions_idempotency.sql";
const m2 = "supabase/migrations/20270110120100_p4_1_group_post_source_link.sql";
const m5 = "supabase/migrations/20270115120000_p4_5_social_leads_idempotency.sql";
ok("P4.1 interaction idempotency migration present", has(m1) && read(m1).includes("social_interactions_org_ext_comment_uq"));
ok("P4.1 group-post source link migration present", has(m2) && read(m2).includes("source_post_id"));
ok("P4.5 social_leads idempotency migration present", has(m5) && read(m5).toLowerCase().includes("social_leads_org_interaction_uq"));
ok("P4.5 index is partial (nullable-safe)", read(m5).toLowerCase().includes("where social_interaction_id is not null"));

// ── Pipeline modules + routes present ────────────────────────────────────────
ok("producer present", has("src/lib/social/ingest.ts"));
ok("normalizer present", has("src/lib/social/ingest-normalize.ts"));
ok("attribution resolver present", has("src/lib/distribution/attribution.ts"));
ok("capture endpoint present", has("src/app/api/extension/facebook/capture-interaction/route.ts"));
ok("recompute cron present", has("src/app/api/cron/social-recompute/route.ts"));
ok("health endpoint present", has("src/app/api/internal/social/ingestion-health/route.ts"));
ok("extension capture helper present", has("browser-extension/zono-facebook-assistant/capture.js"));

// ── Feature flag is DARK by default ──────────────────────────────────────────
const ingestSrc = read("src/lib/social/ingest.ts");
ok("feature flag reads SOCIAL_INTERACTION_INGEST_ENABLED", ingestSrc.includes("SOCIAL_INTERACTION_INGEST_ENABLED"));
ok("feature flag off unless env === '1' (dark by default)", ingestSrc.includes('process.env.SOCIAL_INTERACTION_INGEST_ENABLED === "1"'));

// ── Cron scheduled + auth pattern ────────────────────────────────────────────
const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
ok("social-recompute scheduled in vercel.json", vercel.crons.some((c) => c.path === "/api/cron/social-recompute"));
ok("cron uses Bearer CRON_SECRET", read("src/app/api/cron/social-recompute/route.ts").includes("Bearer ${secret}"));
ok("health uses Bearer CRON_SECRET", read("src/app/api/internal/social/ingestion-health/route.ts").includes("Bearer ${secret}"));

// ── Review-first / no-CRM invariants in the processing path ──────────────────
const svc = read("src/lib/social/service.ts");
ok("recompute never emits lead.created", !/recompute[\s\S]*?emitBusinessEvent/.test(svc.split("export async function organizationsWithSocialInteractions")[0]));
ok("recompute uses insert-catch 23505 for the unique index", svc.includes("social_leads_org_interaction_uq") && svc.includes("23505"));
ok("recompute explicitly org-scopes reads", svc.includes('.eq("organization_id", orgId)'));

// ── Pure contracts sane (ingestion normalization + scoring) ──────────────────
ok("normalizer rejects empty capture", normalizeInteractionInput({}).ok === false);
ok("normalizer accepts a real comment", normalizeInteractionInput({ messageText: "מעוניין", externalCommentId: "fb1" }).ok === true);
ok("scoring qualifies a buyer comment", (() => { const r = detectIntent("מעוניין לקנות, מה המחיר?", "comment"); return r.intent !== "spam" && r.leadProbability >= 45; })());
ok("scoring survives null text (reaction)", detectIntent(null, "reaction").intent === "unknown");

console.log(`\nSocial-ingestion SMOKE: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
