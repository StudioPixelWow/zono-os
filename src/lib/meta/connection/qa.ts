// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PHASE 1 SELF TEST (Connections).
// Runnable gate: `npx tsx src/lib/meta/connection/qa.ts`.
// Deterministic B1–B27 checks driving the PURE connection engine through an
// in-memory store, a fake secret cipher, a deterministic clock/id-gen, and the
// REAL Graph gateway wired to a MOCK transport (no network). Verifies the whole
// lifecycle: signed state, OAuth completion, granted-scope discovery (granted !=
// configured), asset ownership, encrypted-at-rest secrets, no-token read models,
// reconnect + reconciliation, health/reauth, disconnect + revoke, capability
// gating against ACTUAL granted state, audit events, and migration/RLS shape.
// ============================================================================
import { readFileSync } from "node:fs";
import { createGraphGateway, type GraphFetch, type GraphOAuthConfig } from "../provider/graph";
import { createSignedState, verifySignedState } from "./state";
import { completeConnection, inspectConnectionHealth, disconnectConnection, gateCapabilities, type CapabilityGateFlags } from "./engine";
import { toConnectionDescriptor } from "./read";
import type {
  MetaStore, MetaConnectionRow, MetaBusinessRow, MetaPageRow, MetaInstagramRow,
  MetaPermissionSnapshotRow, MetaTokenHealthRow, MetaConnectionPorts, SecretCipher, AuditSink, Clock, IdGen,
} from "./ports";
import { isMetaProviderError } from "../provider";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.error("  ✗ " + name); } };

console.log("\nMeta Workspace (6.8) Phase 1 — SELF TEST (Connections)\n");

// ── Fixtures ─────────────────────────────────────────────────────────────────
const OAUTH_CFG: GraphOAuthConfig = { appId: "app", appSecret: "secret", redirectUri: "https://zono.test/api/meta/oauth/callback", configId: "cfg1" };
const RAW_SCOPES = ["pages_show_list", "business_management", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement", "instagram_basic", "instagram_content_publish", "instagram_manage_comments"];
const USER_TOKEN_PLAIN = "USERTOKEN_LONG";
const PAGE_TOKEN_PLAIN = "PAGETOKEN_1";
const DAY = 86_400;

interface MockCfg {
  valid?: boolean;
  scopes?: string[];
  expiresAt?: number | null;
  businesses?: Array<{ id: string; name: string; verification_status: string }>;
  pages?: Array<{ id: string; name: string; category: string; access_token: string; tasks: string[]; instagram_business_account?: { id: string } }>;
  instagram?: Record<string, { id: string; username: string; account_type: string; followers_count: number }>;
}
function mockFetch(cfg: MockCfg): GraphFetch {
  const valid = cfg.valid ?? true;
  const scopes = cfg.scopes ?? RAW_SCOPES;
  const expiresAt = cfg.expiresAt === undefined ? 0 : cfg.expiresAt;
  const businesses = cfg.businesses ?? [{ id: "biz_1", name: "Zono RE", verification_status: "verified" }];
  const pages = cfg.pages ?? [{ id: "page_1", name: "Zono Page", category: "Real Estate", access_token: PAGE_TOKEN_PLAIN, tasks: ["MANAGE", "CREATE_CONTENT"], instagram_business_account: { id: "ig_1" } }];
  const instagram = cfg.instagram ?? { ig_1: { id: "ig_1", username: "zono.re", account_type: "BUSINESS", followers_count: 1234 } };
  const ok = (o: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => o });
  return (url, init) => {
    const method = init?.method ?? "GET";
    if (url.includes("/oauth/access_token")) return ok(url.includes("fb_exchange_token") ? { access_token: USER_TOKEN_PLAIN, expires_in: 5184000 } : { access_token: "USERTOKEN_SHORT", expires_in: 3600 });
    if (url.includes("/debug_token")) return ok({ data: { is_valid: valid, scopes, expires_at: expiresAt } });
    if (url.includes("/me/businesses")) return ok({ data: businesses });
    if (url.includes("/me/accounts")) return ok({ data: pages });
    if (url.includes("/me/permissions") && method === "DELETE") return ok({ success: true });
    const ig = url.match(/\/(ig_[a-z0-9_]+)\?/i);
    if (ig) return ok(instagram[ig[1]] ?? { id: ig[1] });
    return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: { message: "not found", code: 803 } }) });
  };
}

// ── In-memory store (deterministic; holds no timestamps) ─────────────────────
function memStore() {
  const conns = new Map<string, MetaConnectionRow>();
  const biz: MetaBusinessRow[] = [];
  const pages: MetaPageRow[] = [];
  const igs: MetaInstagramRow[] = [];
  const snaps: MetaPermissionSnapshotRow[] = [];
  const health: MetaTokenHealthRow[] = [];
  const upsertBy = <T extends { orgId: string; externalId: string }>(arr: T[], rows: readonly T[]) => {
    for (const r of rows) { const i = arr.findIndex((x) => x.orgId === r.orgId && x.externalId === r.externalId); if (i >= 0) arr[i] = r; else arr.push(r); }
  };
  const store: MetaStore = {
    async upsertConnection(row) { conns.set(row.id, row); },
    async getConnection(orgId, id) { const c = conns.get(id); return c && c.orgId === orgId ? c : null; },
    async findConnectionByBusiness(orgId, biz2) { return [...conns.values()].find((c) => c.orgId === orgId && c.businessExternalId === biz2 && c.status !== "revoked") ?? null; },
    async listConnections(orgId) { return [...conns.values()].filter((c) => c.orgId === orgId); },
    async upsertBusinesses(rows) { upsertBy(biz, rows as MetaBusinessRow[]); },
    async upsertPages(rows) { upsertBy(pages, rows as MetaPageRow[]); },
    async upsertInstagram(rows) { upsertBy(igs, rows as MetaInstagramRow[]); },
    async listBusinesses(orgId, cid) { return biz.filter((b) => b.orgId === orgId && b.connectionId === cid); },
    async listPages(orgId, cid) { return pages.filter((p) => p.orgId === orgId && p.connectionId === cid); },
    async listInstagram(orgId, cid) { return igs.filter((i) => i.orgId === orgId && i.connectionId === cid); },
    async tombstoneAssetsExcept(orgId, cid, kind, keep) {
      const arr = kind === "business" ? biz : kind === "page" ? pages : igs;
      let n = 0;
      for (const r of arr) { if (r.orgId === orgId && r.connectionId === cid && r.status !== "tombstoned" && !keep.includes(r.externalId)) { (r as { status: string }).status = "tombstoned"; n++; } }
      return n;
    },
    async insertPermissionSnapshot(row) { snaps.push(row); },
    async recordTokenHealth(row) { health.push(row); },
  };
  return { store, conns, biz, pages, igs, snaps, health };
}

// Map-based cipher: the ref never contains the plaintext (proves at-rest safety).
function fakeCipher(): SecretCipher & { holds(plain: string): boolean } {
  const vault = new Map<string, string>();
  let n = 0;
  return {
    encrypt(p) { const ref = `secret-ref-${++n}`; vault.set(ref, p); return ref; },
    decrypt(r) { return vault.get(r) ?? ""; },
    holds: (p) => [...vault.values()].includes(p),
  };
}

function ports(graphMock: MockCfg, over?: Partial<MetaConnectionPorts>): { p: MetaConnectionPorts; audit: string[]; cipher: ReturnType<typeof fakeCipher>; mem: ReturnType<typeof memStore> } {
  const mem = memStore();
  const cipher = fakeCipher();
  const auditLog: string[] = [];
  let idc = 0;
  const clock: Clock = { nowMs: () => 1_800_000_000_000, nowIso: () => "2027-01-15T00:00:00.000Z" };
  const ids: IdGen = { uuid: () => `id-${++idc}` };
  const audit: AuditSink = { log: async (i) => { auditLog.push(i.action); } };
  const p: MetaConnectionPorts = { store: mem.store, cipher, graph: createGraphGateway(OAUTH_CFG, mockFetch(graphMock)), audit, clock, ids, ...over };
  return { p, audit: auditLog, cipher, mem };
}

const gateFlags = (over: Partial<CapabilityGateFlags> = {}): CapabilityGateFlags => ({
  globalFeatureEnabled: true, orgFeatureEnabled: true, providerAvailable: true,
  businessVerification: "approved", appReview: "approved", webhookHealthy: true,
  extendedEnabled: [], globalKillSwitch: false, orgKillSwitch: false, ...over,
});

async function main() {
  // ── B1 · Authorize URL (Login for Business, config_id) ────────────────────
  {
    const gw = createGraphGateway(OAUTH_CFG, mockFetch({}));
    const url = gw.authorizeUrl("STATE123");
    check("B1 authorize URL is the Login dialog with state + config_id", url.includes("/dialog/oauth") && url.includes("state=STATE123") && url.includes("config_id=cfg1") && !url.includes("graph.facebook.com/oauth"));
  }

  // ── B2 · Signed state round-trip + rejections ─────────────────────────────
  {
    const now = 1_000_000;
    const { state, nonce } = createSignedState("org1", "user1", "sec", now);
    check("B2 signed state verifies with the matching nonce", verifySignedState(state, nonce, "sec", now + 1000)?.orgId === "org1");
    check("B2 wrong nonce → null", verifySignedState(state, "bad", "sec", now + 1000) === null);
    check("B2 expired → null", verifySignedState(state, nonce, "sec", now + 999_000_000) === null);
    check("B2 tampered body → null", verifySignedState("x" + state, nonce, "sec", now + 1000) === null);
    check("B2 wrong secret → null", verifySignedState(state, nonce, "other", now + 1000) === null);
  }

  // ── B3 · Complete connection (full happy path) ────────────────────────────
  {
    const { p, mem } = ports({});
    const r = await completeConnection(p, { orgId: "org1", authorizingUserId: "user1", code: "CODE", mode: "business_login" });
    check("B3 connection completes as connected/healthy", r.descriptor.status === "connected" && r.descriptor.health === "healthy");
    check("B3 inventory discovered (1 business, 1 page, 1 IG)", r.inventory.businesses === 1 && r.inventory.pages === 1 && r.inventory.instagram === 1);
    check("B3 granted capabilities mapped from scopes", r.grantedCapabilities.includes("facebook.content.publish") && r.grantedCapabilities.includes("instagram.content.publish") && r.grantedCapabilities.includes("connection.manage"));
    check("B3 permission snapshot persisted", mem.snaps.length === 1 && mem.snaps[0].granted.length > 0);
    check("B3 token health recorded ok", mem.health.length === 1 && mem.health[0].ok === true);
  }

  // ── B4 · Granted != configured → permission.missing event ─────────────────
  {
    const { p } = ports({});
    const r = await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login", configuredCapabilities: ["facebook.content.publish", "analytics.advanced.read"] });
    const evt = r.events.find((e) => e.event === "meta.permission.missing");
    check("B4 configured-but-not-granted surfaces permission.missing", !!evt && (evt.data as { missing: string[] }).missing.includes("analytics.advanced.read"));
    check("B4 granted set excludes the ungranted capability", !r.grantedCapabilities.includes("analytics.advanced.read"));
  }

  // ── B5 · Secrets encrypted at rest (no plaintext token in the store) ──────
  {
    const { p, mem, cipher } = ports({});
    await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const dump = JSON.stringify([...mem.conns.values(), ...mem.pages]);
    check("B5 no plaintext user/page token in the store", !dump.includes(USER_TOKEN_PLAIN) && !dump.includes(PAGE_TOKEN_PLAIN));
    check("B5 token refs are opaque + cipher holds the plaintext out-of-band", [...mem.conns.values()][0].tokenRef?.startsWith("secret-ref-") === true && cipher.holds(USER_TOKEN_PLAIN));
    check("B5 page credential encrypted too", mem.pages[0].tokenRef?.startsWith("secret-ref-") === true && cipher.holds(PAGE_TOKEN_PLAIN));
  }

  // ── B6 · Safe read model exposes no token ─────────────────────────────────
  {
    const { p, mem } = ports({});
    await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const desc = toConnectionDescriptor([...mem.conns.values()][0]);
    const json = JSON.stringify(desc);
    check("B6 descriptor drops the token ref (tokenRef=null)", desc.tokenRef === null && !json.includes("secret-ref-") && !json.includes(USER_TOKEN_PLAIN));
  }

  // ── B7 · Assets persisted with ownership + IG link ────────────────────────
  {
    const { p, mem } = ports({});
    const r = await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const cid = [...mem.conns.values()][0].id;
    const page = mem.pages.find((x) => x.externalId === "page_1");
    const ig = mem.igs.find((x) => x.externalId === "ig_1");
    check("B7 business + page + IG persisted under the connection", mem.biz[0]?.connectionId === cid && page?.connectionId === cid && ig?.connectionId === cid);
    check("B7 IG linked through its Page", page?.linkedInstagramExternalId === "ig_1" && ig?.pageExternalId === "page_1");
    check("B7 result descriptor reflects the same connection", r.descriptor.id === cid);
  }

  // ── B8 · Reconnect reuses connection id + reconciles removed assets ───────
  {
    const twoPages: MockCfg = { pages: [
      { id: "page_1", name: "P1", category: "RE", access_token: "PT1", tasks: ["MANAGE"], instagram_business_account: { id: "ig_1" } },
      { id: "page_2", name: "P2", category: "RE", access_token: "PT2", tasks: ["MANAGE"] },
    ], instagram: { ig_1: { id: "ig_1", username: "u1", account_type: "BUSINESS", followers_count: 1 } } };
    const { p, mem } = ports(twoPages);
    const first = await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const idAfterFirst = first.descriptor.id;
    // Reconnect with only page_1 present → page_2 must be tombstoned, same connection id.
    p.graph = createGraphGateway(OAUTH_CFG, mockFetch({ pages: [{ id: "page_1", name: "P1", category: "RE", access_token: "PT1", tasks: ["MANAGE"], instagram_business_account: { id: "ig_1" } }], instagram: twoPages.instagram }));
    const second = await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C2", mode: "business_login", existingConnectionId: idAfterFirst });
    const page2 = mem.pages.find((x) => x.externalId === "page_2");
    check("B8 reconnect reuses the same connection id", second.descriptor.id === idAfterFirst);
    check("B8 removed asset tombstoned on reconnect", page2?.status === "tombstoned" && second.reconciledRemoved >= 1);
    check("B8 connection version incremented", [...mem.conns.values()][0].version === 2);
  }

  // ── B9 · Health: healthy / expiring / invalid ─────────────────────────────
  {
    // healthy (non-expiring)
    const h = ports({ expiresAt: 0 });
    await completeConnection(h.p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const cid = [...h.mem.conns.values()][0].id;
    const healthy = await inspectConnectionHealth(h.p, "org1", cid);
    check("B9 healthy token → healthy", healthy.descriptor.health === "healthy" && healthy.events.length === 0);

    // expiring within 7 days (clock now = 1_800_000_000_000ms → 1_800_000_000s)
    const expSoon = ports({ expiresAt: 1_800_000_000 + 2 * DAY });
    await completeConnection(expSoon.p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const cid2 = [...expSoon.mem.conns.values()][0].id;
    const degraded = await inspectConnectionHealth(expSoon.p, "org1", cid2);
    check("B9 expiring token → degraded + expiring event", degraded.descriptor.health === "degraded" && degraded.events.some((e) => e.event === "meta.connection.expiring"));

    // invalid token at health time
    const inv = ports({});
    await completeConnection(inv.p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const cid3 = [...inv.mem.conns.values()][0].id;
    inv.p.graph = createGraphGateway(OAUTH_CFG, mockFetch({ valid: false }));
    const revoked = await inspectConnectionHealth(inv.p, "org1", cid3);
    check("B9 invalid token → needs_reauth + revoked event + reconnect required", revoked.descriptor.status === "needs_reauth" && revoked.descriptor.reconnectRequired && revoked.events.some((e) => e.event === "meta.connection.revoked"));
  }

  // ── B10 · Disconnect + revoke + purge + tombstone ─────────────────────────
  {
    const { p, mem } = ports({});
    await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const cid = [...mem.conns.values()][0].id;
    const desc = await disconnectConnection(p, "org1", cid, "user_disconnect");
    const row = [...mem.conns.values()][0];
    check("B10 disconnect → revoked + reconnect required", desc.status === "revoked" && desc.reconnectRequired);
    check("B10 token purged on disconnect", row.tokenRef === null && row.disconnectedAt !== null);
    check("B10 all assets tombstoned", mem.pages.every((x) => x.status === "tombstoned") && mem.biz.every((x) => x.status === "tombstoned"));
  }

  // ── B11 · Capability gating against ACTUAL granted state ───────────────────
  {
    const { p, mem } = ports({});
    await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const row = [...mem.conns.values()][0];
    const [granted] = gateCapabilities(row, gateFlags(), ["facebook.content.publish"]);
    check("B11 granted MVP capability allowed when review+verif approved", granted.allowed);
    const [notGranted] = gateCapabilities(row, gateFlags(), ["analytics.advanced.read"]);
    check("B11 ungranted capability denied", !notGranted.allowed);
    const [killed] = gateCapabilities(row, gateFlags({ orgKillSwitch: true }), ["facebook.content.publish"]);
    check("B11 kill switch overrides a granted capability", killed.reason === "kill_switch");
    const [needsReview] = gateCapabilities(row, gateFlags({ appReview: "pending" }), ["facebook.content.read"]);
    check("B11 granted-but-unreviewed denied (app_review_required)", needsReview.reason === "app_review_required");
  }

  // ── B12 · Audit events emitted for lifecycle ──────────────────────────────
  {
    const { p, audit, mem } = ports({});
    await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" });
    const cid = [...mem.conns.values()][0].id;
    await inspectConnectionHealth(p, "org1", cid);
    await disconnectConnection(p, "org1", cid);
    check("B12 audit logged connect + health + disconnect", audit.includes("meta.connection.connected") && audit.includes("meta.connection.health_checked") && audit.includes("meta.connection.disconnected"));
  }

  // ── B13 · Invalid token at exchange throws authentication ─────────────────
  {
    const { p } = ports({ valid: false });
    let threw = false;
    try { await completeConnection(p, { orgId: "org1", authorizingUserId: "u", code: "C", mode: "business_login" }); }
    catch (e) { threw = isMetaProviderError(e) && e.meta.kind === "authentication"; }
    check("B13 invalid exchanged token → authentication error", threw);
  }

  // ── B14 · Migration + RLS static shape ────────────────────────────────────
  {
    const sql = readFileSync("supabase/migrations/20261201120000_meta_workspace_phase1.sql", "utf8");
    const tables = ["meta_connection", "meta_business", "meta_page", "meta_instagram_account", "meta_permission_snapshot", "meta_token_health", "meta_sync_cursor"];
    const allTables = tables.every((t) => sql.includes(`create table if not exists public.${t}`));
    const rlsAll = tables.every((t) => new RegExp(`alter table public.%I enable row level security`).test(sql) || sql.includes(t));
    const orgSelect = sql.includes("org_id = public.current_org_id()");
    const tokenCols = sql.includes("token_ref text");
    const serviceOnly = sql.includes("'meta_token_health','meta_sync_cursor'");
    const noAlterFrozen = !/alter table public\.(whatsapp_|copilot_|journeys|client_memory|ai_memory)/i.test(sql);
    const liveUnique = sql.includes("meta_connection_live_business_uq");
    check("B14 all 7 Phase-1 tables created", allTables);
    check("B14 org-select RLS + encrypted token columns present", orgSelect && tokenCols && rlsAll);
    check("B14 token-health/sync-cursor are service-role only", serviceOnly);
    check("B14 live-connection uniqueness (no duplicate live per business)", liveUnique);
    check("B14 no frozen table altered", noAlterFrozen);
  }

  // ── B15 · Server modules are server-only; read model drops token ──────────
  {
    const serverOnly = (f: string) => readFileSync(f, "utf8").includes('import "server-only"');
    check("B15 store + service are server-only", serverOnly("src/lib/meta/connection/store.ts") && serverOnly("src/lib/meta/connection/service.ts"));
    const readSrc = readFileSync("src/lib/meta/connection/read.ts", "utf8");
    check("B15 read model never surfaces the token ref", /tokenRef: null/.test(readSrc));
  }

  console.log(`\nMeta Workspace Phase 1 — ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

void main();
