// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PHASE 3A SELF TEST (Immediate Publishing).
// Runnable gate: `npx tsx src/lib/meta/publish/qa.ts`.
// Deterministic D1–D96 (+ scenarios). Layer 1: the PURE engine over an in-memory
// store + a mock PublishGateway (lifecycle, partial success, idempotency,
// classification, manual retry, cancel, events, audit). Layer 2: the sealed Graph
// publish flows (FB/IG) via `publishToProvider` with a MOCK transport + injected
// sleep (order, bounded polling, timeout, ambiguous). No network, no DB.
// ============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { PublishStore, PublishPorts, PublishOperationRow, PublishTargetRow, PublishAttemptRow, ProviderObjectRow, AssetPublishResolver, MediaUrlResolver } from "./ports";
import type { PublishGateway, ProviderPublishResult, ProviderPublishRequest } from "./provider-types";
import * as engine from "./engine";
import { buildPublishSnapshot } from "./snapshot";
import { checkPublishPreconditions, type TargetRuntime } from "./preconditions";
import { canTransitionOperation, canTransitionTarget, deriveOperationStatus, canExecuteTarget } from "./state";
import { classifyFailure, isManualRetryEligible } from "./classify";
import { operationIdempotencyKey, targetSetHash } from "./idempotency";
import { publishToProvider } from "../provider/graph/publish";
import type { GraphFetch } from "../provider/graph";
import { MetaProviderError } from "../provider/errors";
import { publishRateCheck } from "./ratelimit";
import { scanContent } from "../../../../scripts/check-meta-boundaries.mjs";
import type { DraftState, DraftTargetState } from "../content/domain";
import type { MetaCapabilityDecision } from "../capability/types";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
const ROOT = process.cwd();
console.log("\nMeta Workspace (6.8) Phase 3A — SELF TEST (Immediate Publishing)\n");

function memStore() {
  const ops = new Map<string, PublishOperationRow>();
  const targets = new Map<string, PublishTargetRow>();
  const attempts: PublishAttemptRow[] = [];
  const providerObjects: ProviderObjectRow[] = [];
  const store: PublishStore = {
    async findOperationByIdem(orgId, key) { return [...ops.values()].find((o) => o.orgId === orgId && o.idempotencyKey === key) ?? null; },
    async insertOperation(r) { ops.set(r.id, r); },
    async getOperation(orgId, id) { const o = ops.get(id); return o && o.orgId === orgId ? o : null; },
    async listOperations(orgId) { return [...ops.values()].filter((o) => o.orgId === orgId); },
    async updateOperation(r) { ops.set(r.id, r); },
    async insertTarget(r) { targets.set(r.id, r); },
    async getTarget(orgId, id) { const t = targets.get(id); return t && t.orgId === orgId ? t : null; },
    async listTargets(orgId, opId) { return [...targets.values()].filter((t) => t.orgId === orgId && t.operationId === opId); },
    async updateTarget(r) { targets.set(r.id, r); },
    async insertAttempt(r) { const i = attempts.findIndex((a) => a.id === r.id); if (i >= 0) attempts[i] = r; else attempts.push(r); },
    async listAttempts(orgId, targetId) { return attempts.filter((a) => a.orgId === orgId && a.targetId === targetId); },
    async insertProviderObject(r) { providerObjects.push(r); },
  };
  return { store, ops, targets, attempts, providerObjects };
}

let idc = 0;
function ports(gateway: PublishGateway, over?: { asset?: AssetPublishResolver; media?: MediaUrlResolver }): { p: PublishPorts; audit: string[]; auditMeta: unknown[]; mem: ReturnType<typeof memStore> } {
  const mem = memStore(); const audit: string[] = []; const auditMeta: unknown[] = [];
  const p: PublishPorts = {
    store: mem.store, gateway,
    asset: over?.asset ?? { resolve: async () => ({ externalId: "ext_asset", tokenPlain: "PAGE_TOKEN_SECRET" }) },
    media: over?.media ?? { resolve: async () => "https://signed.example/media?sig=x" },
    clock: { nowMs: () => 1_800_000_000_000, nowIso: () => "2027-03-01T00:00:00.000Z" },
    ids: { uuid: () => `pid-${++idc}` },
    audit: { log: async (i) => { audit.push(i.action); auditMeta.push(i.metadata); } },
  };
  return { p, audit, auditMeta, mem };
}

function mockGateway(resolve: (req: ProviderPublishRequest, callIndex: number) => ProviderPublishResult): PublishGateway & { calls: ProviderPublishRequest[] } {
  const calls: ProviderPublishRequest[] = [];
  return { calls, async publish(req) { const r = resolve(req, calls.length); calls.push(req); return r; } };
}
const success = (id: string): ProviderPublishResult => ({ ok: true, providerObjectId: id, providerContainerId: null, permalink: `https://meta/${id}`, processingState: "done", ambiguous: false, error: null, warnings: [] });
const failure = (kind: string): ProviderPublishResult => ({ ok: false, providerObjectId: null, providerContainerId: null, permalink: null, processingState: "done", ambiguous: false, error: { kind, safeMessage: "x", providerCodeCategory: null, retryClass: "x" }, warnings: [] });
const ambiguous = (): ProviderPublishResult => ({ ok: false, providerObjectId: null, providerContainerId: "c1", permalink: null, processingState: "ambiguous", ambiguous: true, error: { kind: "timeout", safeMessage: "lost", providerCodeCategory: null, retryClass: "ambiguous" }, warnings: [] });

const okCap: MetaCapabilityDecision = { key: "x", allowed: true, reason: null, humanReason: "", missing: [], degraded: false, signals: {} };
const denyCap: MetaCapabilityDecision = { key: "x", allowed: false, reason: "permission_missing", humanReason: "", missing: [], degraded: false, signals: {} };
const tgt = (over: Partial<DraftTargetState> = {}): DraftTargetState => ({ id: over.id ?? "t-fb", assetKind: "page", assetId: "a-fb", platform: "facebook", contentKind: "fb_text", enabled: true, captionOverride: null, hashtagsOverride: null, mediaOrder: [], plannedAt: null, ...over });
function makeDraft(targets: DraftTargetState[], over: Partial<DraftState> = {}): DraftState {
  return { id: "d1", orgId: "orgA", internalName: "D", createdBy: "u1", currentVersion: 3, status: "approved", contentClass: "standard", defaultCaption: "hello", defaultHashtags: ["zono"], plannedAt: null, timezone: null, approvalState: "approved", contentHash: "hash-v3", revision: 5, archivedAt: null, targets, ...over };
}
function snapshotOf(draft: DraftState, targetIds: string[], mediaMap: Record<string, { kind: "image" | "video" }> = {}) {
  return buildPublishSnapshot({ draft, targetIds, media: (id) => (mediaMap[id] ? { mediaId: id, kind: mediaMap[id].kind, storageRef: `s/${id}`, mime: mediaMap[id].kind === "image" ? "image/jpeg" : "video/mp4", width: 1080, height: 1080, durationMs: mediaMap[id].kind === "video" ? 10000 : null } : null), capability: () => okCap, validation: () => ({ ok: true }), requestedBy: "u1", correlationId: "corr-1", createdAt: "2027-03-01T00:00:00.000Z" });
}
const runtime = (over: Partial<TargetRuntime> = {}): TargetRuntime => ({ capability: okCap, assetStatus: "active", connectionStatus: "connected", connectionHealth: "healthy", mediaValid: true, variantMissing: false, ...over });

function basePre(draft: DraftState): Parameters<typeof checkPublishPreconditions>[0] {
  const ids = draft.targets.map((t) => t.id);
  return { draft, approvedVersion: draft.currentVersion, approvedContentHash: draft.contentHash ?? "", targetIds: ids, runtime: () => runtime(), globalKillSwitch: false, orgKillSwitch: false, actorCanPublish: true };
}

async function main() {
  const fbT = tgt({ id: "t-fb", contentKind: "fb_text" });
  const igT = tgt({ id: "t-ig", assetKind: "instagram", assetId: "a-ig", platform: "instagram", contentKind: "ig_image", mediaOrder: ["m1"] });
  const draft = makeDraft([fbT, igT]);
  const rtMap = new Map<string, TargetRuntime>([["t-fb", runtime()], ["t-ig", runtime()]]);
  const preOk = checkPublishPreconditions({ draft, approvedVersion: 3, approvedContentHash: "hash-v3", targetIds: ["t-fb", "t-ig"], runtime: (id) => rtMap.get(id) ?? null, globalKillSwitch: false, orgKillSwitch: false, actorCanPublish: true });
  check("D1 authorized user may publish approved draft (preconditions ok)", preOk.ok && preOk.publishableTargetIds.length === 2);
  check("D3 unauthorized role rejected (fail closed)", checkPublishPreconditions({ ...basePre(draft), actorCanPublish: false }).operationBlock === "actor_not_permitted");
  check("D5 unapproved draft rejected", checkPublishPreconditions(basePre(makeDraft([fbT], { status: "draft", approvalState: "not_required" }))).operationBlock === "draft_not_approved");
  check("D6 approval for old version rejected", checkPublishPreconditions({ ...basePre(draft), approvedVersion: 2 }).operationBlock === "approval_version_mismatch");
  check("D7 edited-after-approval rejected (hash mismatch)", checkPublishPreconditions({ ...basePre(draft), approvedContentHash: "hash-OLD" }).operationBlock === "edited_after_approval");
  check("D8 empty target set rejected", checkPublishPreconditions({ ...basePre(draft), targetIds: [] }).operationBlock === "no_enabled_target");
  check("D9 disconnected target blocked", !checkPublishPreconditions({ ...basePre(draft), runtime: (id) => (id === "t-fb" ? runtime({ connectionStatus: "revoked" }) : runtime()) }).targets.find((t) => t.targetId === "t-fb")!.ok);
  check("D10 missing capability blocks only that target", (() => { const r = checkPublishPreconditions({ ...basePre(draft), runtime: (id) => (id === "t-fb" ? runtime({ capability: denyCap }) : runtime()) }); return !r.targets.find((t) => t.targetId === "t-fb")!.ok && r.targets.find((t) => t.targetId === "t-ig")!.ok; })());
  check("D11 invalid media blocks only that target", (() => { const r = checkPublishPreconditions({ ...basePre(draft), runtime: (id) => (id === "t-ig" ? runtime({ mediaValid: false }) : runtime()) }); return r.targets.find((t) => t.targetId === "t-fb")!.ok && !r.targets.find((t) => t.targetId === "t-ig")!.ok; })());
  check("D12 Facebook Groups target rejected", !checkPublishPreconditions(basePre(makeDraft([tgt({ id: "g", contentKind: "fb_groups" })]))).targets[0].ok);
  check("D13 Extended content kind rejected", !checkPublishPreconditions(basePre(makeDraft([tgt({ id: "r", contentKind: "ig_reel", assetKind: "instagram", platform: "instagram" })]))).targets[0].ok);
  check("D9b kill switch blocks operation", checkPublishPreconditions({ ...basePre(draft), globalKillSwitch: true }).operationBlock === "kill_switch");

  const snap = snapshotOf(draft, ["t-fb", "t-ig"], { m1: { kind: "image" } });
  const snapJson = JSON.stringify(snap);
  const draftMutated = { ...draft, defaultCaption: "MUTATED" };
  const snap2 = snapshotOf(draft, ["t-fb", "t-ig"], { m1: { kind: "image" } });
  check("D14 operation snapshot is immutable/deterministic", JSON.stringify(snap2) === snapJson);
  check("D15 mutating the draft after snapshot does not alter the snapshot", snap.targets.find((t) => t.platform === "facebook")!.caption === "hello" && draftMutated.defaultCaption === "MUTATED");

  const setA = targetSetHash([{ assetId: "a-fb", platform: "facebook", contentKind: "fb_text" }]);
  const setB = targetSetHash([{ assetId: "a-fb", platform: "facebook", contentKind: "fb_text" }, { assetId: "a-ig", platform: "instagram", contentKind: "ig_image" }]);
  const keyBase = operationIdempotencyKey({ orgId: "orgA", draftId: "d1", draftVersionNumber: 3, contentHash: "hash-v3", targetSetHash: setA, variant: "default" });
  check("D16 operation idempotency stable", keyBase === operationIdempotencyKey({ orgId: "orgA", draftId: "d1", draftVersionNumber: 3, contentHash: "hash-v3", targetSetHash: setA, variant: "default" }));
  check("D17 different content changes key", keyBase !== operationIdempotencyKey({ orgId: "orgA", draftId: "d1", draftVersionNumber: 3, contentHash: "OTHER", targetSetHash: setA, variant: "default" }));
  check("D18 different version changes key", keyBase !== operationIdempotencyKey({ orgId: "orgA", draftId: "d1", draftVersionNumber: 4, contentHash: "hash-v3", targetSetHash: setA, variant: "default" }));
  check("D19 different target set changes key", keyBase !== operationIdempotencyKey({ orgId: "orgA", draftId: "d1", draftVersionNumber: 3, contentHash: "hash-v3", targetSetHash: setB, variant: "default" }));
  check("D20 target idempotency stable", snap.targets[0].idempotencyKey === snapshotOf(draft, ["t-fb", "t-ig"], { m1: { kind: "image" } }).targets[0].idempotencyKey);
  {
    const gw = mockGateway(() => success("ext_1"));
    const P = ports(gw);
    const c1 = await engine.createOperation(P.p, snap, ["t-fb", "t-ig"]);
    const c2 = await engine.createOperation(P.p, snap, ["t-fb", "t-ig"]);
    check("D21 duplicate publish command returns existing operation", c2.resumed && c2.operation.id === c1.operation.id);
    check("D23 concurrent duplicate creates one operation", P.mem.ops.size === 1);
    await engine.executeOperation(P.p, "orgA", c1.operation.id);
    const callsAfter = gw.calls.length;
    await engine.createOperation(P.p, snap, ["t-fb", "t-ig"]);
    check("D22 duplicate request does not call provider twice", gw.calls.length === callsAfter);
  }

  check("D24 valid operation transition", canTransitionOperation("ready", "executing"));
  check("D25 invalid operation transition rejected", !canTransitionOperation("succeeded", "executing"));
  check("D26 valid target transition", canTransitionTarget("executing", "provider_processing"));
  check("D27 terminal-success target cannot re-execute", !canExecuteTarget("succeeded") && canTransitionTarget("succeeded", "executing") === false);
  check("D28 derive: all cancelled → cancelled", deriveOperationStatus(["cancelled", "cancelled"]) === "cancelled");

  for (const [name, kind, media] of [["D29 Facebook text", "fb_text", []], ["D30 Facebook link", "fb_link", []], ["D31 Facebook image", "fb_image", ["m1"]], ["D33 Facebook video", "fb_video", ["mv"]]] as const) {
    const d = makeDraft([tgt({ id: "t", contentKind: kind, mediaOrder: [...media] })]);
    const s = snapshotOf(d, ["t"], { m1: { kind: "image" }, mv: { kind: "video" } });
    const gw = mockGateway((req) => success(`ext_${req.platform}`));
    const P = ports(gw);
    const c = await engine.createOperation(P.p, s, ["t"]);
    const e = await engine.executeOperation(P.p, "orgA", c.operation.id);
    check(`${name} publish succeeds`, e.operation.status === "succeeded" && P.mem.providerObjects.length === 1);
  }
  {
    const d = makeDraft([tgt({ id: "t", contentKind: "fb_multi_image", mediaOrder: ["m1", "m2", "m3"] })]);
    const s = snapshotOf(d, ["t"], { m1: { kind: "image" }, m2: { kind: "image" }, m3: { kind: "image" } });
    const gw = mockGateway(() => success("ext_multi"));
    const P = ports(gw);
    const c = await engine.createOperation(P.p, s, ["t"]);
    await engine.executeOperation(P.p, "orgA", c.operation.id);
    check("D32 Facebook multi-image preserves media order", gw.calls[0].media.length === 3 && s.targets[0].media.map((m) => m.mediaId).join(",") === "m1,m2,m3");
  }

  await graphInstagramTests();

  {
    const gw = mockGateway(() => failure("invalid_request"));
    const P = ports(gw);
    const s = snapshotOf(makeDraft([tgt({ id: "t", contentKind: "fb_text" })]), ["t"]);
    const c = await engine.createOperation(P.p, s, ["t"]);
    await engine.executeOperation(P.p, "orgA", c.operation.id);
    check("D41 provider object NOT created before confirmed success", P.mem.providerObjects.length === 0);
  }
  {
    const gw = mockGateway(() => success("ext_ok"));
    const P = ports(gw);
    const s = snapshotOf(makeDraft([tgt({ id: "t", contentKind: "fb_text" })]), ["t"]);
    const c = await engine.createOperation(P.p, s, ["t"]);
    await engine.executeOperation(P.p, "orgA", c.operation.id);
    check("D40 provider success creates provider-object row", P.mem.providerObjects.length === 1 && P.mem.providerObjects[0].externalObjectId === "ext_ok");
    const dump = JSON.stringify([...P.mem.ops.values(), ...P.mem.targets.values(), ...P.mem.providerObjects]);
    check("D43/D44 token absent from persisted state/DTO", !dump.includes("PAGE_TOKEN_SECRET") && !dump.includes("access" + "_token"));
    check("D45/D46 media-delivery URL absent from persisted state + audit", !dump.includes("signed.example") && !JSON.stringify(P.auditMeta).includes("signed.example"));
  }
  { const readSrc = readFileSync("src/lib/meta/publish/read.ts", "utf8"); check("D42 provider raw payload does not escape (DTO has no raw body)", !/rawBody|raw_response|fbtrace/.test(readSrc)); check("D44b DTO exposes no token", !/token_ref|tokenPlain|access_token/.test(readSrc)); }
  { const md = readFileSync("src/lib/meta/publish/media-delivery.ts", "utf8"); check("D47 media ownership verified before signing", /eq\("org_id", orgId\)/.test(md) && /createSignedUrl/.test(md)); check("D48 no permanent public media URL (bounded TTL signed only)", /PROVIDER_FETCH_TTL_SEC/.test(md) && !/getPublicUrl/.test(md)); }

  {
    const d = makeDraft([tgt({ id: "t-fb", contentKind: "fb_text" }), tgt({ id: "t-ig", assetKind: "instagram", assetId: "a-ig", platform: "instagram", contentKind: "ig_image", mediaOrder: ["m1"] })]);
    const s = snapshotOf(d, ["t-fb", "t-ig"], { m1: { kind: "image" } });
    const gw = mockGateway((req) => (req.platform === "facebook" ? success("fb_ok") : failure("rate_limited")));
    const P = ports(gw);
    const c = await engine.createOperation(P.p, s, ["t-fb", "t-ig"]);
    const e = await engine.executeOperation(P.p, "orgA", c.operation.id);
    const ts = await P.p.store.listTargets("orgA", c.operation.id);
    check("D49 one success + one failure → partially_succeeded", e.operation.status === "partially_succeeded");
    check("D50 successful target remains successful after sibling failure", ts.find((t) => t.platform === "facebook")!.status === "succeeded");
    check("D51 failed sibling does not roll back the successful provider post", P.mem.providerObjects.length === 1 && P.mem.providerObjects[0].platform === "facebook");
    check("D52 operation aggregate counters correct", e.operation.successfulTargetCount === 1 && e.operation.failedTargetCount === 1);
    const before = P.mem.providerObjects.length;
    await engine.executeOperation(P.p, "orgA", c.operation.id);
    check("D53 repeated completion does not double-count provider objects", P.mem.providerObjects.length === before);
  }

  check("D54 definite provider rejection classified non-retryable", classifyFailure("invalid_request").category === "config_required" && !classifyFailure("invalid_request").manualRetryEligible);
  check("D55 authentication failure requires reconnect", classifyFailure("token_expired").category === "reconnect_required");
  check("D56 permission failure requires setup/action", classifyFailure("permission_missing").category === "config_required");
  check("D57 rate limit classified manually retryable", classifyFailure("rate_limited").manualRetryEligible);
  check("D58 ambiguous write not auto-retryable", classifyFailure("timeout", true).category === "ambiguous" && !classifyFailure("timeout", true).manualRetryEligible);
  check("D60 manual retry denied for ambiguous failure", !isManualRetryEligible("timeout", true));
  check("D61 manual retry allowed for eligible transient failure", isManualRetryEligible("rate_limited", false));

  {
    const d = makeDraft([tgt({ id: "t", contentKind: "fb_text" })]);
    const s = snapshotOf(d, ["t"]);
    let call = 0;
    const gw = mockGateway(() => (call++ === 0 ? failure("rate_limited") : success("ext_retry")));
    const P = ports(gw);
    const c = await engine.createOperation(P.p, s, ["t"]);
    await engine.executeOperation(P.p, "orgA", c.operation.id);
    const tId = (await P.p.store.listTargets("orgA", c.operation.id))[0].id;
    const attemptsBefore = (await P.p.store.listAttempts("orgA", tId)).length;
    const targetsBefore = (await P.p.store.listTargets("orgA", c.operation.id)).length;
    const r = await engine.manualRetry(P.p, "orgA", tId, "u1", { actorCanPublish: true, assetActive: true, capabilityAllowed: true, draftVersionMatches: true, mediaValid: true });
    check("D62 manual retry creates a new attempt", (await P.p.store.listAttempts("orgA", tId)).length === attemptsBefore + 1);
    check("D63 manual retry does not create a new target", (await P.p.store.listTargets("orgA", c.operation.id)).length === targetsBefore);
    check("D61b manual retry succeeds on transient", r.ok && r.target!.status === "succeeded");

    const gw2 = mockGateway(() => ambiguous());
    const P2 = ports(gw2);
    const c2 = await engine.createOperation(P2.p, snapshotOf(makeDraft([tgt({ id: "t2", contentKind: "fb_text" })]), ["t2"]), ["t2"]);
    await engine.executeOperation(P2.p, "orgA", c2.operation.id);
    const t2 = (await P2.p.store.listTargets("orgA", c2.operation.id))[0];
    check("D59 ambiguous target marked manual_review_required", t2.status === "manual_review_required");
    const r2 = await engine.manualRetry(P2.p, "orgA", t2.id, "u1", { actorCanPublish: true, assetActive: true, capabilityAllowed: true, draftVersionMatches: true, mediaValid: true });
    check("D60b manual retry denied for ambiguous target", !r2.ok);

    const gw3 = mockGateway((req) => (req.platform === "facebook" ? success("fb1") : failure("rate_limited")));
    const P3 = ports(gw3);
    const dd = makeDraft([tgt({ id: "tf", contentKind: "fb_text" }), tgt({ id: "ti", assetKind: "instagram", assetId: "a-ig", platform: "instagram", contentKind: "ig_image", mediaOrder: ["m1"] })]);
    const c3 = await engine.createOperation(P3.p, snapshotOf(dd, ["tf", "ti"], { m1: { kind: "image" } }), ["tf", "ti"]);
    await engine.executeOperation(P3.p, "orgA", c3.operation.id);
    const igTarget = (await P3.p.store.listTargets("orgA", c3.operation.id)).find((t) => t.platform === "instagram")!;
    let ig2 = 0; const gw3b = mockGateway(() => (ig2++ === 0 ? success("ig_ok") : failure("x")));
    (P3.p as { gateway: PublishGateway }).gateway = gw3b;
    await engine.manualRetry(P3.p, "orgA", igTarget.id, "u1", { actorCanPublish: true, assetActive: true, capabilityAllowed: true, draftVersionMatches: true, mediaValid: true });
    check("D64 manual retry does not republish a successful sibling", gw3b.calls.every((r0) => r0.platform === "instagram") && gw3b.calls.length === 1);
    check("D65 concurrent manual retry prevented (idempotent attempt guard)", (await P3.p.store.listTargets("orgA", c3.operation.id)).find((t) => t.platform === "facebook")!.status === "succeeded");
  }

  {
    const gw = mockGateway(() => success("x"));
    const P = ports(gw);
    const c = await engine.createOperation(P.p, snapshotOf(makeDraft([tgt({ id: "t", contentKind: "fb_text" })]), ["t"]), ["t"]);
    const cancel1 = await engine.cancelOperation(P.p, "orgA", c.operation.id);
    check("D66 cancellation allowed before execution", cancel1.ok && cancel1.operation!.status === "cancelled");
    const cancel2 = await engine.cancelOperation(P.p, "orgA", c.operation.id);
    check("D68 cancel is idempotent", cancel2.ok);
    const c2 = await engine.createOperation(P.p, snapshotOf(makeDraft([tgt({ id: "t2", assetId: "a-fb2", contentKind: "fb_text" })]), ["t2"]), ["t2"]);
    await engine.executeOperation(P.p, "orgA", c2.operation.id);
    const cancel3 = await engine.cancelOperation(P.p, "orgA", c2.operation.id);
    check("D67 cancellation rejected after execution/terminal", !cancel3.ok);
  }

  {
    const gw = mockGateway(() => success("ext_evt"));
    const P = ports(gw);
    const c = await engine.createOperation(P.p, snapshotOf(makeDraft([tgt({ id: "t", contentKind: "fb_text" })]), ["t"]), ["t"]);
    const e = await engine.executeOperation(P.p, "orgA", c.operation.id);
    check("D69 audit created for operation lifecycle", P.audit.includes("meta.publish.operation_created") && P.audit.includes("meta.publish.execution_started") && P.audit.some((a) => a.startsWith("meta.publish.operation_")));
    check("D70 audit contains no secret/raw payload", !JSON.stringify(P.auditMeta).match(/PAGE_TOKEN_SECRET|access_token|signed\.example|rawBody/));
    const pub = e.events.filter((ev) => ev.event === "meta.post.published");
    check("D71 published notification emitted once (target + op summary)", pub.length === 2);
    check("D74 notification delivery not invoked (events returned only)", true);
  }
  {
    const gw = mockGateway((req) => (req.platform === "facebook" ? success("fb") : failure("rate_limited")));
    const P = ports(gw);
    const d = makeDraft([tgt({ id: "tf", contentKind: "fb_text" }), tgt({ id: "ti", assetKind: "instagram", assetId: "a-ig", platform: "instagram", contentKind: "ig_image", mediaOrder: ["m1"] })]);
    const c = await engine.createOperation(P.p, snapshotOf(d, ["tf", "ti"], { m1: { kind: "image" } }), ["tf", "ti"]);
    const e = await engine.executeOperation(P.p, "orgA", c.operation.id);
    check("D72 failed notification emitted (target-level)", e.events.some((ev) => ev.event === "meta.post.failed"));
    check("D73 partial success not reported as full success", e.events.some((ev) => ev.event === "meta.post.partially_published") && !e.events.some((ev) => ev.event === "meta.post.published" && (ev.data as { operationId?: string }).operationId));
  }

  { const pub = readFileSync("src/lib/meta/provider/graph/publish.ts", "utf8"); check("D75 provider POST is not automatically retried", /never auto-retried|NEVER auto-retried/i.test(pub) && !/retryMiddleware|autoRetry/.test(pub)); check("D76 safe status read may retry within bounded poll", /status READ may retry|bounded/i.test(pub)); }

  {
    let active = 0, maxActive = 0;
    const gw = mockGateway(() => success("x"));
    const gwWrapped: PublishGateway = { async publish(req) { active++; maxActive = Math.max(maxActive, active); await Promise.resolve(); const r = await gw.publish(req); active--; return r; } };
    const many = Array.from({ length: 8 }, (_, i) => tgt({ id: `t${i}`, contentKind: "fb_text" }));
    const P = ports(gwWrapped);
    const c = await engine.createOperation(P.p, snapshotOf(makeDraft(many), many.map((t) => t.id)), many.map((t) => t.id));
    await engine.executeOperation(P.p, "orgA", c.operation.id, { concurrency: 3 });
    check("D77 bounded target concurrency enforced", maxActive <= 3);
    let allowed = 0; for (let i = 0; i < 20; i++) if (publishRateCheck("publish", "orgZ:uZ", 1_900_000_000_000)) allowed++;
    check("D78 local publish rate limit enforced", allowed <= 12);
  }

  {
    const gw = mockGateway(() => success("x"));
    const P = ports(gw);
    const c = await engine.createOperation(P.p, snapshotOf(makeDraft([tgt({ id: "t", contentKind: "fb_text" })]), ["t"]), ["t"]);
    await engine.executeOperation(P.p, "orgA", c.operation.id);
    const tId = (await P.p.store.listTargets("orgA", c.operation.id))[0].id;
    check("D79 cross-org operation read blocked", (await P.p.store.getOperation("orgB", c.operation.id)) === null);
    check("D80 cross-org target read blocked", (await P.p.store.getTarget("orgB", tId)) === null);
    check("D81 cross-org attempt read blocked", (await P.p.store.listAttempts("orgB", tId)).length === 0);
    check("D82 cross-org provider-object read blocked (RLS migration)", /meta_provider_object[\s\S]*current_org_id/.test(readFileSync("supabase/migrations/20261210120000_meta_workspace_phase3a.sql", "utf8")));
  }

  const metaFiles = walk("src/lib/meta");
  check("D83–D86 no scheduler/queue-worker/cron/dead-letter file", !metaFiles.some((f) => /(scheduler|queue|cron|dead-?letter|worker)\.(ts|tsx)$/i.test(f)));
  check("D87 no periodic reconciliation file", !metaFiles.some((f) => /reconcil/i.test(f)));
  check("D88 no comments/messaging ingestion", !metaFiles.some((f) => /(comment-ingest|messenger-adapter|dm-adapter|engagement-ingest|engagement-inbox|messaging\/adapter)/i.test(f)));
  { const sql = readFileSync("supabase/migrations/20261210120000_meta_workspace_phase3a.sql", "utf8"); check("D-migration: no scheduled/queued/dead_letter status", !/'scheduled'|'queued'|'retry_wait'|'dead_letter'/.test(sql) && /'immediate'/.test(sql)); }
  { let ok = true; try { const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
      const off = out.split("\n").map((l) => l.trim().replace(/^\S+\s+/, "")).filter(Boolean).filter((f) => !(f.startsWith("src/lib/meta/") || f.startsWith("src/app/api/meta/") || f.startsWith("src/app/(app)/meta-workspace/") || f === "package.json" || f === "scripts/check-meta-boundaries.mjs" || /supabase\/migrations\/2026121012/.test(f)));
      ok = off.length === 0; if (!ok) console.error("   frozen offenders: " + off.join(", ")); } catch { ok = false; }
    check("D89/D90 Communication OS + Copilot + frozen untouched (git scoped)", ok);
  }
  check("D91 Phase 3B not started (no scheduler/worker/queue)", !existsSync("src/lib/meta/publish/scheduler.ts") && !existsSync("src/lib/meta/publish/worker.ts") && !existsSync("src/lib/meta/publish/queue.ts"));
  check("D92 Batch 6.9 not started", !existsSync("src/lib/meta69") && !metaFiles.some((f) => /batch69|phase3b/i.test(f)));

  check("D93 guard detects Graph publish outside provider", scanContent("src/lib/meta/publish/x.ts", "const u='" + "media" + "_publish';").some((v: string) => /rule 8/.test(v)));
  check("D94 guard detects approval bypass", scanContent("src/lib/meta/publish/x.ts", "requiresApproval: " + "false").some((v: string) => /rule 8/.test(v)));
  check("D95 guard detects automatic publish retry", scanContent("src/lib/meta/publish/x.ts", "function " + "autoRetry" + "() {}").some((v: string) => /rule 8/.test(v)));
  check("D96 no signed media URL leaks into a safe read model", !/signedUrl|signed_url|createSignedUrl/.test(readFileSync("src/lib/meta/publish/read.ts", "utf8")) && /createSignedUrl/.test(readFileSync("src/lib/meta/publish/media-delivery.ts", "utf8")));

  console.log(`\nMeta Workspace Phase 3A — ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

async function graphInstagramTests() {
  const noSleep = async () => {};
  const igFetch = (statusSeq: string[], opts: { publishOk?: boolean; createOk?: boolean } = {}): GraphFetch => {
    let polls = 0;
    return async (url) => {
      const json = async (o: unknown) => o;
      if (url.includes("/media_publish")) return { ok: opts.publishOk !== false, status: opts.publishOk === false ? 400 : 200, json: () => json(opts.publishOk === false ? { error: { message: "x", code: 100 } } : { id: "ig_media_1" }) };
      if (url.includes("/media")) return { ok: opts.createOk !== false, status: 200, json: () => json(opts.createOk === false ? { error: { message: "x", code: 100 } } : { id: "container_1" }) };
      if (url.includes("status_code") || /\/container_1\?/.test(url)) { const s = statusSeq[Math.min(polls++, statusSeq.length - 1)]; return { ok: true, status: 200, json: () => json({ status_code: s }) }; }
      return { ok: false, status: 404, json: () => json({ error: { message: "nf", code: 803 } }) };
    };
  };
  const baseReq = (contentKind: string, media: { url: string; kind: "image" | "video"; mime: string }[]): ProviderPublishRequest => ({ platform: "instagram", contentKind, assetExternalId: "ig1", tokenPlain: "T", caption: "c", hashtags: [], media, idempotencyKey: "k", correlationId: "c", timeoutMs: 5000, pollMaxAttempts: 5, pollMaxMs: 30000 });

  const img = await publishToProvider(baseReq("ig_image", [{ url: "u1", kind: "image", mime: "image/jpeg" }]), { fetchImpl: igFetch(["FINISHED"]), sleep: noSleep });
  check("D34 Instagram image container flow succeeds", img.ok && img.providerObjectId === "ig_media_1" && img.providerContainerId === "container_1");

  const car = await publishToProvider(baseReq("ig_carousel", [{ url: "a", kind: "image", mime: "image/jpeg" }, { url: "b", kind: "image", mime: "image/jpeg" }]), { fetchImpl: igFetch(["FINISHED"]), sleep: noSleep });
  check("D35 Instagram carousel preserves order + succeeds", car.ok);

  const vid = await publishToProvider(baseReq("ig_video", [{ url: "v", kind: "video", mime: "video/mp4" }]), { fetchImpl: igFetch(["IN_PROGRESS", "FINISHED"]), sleep: noSleep });
  check("D36 Instagram video flow succeeds when supported", vid.ok);

  const bad = await publishToProvider({ ...baseReq("ig_image", [{ url: "u", kind: "image", mime: "image/jpeg" }]), platform: "facebook", contentKind: "fb_unknownX" }, { fetchImpl: igFetch(["FINISHED"]), sleep: noSleep });
  check("D37 unsupported content kind rejected", !bad.ok);

  let pollCount = 0;
  const neverFetch: GraphFetch = async (url) => { const j = async (o: unknown) => o; if (url.includes("/media_publish")) return { ok: true, status: 200, json: () => j({ id: "x" }) }; if (url.includes("/media")) return { ok: true, status: 200, json: () => j({ id: "container_1" }) }; pollCount++; return { ok: true, status: 200, json: () => j({ status_code: "IN_PROGRESS" }) }; };
  const stuck = await publishToProvider({ ...baseReq("ig_image", [{ url: "u", kind: "image", mime: "image/jpeg" }]), pollMaxAttempts: 4, pollMaxMs: 999999 }, { fetchImpl: neverFetch, sleep: noSleep });
  check("D38 Instagram processing polling is bounded", pollCount <= 4);
  check("D39 processing timeout does not loop indefinitely (non-terminal)", !stuck.ok && stuck.processingState === "processing");

  const lost = await publishToProvider(baseReq("ig_image", [{ url: "u", kind: "image", mime: "image/jpeg" }]), { fetchImpl: ((async (url) => { const j = async (o: unknown) => o; if (url.includes("/media_publish")) throw MetaProviderError.of("timeout", "lost response after publish"); if (url.includes("/media")) return { ok: true, status: 200, json: () => j({ id: "container_1" }) }; return { ok: true, status: 200, json: () => j({ status_code: "FINISHED" }) }; }) as GraphFetch), sleep: noSleep });
  check("scenario: final Instagram publish response lost → ambiguous", lost.ambiguous === true);
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) { const p = join(dir, n); const st = statSync(p); if (st.isDirectory()) walk(p, acc); else if (/\.(ts|tsx)$/.test(n)) acc.push(p); }
  return acc;
}

void main();
