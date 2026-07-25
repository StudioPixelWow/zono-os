#!/usr/bin/env node
// ============================================================================
// 🛡️ ZONO — Batch 6.8 · META WORKSPACE BOUNDARY GUARD.
//
// Locks the Meta Workspace architectural invariants. Fails the build on any leak.
// Rules (from the Phase 0 command):
//   1. No Meta module imports a WhatsApp/Evolution/Batch-6.6(A) transport
//      internal, nor a transport-specific message table.
//   2. Graph implementation literals (graph.facebook.com, access_token, endpoint
//      fragments, raw Meta permission strings, raw Graph payload fields) appear
//      ONLY under src/lib/meta/provider/graph/.
//   3. Meta Workspace never references frozen tables (Communication OS, Copilot,
//      client_memory, ai_memory, Command Center, WhatsApp).
//   4. No direct model endpoint / AI provider under src/lib/meta/.
//   5. No non-Graph file imports Graph INTERNALS (compat/errors/types) — a raw
//      Graph response cannot leak upward.
//   6. Tokens do not appear in the module's exported public surface.
//   7. Facebook Groups are never marked enabled / MVP / Extended (excluded only).
//
// The core scan is exported (scanContent / runGuard) so the Phase 0 QA can drive
// it against synthetic fixtures. Comments are stripped before scanning so doc
// headers don't trip the guard. When run directly it scans `src` and exits.
// ============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const META_DIR = "src/lib/meta";
export const GRAPH_DIR = "src/lib/meta/provider/graph";
// Phase 3B — the scheduling / queue / worker / retry / dead-letter module lives
// ONLY here. It is the ONE place background publishing orchestration is allowed;
// it must still route ALL provider work through the Phase-3A publish service seam
// (never a Graph import, never a second publishing engine).
export const SCHEDULE_DIR = "src/lib/meta/schedule";
const inScheduleDir = (p) => p.replace(/\\/g, "/").includes("/schedule/");

const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── Rule 1 — transport internals must never be imported by a Meta module. ────
const TRANSPORT_IMPORT = /from ["']@\/lib\/whatsapp\/|import\(["']@\/lib\/whatsapp\/|evolution-api|evoapicloud|EVOLUTION_API/;

// ── Rule 2 — Graph implementation literals (only allowed under GRAPH_DIR). ────
const GRAPH_LITERALS = new RegExp(
  [
    "graph\\.facebook\\.com",
    "access_token",
    "/me/accounts",
    "/me/businesses",
    "instagram_business_account",
    "granular_scopes",
    "fbtrace_id",
    // raw Meta permission strings
    "pages_manage_posts",
    "pages_manage_engagement",
    "pages_read_engagement",
    "pages_show_list",
    "pages_messaging",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_messages",
    "instagram_basic",
    "business_management",
    "read_insights",
  ].join("|"),
);

// ── Rule 3 — frozen table references (any of these string names). ────────────
const FROZEN_TABLES = /whatsapp_conversations|whatsapp_messages|copilot_[a-z_]+|client_memory|ai_memory|canonical_ai_memory|communication_summaries|\bjourneys\b|command_center_[a-z_]+/;

// ── Rule 4 — direct model endpoints / AI providers. ──────────────────────────
const MODEL_ENDPOINT = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis/;

// ── Rule 5 — Graph internals imported from outside GRAPH_DIR. ────────────────
const GRAPH_INTERNAL_IMPORT = /provider\/graph\/(compat|errors|types)/;

// Graph PUBLISH endpoint literals — allowed ONLY inside provider/graph/ (like
// other Graph specifics); a leak elsewhere is a rule-8 violation.
const GRAPH_PUBLISH_LITERALS = /scheduled_publish_time|media_publish|createMediaContainer|\/media_publish/;

// ── Rule 8 (Phase 2/3A) — no storage-secret / raw-bytes / auto-send / auto-retry
//    leakage. Applied everywhere under the Meta module + routes/UI (Graph + QA
//    exempt for the publish-endpoint subset). ──────────────────────────────────
const PHASE2_FORBIDDEN = new RegExp(
  [
    "publishToMeta", "executePublish", "publishNow", "runPublish", // functional publish
    "autoPublish", "autoReply", // no automatic send behavior
    "media_bytes", "file_bytes", "\\bbytea\\b", // raw media bytes in DB
    "SUPABASE_SERVICE_ROLE_KEY", // storage/service secret exposure
    "requiresApproval:\\s*false", // approval must not be bypassed
    "graph_payload",            // raw Graph payload as draft data
    // Phase 3A — no automatic retry / background execution of publishing.
    "autoRetry", "retryWorker", "retryMiddleware", "backgroundPoll", "\\bsetInterval\\b",
    "scheduledPublish", "publishScheduler", "publishQueue", "publishWorker", "publishCron",
  ].join("|"),
);

/** Is a file path inside the sealed Graph directory? */
const inGraphDir = (p) => p.replace(/\\/g, "/").includes("provider/graph/");
/** Is a file the QA harness (may name banned things via escaped construction)? */
const isQa = (p) => /qa\.ts$/.test(p);

// ── Phase 3C — reconciliation must VERIFY, never mutate provider content, and
//    never ingest comments/messaging/analytics. These function identifiers must
//    not appear anywhere under the reconciliation / webhook surface. ────────────
const inReconOrWebhook = (p) => { const n = p.replace(/\\/g, "/"); return n.includes("/lib/meta/reconcile/") || n.includes("/lib/meta/webhooks/"); };
// ── Phase 3 (6.9) — the Unified Inbox is a LOCAL projection over already-ingested
//    canonical comment data. It must NEVER import the sealed Graph layer (no Graph
//    call at all) and must NEVER reference the Communication OS conversation model
//    (it is Meta-workspace-scoped; it references, never duplicates). ──────────────
const inInboxDir = (p) => p.replace(/\\/g, "/").includes("/lib/meta/inbox/");
const COMM_OS_CONVERSATION_TABLES = /communication_(threads|messages|conversations|intelligence_profiles|commitments|followups)\b/;

// ── Phase 4 (6.9) — Engagement Intelligence. AI outputs are SUGGESTIONS ONLY.
//    The intelligence module reuses the ONE AI Reasoning boundary + the existing
//    Communication Copilot — never a second gateway / reply engine, never a direct
//    model call, never a provider write, never raw prompt/response persistence. ──
const inIntelDir = (p) => p.replace(/\\/g, "/").includes("/lib/meta/intelligence/");
// The AI/Copilot integration is allowed ONLY in these two adapter files.
const isIntelAiAdapter = (p) => { const n = p.replace(/\\/g, "/"); return /\/lib\/meta\/intelligence\/(reasoning|copilot)\.ts$/.test(n); };
// A second AI gateway / direct model client (forbidden anywhere under intelligence).
const INTEL_SECOND_GATEWAY = /\bnew OpenAI\b|from ["']openai["']|from ["']@anthropic|createChatCompletion|function\s+openAIProvider|responseFormat|v1\/chat\/completions/;
// A second reply-generation engine (the Copilot/Draft-Studio composer must be REUSED, not redefined).
const INTEL_SECOND_REPLY_ENGINE = /function\s+composeBody|export\s+function\s+generateReplySuggestions|function\s+buildReplyBody/;
// Raw prompt/response persistence (forbidden — only safe derived signals are stored).
const INTEL_RAW_PERSIST = /raw_prompt|raw_response|prompt_text\b|response_text\b|model_response|rawPrompt|rawResponse|promptBody|responseBody/;
// AI output auto-executing an action / a provider write (forbidden — accept routes into existing approval-gated flows).
const INTEL_AUTO_EXECUTE = /replyToComment|hideComment|deleteComment|\bsendMessage\b|executeModeration|autoReply|autoPublish|publishToProvider|executePublish|\.moderate\(/;

// ── Phase 5 (6.9) — Social Listening. Provider-isolated, READ-ONLY, no open-web
//    scraping, no arbitrary target, no browser→Meta, no second queue/inbox/model. ──
const inListeningDir = (p) => p.replace(/\\/g, "/").includes("/lib/meta/listening/");
const LISTENING_OPEN_WEB = /puppeteer|playwright|cheerio|jsdom|\bscrape\b|\bscraping\b|\bcrawl\b|web_?crawl|htmlparser/i;
const LISTENING_ARBITRARY_TARGET = /profileUrl|profile_url|targetAccount|target_account|externalProfile|monitorUrl|monitor_url|arbitraryTarget|watchUsername|keywordCrawl/;
// NB: `rawBody` (the webhook verify INPUT, passed to verifySignatureDualSecret like
// the engagement handler) is legitimate — the concern is STORING a raw payload.
const LISTENING_RAW = /raw_payload|raw_body\b|response_body|request_body|webhook_signature|providerResponseBody|rawCursor|raw_cursor/;
const LISTENING_AI_DIRECT = /@\/lib\/ai-reasoning|@\/lib\/comm-copilot|@\/lib\/draft-studio/;
const LISTENING_UNBOUNDED = /while\s*\(\s*true\s*\)|\bsetInterval\b|for\s*\(\s*;\s*;\s*\)/;
const LISTENING_AUTO_EXECUTE = /replyToComment|hideComment|deleteComment|\bsendMessage\b|\.moderate\(|publishToProvider|executePublish|followUser|likeMedia/;
// A raw HTTP client in the listening MODULE (all provider I/O goes through the sealed gateway).
const LISTENING_RAW_HTTP = /\bfetch\s*\(|XMLHttpRequest|\baxios\b|node-fetch|got\(/;
const PHASE3C_FORBIDDEN = /fetchComments|replyToComment|hideComment|deleteComment|fetchPostMetrics|sendMessage|normalizeInboundMessage|post_insights|fetchInsights|engagement_inbox|engagementInbox|recreatePost|republishObject|deleteProviderObject|editProviderObject|adAccount|campaignInsights/;
// Raw webhook payload / signature / app secret must never reach a safe surface.
const PHASE3C_LEAK = /rawBody\b|raw_payload|webhook_signature|signatureValue|x-hub-signature|app_secret|META_APP_SECRET/i;

/**
 * Scan a single file's content and return violation strings. `path` is the
 * repo-relative path (used to decide whether Graph literals are allowed here).
 * Exported so QA can feed synthetic fixtures without writing to disk.
 */
export function scanContent(path, rawCode) {
  const out = [];
  const norm = path.replace(/\\/g, "/");
  const code = strip(rawCode);

  if (TRANSPORT_IMPORT.test(code)) out.push(`${path}: imports a transport/Evolution internal — Meta must stay provider-isolated (rule 1)`);
  if (FROZEN_TABLES.test(code)) out.push(`${path}: references a frozen table (Communication OS / Copilot / memory / Command Center / WhatsApp) (rule 3)`);
  if (MODEL_ENDPOINT.test(code)) out.push(`${path}: calls a model endpoint directly — no AI provider under the Meta module (rule 4)`);

  // Graph literals — allowed only inside the sealed Graph directory.
  if (!inGraphDir(norm) && GRAPH_LITERALS.test(code)) {
    out.push(`${path}: Graph implementation literal outside provider/graph/ (rule 2)`);
  }
  // Graph internals may be imported only by files inside the Graph directory.
  if (!inGraphDir(norm) && GRAPH_INTERNAL_IMPORT.test(code)) {
    out.push(`${path}: imports Graph internals (compat/errors/types) outside provider/graph/ (rule 5)`);
  }
  // Rule 8 (Phase 2/3A) — no storage-secret / raw-bytes / auto-send / auto-retry leakage.
  if (PHASE2_FORBIDDEN.test(code)) {
    out.push(`${path}: Phase-2/3A forbidden token (storage-secret/raw-bytes/auto-send/auto-retry/approval-bypass) (rule 8)`);
  }
  // Graph publish endpoint literals may live ONLY inside provider/graph/.
  if (!inGraphDir(norm) && GRAPH_PUBLISH_LITERALS.test(code)) {
    out.push(`${path}: Graph publish endpoint literal outside provider/graph/ (rule 8)`);
  }
  // Rule 7 — Facebook Groups capability lines must be classified excluded.
  const lines = code.split("\n");
  for (const line of lines) {
    if (/groups\.(read|publish)/.test(line) && !/excluded/.test(line)) {
      out.push(`${path}: Facebook Groups capability not marked "excluded" (rule 7)`);
    }
  }
  // Rule 10 (Phase 3C) — reconciliation/webhook surface must never publish/edit/
  // delete provider content nor ingest comments/messaging/analytics.
  if (inReconOrWebhook(norm) && PHASE3C_FORBIDDEN.test(code)) {
    out.push(`${path}: reconciliation must verify only — no provider write / comments / messaging / analytics (rule 10)`);
  }
  // Rule 11 (Phase 3C / 6.9 P2) — a Graph WRITE method may not appear in a READ-
  // ONLY path: reconciliation, the sealed inspection module, the insights module,
  // or the sealed insights gateway (analytics is strictly read-only).
  const inInsights = norm.includes("/lib/meta/insights/") || /provider\/graph\/insights\.ts$/.test(norm);
  if ((inReconOrWebhook(norm) || inInsights || /provider\/graph\/inspect\.ts$/.test(norm)) && /method:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(code)) {
    out.push(`${path}: a write HTTP method in a read-only path (verification/insights) is forbidden (rule 11)`);
  }
  // Rule 12 (Phase 3C) — the webhook payload parser must NOT read an org identity
  // from the payload; the org is derived from trusted mappings only.
  if (/webhooks\/normalize\.ts$/.test(norm) && /org_?id/i.test(code)) {
    out.push(`${path}: webhook normalization must not read an org id from the payload (rule 12)`);
  }
  // Rule 10 (Phase 3C) — a safe read model must never surface a raw webhook
  // payload / signature / app secret.
  if (/\/(read|dto)\.ts$/.test(norm) && PHASE3C_LEAK.test(code)) {
    out.push(`${path}: a raw webhook payload / signature / app secret must not appear in a safe read model (rule 10)`);
  }
  // Rule 13 (6.9 Phase 1) — no browser→provider comment path: a route / UI file
  // must not construct or call the sealed comments gateway. Moderation goes
  // through the server action → approval → durable queue, never a direct call.
  if (norm.startsWith("src/app/") && /createCommentsGateway|\.fetchComments\(|\.moderate\(/.test(code)) {
    out.push(`${path}: a route/UI must not construct or call the comments gateway — moderate via the server + approval + queue (rule 13)`);
  }
  // Rule 14 (6.9 Phase 3) — the Unified Inbox is a local projection: it must not
  // import the sealed Graph layer (no Graph call), and no Meta module may reference
  // the Communication OS conversation model (the inbox references, never duplicates).
  if (inInboxDir(norm) && (/from ["'][^"']*provider\/graph/.test(code) || /import\(["'][^"']*provider\/graph/.test(code))) {
    out.push(`${path}: the unified inbox must not import provider/graph — it is a local projection over canonical comment data, with NO Graph call (rule 14)`);
  }
  if (COMM_OS_CONVERSATION_TABLES.test(code)) {
    out.push(`${path}: references the Communication OS conversation model — the Meta inbox is Meta-scoped and must not duplicate/reference it (rule 14)`);
  }
  // Rule 15 (6.9 Phase 4) — Engagement Intelligence boundaries.
  if (inIntelDir(norm)) {
    if (/from ["'][^"']*provider\/graph/.test(code) || /import\(["'][^"']*provider\/graph/.test(code)) {
      out.push(`${path}: the intelligence module must not import provider/graph — it never calls Meta (rule 15)`);
    }
    if (INTEL_SECOND_GATEWAY.test(code)) {
      out.push(`${path}: a second AI gateway / direct model client is forbidden — reuse the shipped AI Reasoning boundary (@/lib/ai-reasoning) (rule 15)`);
    }
    if (INTEL_SECOND_REPLY_ENGINE.test(code)) {
      out.push(`${path}: a second reply-generation engine is forbidden — reuse the existing Communication Copilot (rule 15)`);
    }
    if (INTEL_RAW_PERSIST.test(code)) {
      out.push(`${path}: raw prompt/response persistence is forbidden — store only safe derived signals (rule 15)`);
    }
    if (INTEL_AUTO_EXECUTE.test(code)) {
      out.push(`${path}: an AI suggestion must never auto-execute an action / provider write — accept routes into existing approval-gated flows (rule 15)`);
    }
    // AI reach is allowed ONLY via the two adapter files, and ONLY through the shipped boundaries.
    if (!isIntelAiAdapter(norm)) {
      if (/from ["']@\/lib\/ai-reasoning/.test(code)) out.push(`${path}: only intelligence/reasoning.ts may reach the AI Reasoning boundary (rule 15)`);
      if (/from ["']@\/lib\/comm-copilot/.test(code) || /from ["']@\/lib\/draft-studio/.test(code)) out.push(`${path}: only intelligence/copilot.ts may reach the Communication Copilot (rule 15)`);
    }
  }
  // Rule 15 (browser → model): a route/UI must not reach a model provider or the
  // AI/Copilot adapters directly — it goes through the intelligence SERVICE.
  if (norm.startsWith("src/app/")) {
    if (/from ["']@\/lib\/ai-reasoning/.test(code) || /intelligence\/(reasoning|copilot)["']/.test(code) || /\b(selectProvider|openAIProvider|runReasoningGateway)\b/.test(code)) {
      out.push(`${path}: a route/UI must not reach a model provider or AI adapter directly — use the intelligence service (rule 15)`);
    }
  }
  // Rule 16 (6.9 Phase 5) — Social Listening boundaries.
  if (inListeningDir(norm)) {
    if (LISTENING_OPEN_WEB.test(code)) out.push(`${path}: open-web scraping/crawling is forbidden — listening reads only the provider-permitted surface (rule 16)`);
    if (LISTENING_ARBITRARY_TARGET.test(code)) out.push(`${path}: an arbitrary profile/account/keyword target is forbidden — sources derive from connected assets only (rule 16)`);
    if (LISTENING_RAW.test(code)) out.push(`${path}: raw payload / webhook signature / raw cursor persistence is forbidden (rule 16)`);
    if (LISTENING_AI_DIRECT.test(code)) out.push(`${path}: listening must reuse Phase-4 intelligence — no direct AI gateway / copilot import (rule 16)`);
    if (LISTENING_UNBOUNDED.test(code)) out.push(`${path}: unbounded polling (infinite loop / setInterval) is forbidden — polling is bounded (rule 16)`);
    if (LISTENING_AUTO_EXECUTE.test(code)) out.push(`${path}: listening is READ-ONLY — no provider write / auto-execute (rule 16)`);
    if (LISTENING_RAW_HTTP.test(code)) out.push(`${path}: the listening module must not make a raw HTTP call — all provider I/O goes through the sealed gateway (rule 16)`);
    if (/from ["'][^"']*provider\/graph\//.test(code)) out.push(`${path}: import the sealed listening gateway from provider/graph (index), never a deep graph module (rule 16)`);
  }
  // Rule 16 (browser → Meta): a route/UI must not construct/import the sealed
  // listening gateway or a graph transport directly.
  if (norm.startsWith("src/app/") && /createListeningGateway|provider\/graph\/listening|graphJson\(/.test(code)) {
    out.push(`${path}: a route/UI must not reach the listening gateway / Meta directly — use the listening service (rule 16)`);
  }
  return out;
}

const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
};

/** Extra dirs scanned for the same leakage rules: routes (incl. internal) + UI. */
export const EXTRA_DIRS = ["src/app/api/meta", "src/app/api/internal/meta", "src/app/(app)/meta-workspace"];

/** Walk the Meta module + assert public-surface / structural invariants. */
export function runGuard() {
  const failures = [];
  const files = walk(META_DIR);
  if (files.length === 0) failures.push(`${META_DIR}: module missing`);
  for (const d of EXTRA_DIRS) for (const f of walk(d)) files.push(f);

  for (const f of files) {
    if (isQa(f)) continue; // QA constructs banned literals via escaped strings
    const code = readFileSync(f, "utf8");
    failures.push(...scanContent(f, code));
  }

  // Structural: a publishing worker/scheduler/cron/queue FILE is allowed ONLY
  // inside the Phase-3B schedule module — never elsewhere under the Meta module.
  for (const f of files) {
    if (inScheduleDir(f)) continue;
    if (/(worker|scheduler|cron|queue)\.(ts|tsx)$/i.test(f)) failures.push(`${f}: a publishing worker/scheduler/cron/queue outside src/lib/meta/schedule/ is not allowed (rule 8)`);
  }
  // Structural: safe read models must not surface a signed/provider URL — nor,
  // in Phase 3B, a durable LEASE TOKEN (a server-only fencing nonce).
  for (const f of files) {
    if (/\/(read|dto)\.ts$/.test(f)) {
      const c = readFileSync(f, "utf8");
      if (/signedUrl|signed_url|createSignedUrl/.test(c)) failures.push(`${f}: a signed/provider-delivery URL must not appear in a safe read model (rule 8)`);
      if (/leaseToken|lease_token/.test(c)) failures.push(`${f}: a durable lease token must not appear in a safe read model (rule 9)`);
      if (PHASE3C_LEAK.test(strip(c))) failures.push(`${f}: a raw webhook payload / signature / app secret must not appear in a safe read model (rule 10)`);
    }
  }
  // Phase 3C structural — the webhook route must read the RAW bytes and the
  // ingestion service must VERIFY the signature before trusting any event.
  {
    const routeP = "src/app/api/meta/webhooks/route.ts";
    if (existsSync(routeP)) {
      const c = readFileSync(routeP, "utf8");
      if (!/\.text\(\)/.test(c) || !/x-hub-signature/i.test(c)) failures.push(`${routeP}: webhook route must read the exact raw bytes + read the signature header (rule 10)`);
    }
    const svcP = "src/lib/meta/webhooks/service.ts";
    if (existsSync(svcP)) {
      const c = strip(readFileSync(svcP, "utf8"));
      if (!/verifySignature/.test(c)) failures.push(`${svcP}: webhook ingestion must verify the signature before processing (rule 10)`);
    }
  }
  // Phase 3C structural — reconciliation must not mutate immutable history
  // (publish/reconciliation attempts + provider-object state are append-only).
  for (const f of files) {
    if (isQa(f) || !/\/lib\/meta\/reconcile\//.test(f.replace(/\\/g, "/"))) continue;
    const c = strip(readFileSync(f, "utf8"));
    if (/meta_(publish|reconciliation)_attempt[\s\S]{0,80}\.(update|delete)\b/.test(c) || /meta_provider_object_state[\s\S]{0,80}\.(update|delete)\b/.test(c)) {
      failures.push(`${f}: immutable attempt / object-state history must not be updated or deleted (rule 10)`);
    }
  }
  // 6.9 Phase 1 structural — comment ingestion is capability-gated + moderation is
  // approval-gated (reuse of the outbound-safety posture; never auto-executed).
  {
    const svc = "src/lib/meta/engagement/service.ts";
    if (existsSync(svc) && !/commentsReadAllowed/.test(readFileSync(svc, "utf8"))) failures.push(`${svc}: comment ingestion must be capability-gated (rule 13)`);
    const eng = "src/lib/meta/engagement/engine.ts";
    if (existsSync(eng)) { const c = readFileSync(eng, "utf8"); if (!/isExecutable|approvalState/.test(c)) failures.push(`${eng}: moderation must be approval-gated before execution (rule 13)`); }
    const mod = "src/lib/meta/engagement/moderation.ts";
    if (existsSync(mod) && !/approvalRequired/.test(readFileSync(mod, "utf8"))) failures.push(`${mod}: moderation must declare approval is required (rule 13)`);
  }
  // Structural: a queue-consumer / dead-letter / reconciliation-worker FILE is
  // allowed ONLY inside the Phase-3B schedule module (dead-letter.ts lives there).
  for (const f of files) {
    if (inScheduleDir(f)) continue;
    if (/(queue-consumer|dead-letter|deadletter|reconcile-worker)\.(ts|tsx)$/i.test(f)) failures.push(`${f}: a queue consumer / dead-letter / reconciliation worker outside src/lib/meta/schedule/ is not allowed (rule 8)`);
  }
  // Phase 3B structural: the schedule module must NEVER import the sealed Graph
  // layer directly — all provider work goes through the Phase-3A publish service
  // seam (no second publishing engine, no raw Graph call from the worker).
  for (const f of files) {
    if (!inScheduleDir(f) || isQa(f)) continue; // QA names the pattern in fixtures
    const c = strip(readFileSync(f, "utf8"));
    if (/from ["'][^"']*provider\/graph/.test(c) || /import\(["'][^"']*provider\/graph/.test(c)) {
      failures.push(`${f}: the schedule module must not import provider/graph — drive publishing via the Phase-3A publish seam (rule 9)`);
    }
  }

  // 6.9 Phase 3 structural — the Unified Inbox is a local projection: there must be
  // NO provider gateway under the inbox module, and inbox read must stay capability-
  // gated (never bypassed) even though it makes no Graph call.
  {
    const inboxDir = join(META_DIR, "inbox");
    if (existsSync(inboxDir)) {
      for (const f of walk(inboxDir)) {
        if (/gateway\.(ts|tsx)$/i.test(f)) failures.push(`${f}: the unified inbox is a local projection — it must not define a provider gateway (rule 14)`);
      }
      const svc = join(inboxDir, "service.ts");
      if (existsSync(svc) && !/inboxReadAllowed/.test(readFileSync(svc, "utf8"))) failures.push(`${svc}: inbox read must remain capability-gated (inboxReadAllowed) (rule 14)`);
    }
  }

  // 6.9 Phase 4 structural — Engagement Intelligence invariants.
  {
    const intelDir = join(META_DIR, "intelligence");
    if (existsSync(intelDir)) {
      // AI outputs are suggestions: signals are APPEND-ONLY — the store must never
      // UPDATE a classification column in place (only is_current / processing_state).
      const storeP = join(intelDir, "store.ts");
      if (existsSync(storeP)) {
        const c = strip(readFileSync(storeP, "utf8"));
        if (/meta_engagement_signal[\s\S]{0,240}\.update\([\s\S]{0,240}(sentiment|intent|urgency|confidence)\s*:/.test(c)) {
          failures.push(`${storeP}: engagement signals are append-only — a classification column must not be updated in place (rule 15)`);
        }
      }
      // The two AI seams must actually delegate to the shipped boundaries.
      const rP = join(intelDir, "reasoning.ts");
      if (existsSync(rP) && !/from ["']@\/lib\/ai-reasoning/.test(readFileSync(rP, "utf8"))) failures.push(`${rP}: the reasoning adapter must delegate to the shipped AI Reasoning boundary (rule 15)`);
      const cpP = join(intelDir, "copilot.ts");
      if (existsSync(cpP) && !/from ["']@\/lib\/comm-copilot/.test(readFileSync(cpP, "utf8"))) failures.push(`${cpP}: the copilot adapter must reuse the existing Communication Copilot (rule 15)`);
      // No second inbox model: intelligence must not define its own conversation table.
      for (const f of walk(intelDir)) {
        if (isQa(f)) continue;
        const c = readFileSync(f, "utf8");
        if (/create table[\s\S]{0,40}meta_inbox_conversation|from\(["']meta_inbox_conversation["']\)[\s\S]{0,60}\.insert/.test(c)) failures.push(`${f}: intelligence must not duplicate the Phase-3 inbox conversation model (rule 15)`);
      }
    }
  }

  // 6.9 Phase 5 structural — Social Listening invariants.
  {
    // The sealed listening gateway is READ-ONLY: no write/reply/hide/delete/follow/
    // like/send/publish method + no write HTTP verb.
    const gwP = "src/lib/meta/provider/graph/listening.ts";
    if (existsSync(gwP)) {
      const c = strip(readFileSync(gwP, "utf8"));
      if (/\b(reply|hide|deleteComment|follow|likeMedia|sendMessage|publish)\s*\(/.test(c) || /method:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(c)) {
        failures.push(`${gwP}: the listening gateway is READ-ONLY — no write/reply/hide/delete/follow/like/send/publish method (rule 16)`);
      }
    }
    const lDir = join(META_DIR, "listening");
    if (existsSync(lDir)) {
      // Safe read models must not surface a token / raw cursor / idempotency key.
      const readP = join(lDir, "read.ts");
      if (existsSync(readP)) { const c = readFileSync(readP, "utf8"); if (/access_token|tokenPlain|cursor_ref|cursorRef|idempotencyKey|lease_token|leaseToken/.test(c)) failures.push(`${readP}: a token / raw cursor / lease / idempotency key must not appear in a safe read model (rule 16)`); }
      // The listening service must reuse the SAME capability evaluator (no parallel system).
      const svcP = join(lDir, "service.ts");
      if (existsSync(svcP) && !/resolveRuntime/.test(readFileSync(svcP, "utf8"))) failures.push(`${svcP}: listening must reuse the existing capability evaluator (resolveRuntime) (rule 16)`);
      // No second inbox / intelligence model: listening must reuse Phase-3 inbox +
      // Phase-4 intelligence (it may import their stores/engines, not redefine them).
      for (const f of walk(lDir)) {
        if (isQa(f)) continue; const c = readFileSync(f, "utf8");
        if (/create table[\s\S]{0,40}meta_inbox_conversation|create table[\s\S]{0,40}meta_engagement_signal/.test(c)) failures.push(`${f}: listening must not duplicate the inbox / intelligence model (rule 16)`);
      }
    }
  }

  // Rule 6 — the exported public surface (index.ts) must not expose a token field.
  const idx = join(META_DIR, "index.ts");
  if (existsSync(idx)) {
    const code = strip(readFileSync(idx, "utf8"));
    if (/access_token|pageToken\b|rawToken|tokenValue/.test(code)) failures.push(`${idx}: a token-bearing symbol is exported on the public surface (rule 6)`);
  }

  // Structural sanity — the Phase 0 foundations exist.
  for (const req of [
    "provider/registry.ts",
    "provider/errors.ts",
    "provider/graph/compat.ts",
    "capability/registry.ts",
    "capability/evaluate.ts",
    "index.ts",
  ]) {
    if (!existsSync(join(META_DIR, req))) failures.push(`missing required Phase 0 file: ${META_DIR}/${req}`);
  }

  return { failures, filesScanned: files.length };
}

// ── CLI entry ────────────────────────────────────────────────────────────────
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect || process.argv[1]?.endsWith("check-meta-boundaries.mjs")) {
  const { failures, filesScanned } = runGuard();
  if (failures.length) {
    console.error("✗ Meta Workspace (6.8) boundary guard failed:");
    for (const f of failures) console.error("  · " + f);
    process.exit(1);
  }
  console.log(`✓ Meta Workspace (6.8) boundary guard: ${filesScanned} files scanned — provider-isolated, Graph sealed, frozen-safe`);
}

// Keep a reference so bundlers don't tree-shake the util import in some setups.
void fileURLToPath;
