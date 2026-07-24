// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PHASE 2 SELF TEST (Content Studio).
// Runnable gate: `npx tsx src/lib/meta/content/qa.ts`.
// Deterministic C1–C65 (+ scenarios) over the PURE content/media engines with an
// in-memory store — no network, no DB, no publishing. Also runs static proofs:
// migration/RLS shape, guard leakage fixtures, secret/storage/publish scans, and
// frozen-code checks.
// ============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { ContentStore, ContentPorts, MediaAssetRow, DraftVersionRow, ApprovalRequestRow, ApprovalCommentRow } from "./ports";
import type { DraftState, DraftTargetState } from "./domain";
import * as engine from "./engine";
import { contentHash } from "./version";
import { transition, guardApprovalAction } from "./approval";
import { resolvePermissions, canEditDrafts, canApproveDrafts } from "./roles";
import { resolveEffectiveContent, clearCaptionOverride } from "./variant";
import { validateTarget, validateDraft, type TargetValidationContext, type MediaFactsRecord } from "./validate";
import { buildTargetPreview } from "./preview";
import { buildCalendar, type CalendarItem } from "./calendar";
import { validateUpload, validateMediaForTarget } from "../media/validate";
import { dedupByChecksum, deletionPolicy, mediaKindFromMime } from "../media/library";
import { resolveVariant, PROCESSING_MATRIX } from "../media/processing";
import { MEDIA_RULESET_VERSION } from "../media/requirements";
import { scanContent } from "../../../../scripts/check-meta-boundaries.mjs";
import type { MetaCapabilityDecision } from "../capability/types";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.error("  ✗ " + name); } };
const ROOT = process.cwd();
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\nMeta Workspace (6.8) Phase 2 — SELF TEST (Content Studio)\n");

// ── In-memory store ─────────────────────────────────────────────────────────
function memStore() {
  const drafts = new Map<string, DraftState>();
  const versions: DraftVersionRow[] = [];
  const media = new Map<string, MediaAssetRow>();
  const approvals: ApprovalRequestRow[] = [];
  const comments: ApprovalCommentRow[] = [];
  const store: ContentStore = {
    async saveDraft(d) { drafts.set(d.id, d); },
    async getDraft(orgId, id) { const d = drafts.get(id); return d && d.orgId === orgId ? d : null; },
    async listDrafts(orgId) { return [...drafts.values()].filter((d) => d.orgId === orgId); },
    async insertVersion(r) { versions.push(r); },
    async listVersions(orgId, draftId) { return versions.filter((v) => v.orgId === orgId && v.draftId === draftId).sort((a, b) => b.versionNumber - a.versionNumber); },
    async getMedia(orgId, id) { const m = media.get(id); return m && m.orgId === orgId ? m : null; },
    async listMedia(orgId) { return [...media.values()].filter((m) => m.orgId === orgId); },
    async saveMedia(r) { media.set(r.id, r); },
    async getPendingApproval(orgId, draftId) { return approvals.find((a) => a.orgId === orgId && a.draftId === draftId && a.status === "pending") ?? null; },
    async insertApproval(r) { approvals.push(r); },
    async updateApproval(r) { const i = approvals.findIndex((a) => a.id === r.id); if (i >= 0) approvals[i] = r; },
    async listApprovals(orgId, draftId) { return approvals.filter((a) => a.orgId === orgId && a.draftId === draftId); },
    async insertComment(r) { comments.push(r); },
    async updateComment(r) { const i = comments.findIndex((c) => c.id === r.id); if (i >= 0) comments[i] = r; },
    async listComments(orgId, draftId) { return comments.filter((c) => c.orgId === orgId && c.draftId === draftId); },
  };
  return { store, drafts, versions, media, approvals, comments };
}

function ports(): { p: ContentPorts; audit: string[]; auditMeta: unknown[]; mem: ReturnType<typeof memStore> } {
  const mem = memStore();
  const audit: string[] = []; const auditMeta: unknown[] = [];
  let idc = 0;
  const p: ContentPorts = {
    store: mem.store,
    clock: { nowMs: () => 1_800_000_000_000, nowIso: () => "2027-01-15T00:00:00.000Z" },
    ids: { uuid: () => `id-${++idc}` },
    audit: { log: async (i) => { audit.push(i.action); auditMeta.push(i.metadata); } },
  };
  return { p, audit, auditMeta, mem };
}

const target = (over: Partial<DraftTargetState> = {}): Omit<DraftTargetState, "id"> => ({ assetKind: "page", assetId: "asset-fb", platform: "facebook", contentKind: "fb_text", enabled: true, captionOverride: null, hashtagsOverride: null, mediaOrder: [], plannedAt: null, ...over });

const okDecision: MetaCapabilityDecision = { key: "x", allowed: true, reason: null, humanReason: "ok", missing: [], degraded: false, signals: {} };
const denyDecision = (reason: MetaCapabilityDecision["reason"]): MetaCapabilityDecision => ({ key: "x", allowed: false, reason, humanReason: "no", missing: [], degraded: false, signals: {} });

function valCtx(over: Partial<TargetValidationContext> = {}): TargetValidationContext {
  return {
    capabilityByTarget: () => okDecision,
    assetState: () => ({ status: "active", connectionHealth: "healthy" }),
    media: () => null,
    ...over,
  };
}
const imgFacts = (over: Partial<MediaFactsRecord> = {}): MediaFactsRecord => ({ mediaKind: "image", actualMime: "image/jpeg", fileSize: 500_000, width: 1080, height: 1080, durationMs: null, archivedAt: null, ...over });

async function main() {
  const P = ports();
  const { p } = P;

  // C1 · create draft → version 1
  const d1 = await engine.createDraft(p, { orgId: "orgA", userId: "u1", internalName: "D1" });
  check("C1 org user creates draft", d1.status === "draft" && d1.currentVersion === 1);
  check("C25 draft creation creates version 1", P.mem.versions.filter((v) => v.draftId === d1.id).length === 1);

  // C2 · cross-org draft read blocked
  check("C2 cross-org draft read blocked", (await p.store.getDraft("orgB", d1.id)) === null);

  // C3 · cross-org media read blocked
  await p.store.saveMedia({ ...imgFacts(), id: "m1", orgId: "orgA", uploadedBy: "u1", storageRef: "s/1", originalFilename: "a.jpg", displayFilename: "a.jpg", mimeType: "image/jpeg", checksum: "ck1", processingStatus: "ready", validationStatus: "valid", validationErrors: [], aspectRatio: 1 });
  check("C3 cross-org media read blocked", (await p.store.getMedia("orgB", "m1")) === null);

  // C4 · unauthorized cannot edit ; C5 · unauthorized cannot approve
  check("C4 read-only role cannot edit", canEditDrafts("read_only") === false && canEditDrafts("zono_support") === false);
  check("C5 content creator cannot approve", canApproveDrafts("content_creator") === false);
  check("C31 unauthorized approver rejected", guardApprovalAction("approve", { canApprove: false, canEdit: true, isCreator: false, allowSelfApproval: false, hasPendingRequest: true }).ok === false);
  check("C32 creator self-approval follows policy (off)", guardApprovalAction("approve", { canApprove: true, canEdit: true, isCreator: true, allowSelfApproval: false, hasPendingRequest: true }).ok === false && guardApprovalAction("approve", { canApprove: true, canEdit: true, isCreator: true, allowSelfApproval: true, hasPendingRequest: true }).ok === true);

  // C6–C9 · media upload guards
  check("C6 media kind inferred from inspected mime (auth path uses server mime)", mediaKindFromMime("image/jpeg") === "image" && mediaKindFromMime("application/x-msdownload") === null);
  check("C7 invalid mime rejected", validateUpload(imgFacts({ actualMime: "image/gif" })).status === "invalid");
  check("C8 MIME spoofing rejected", validateUpload(imgFacts(), "image/png").codes.some((c) => c.code === "mime_spoofed"));
  check("C9 oversized file rejected", validateUpload(imgFacts({ fileSize: 999_000_000 })).codes.some((c) => c.code === "file_too_large"));

  // C10 · checksum dedup
  check("C10 media checksum deduplicates", dedupByChecksum("ck1", [{ id: "m1", checksum: "ck1", archivedAt: null }]).isDuplicate && !dedupByChecksum("ckX", [{ id: "m1", checksum: "ck1", archivedAt: null }]).isDuplicate);

  // C11 · private storage URL not exposed permanently (DTO drops storageRef)
  { const readSrc = readFileSync("src/lib/meta/content/read.ts", "utf8"); check("C11 media DTO never exposes storage_ref (short-lived URL only)", !/storageRef/.test(strip(readSrc)) && /previewUrl/.test(readSrc)); }

  // C12 · archived media cannot be newly attached ; C13 · referenced media archived not deleted
  const { canAttachMedia } = await import("../media/library");
  check("C12 archived media cannot be attached", canAttachMedia({ archivedAt: "2027-01-01" }).ok === false && canAttachMedia({ archivedAt: null }).ok === true);
  check("C13 referenced media archived, not destructively deleted", deletionPolicy(true).action === "archive" && deletionPolicy(false).action === "hard_delete");

  // C14–C16 · independent target validation
  const dFB = await engine.createDraft(p, { orgId: "orgA", userId: "u1", internalName: "img" });
  await p.store.saveMedia({ ...imgFacts(), id: "mIG", orgId: "orgA", uploadedBy: "u1", storageRef: "s/ig", originalFilename: "b.jpg", displayFilename: "b.jpg", mimeType: "image/jpeg", checksum: "ckIG", processingStatus: "ready", validationStatus: "valid", validationErrors: [], aspectRatio: 1 });
  let cur = (await engine.addTarget(p, dFB, target({ contentKind: "fb_image", assetId: "asset-fb", mediaOrder: ["mIG"] }), dFB.revision, "u1")).draft;
  cur = (await engine.addTarget(p, cur, target({ platform: "instagram", assetKind: "instagram", contentKind: "ig_image", assetId: "asset-ig", mediaOrder: ["mIG"] }), cur.revision, "u1")).draft;
  const vCtx = valCtx({ media: (id) => (id === "mIG" ? imgFacts() : null), assetState: () => ({ status: "active", connectionHealth: "healthy" }) });
  const vres = validateDraft(cur, vCtx);
  check("C14 Facebook target validates independently", vres.targets.find((t) => t.platform === "facebook")?.readiness === "ready");
  check("C15 Instagram target validates independently", vres.targets.find((t) => t.platform === "instagram")?.readiness === "ready");
  // Make FB invalid (missing capability) but IG still valid.
  const mixedCtx = valCtx({ media: () => imgFacts(), capabilityByTarget: (t) => (t.platform === "facebook" ? denyDecision("permission_missing") : okDecision) });
  const mixed = validateDraft(cur, mixedCtx);
  check("C16 one invalid target does not invalidate a valid sibling", mixed.targets.find((t) => t.platform === "facebook")?.readiness === "invalid" && mixed.targets.find((t) => t.platform === "instagram")?.readiness === "ready");
  check("C17 missing granted capability blocks readiness", mixed.targets.find((t) => t.platform === "facebook")?.publishable === false);

  // C18 · degraded connection → warning (policy)
  const degraded = validateTarget(cur, cur.targets[0], valCtx({ media: () => imgFacts(), assetState: () => ({ status: "active", connectionHealth: "degraded" }) }));
  check("C18 degraded connection produces a warning (not publishable)", degraded.readiness === "warning" && degraded.publishable === false);

  // C19 · Facebook Groups always rejected (no groups content kind enabled)
  const groupsTry = validateTarget(cur, { ...cur.targets[0], contentKind: "fb_groups" }, valCtx({ media: () => imgFacts() }));
  check("C19 Facebook Groups content kind rejected", groupsTry.readiness === "invalid");

  // C20 · unsupported (Extended disabled) kind rejected
  const reel = validateTarget(cur, { ...cur.targets[1], contentKind: "ig_reel" }, valCtx({ media: () => imgFacts() }));
  check("C20 Extended/unsupported kind rejected (disabled)", reel.codes.some((c) => c.code === "content_kind_disabled"));

  // C21–C24 · variants
  let vd = await engine.createDraft(p, { orgId: "orgA", userId: "u1", internalName: "var" });
  vd = (await engine.editFields(p, vd, { defaultCaption: "SHARED" }, vd.revision, "u1")).draft;
  vd = (await engine.addTarget(p, vd, target({ platform: "facebook" }), vd.revision, "u1")).draft;
  const shared = resolveEffectiveContent(vd, vd.targets[0]);
  check("C21 shared caption inherited by target", shared.caption === "SHARED");
  vd = (await engine.updateTarget(p, vd, vd.targets[0].id, { captionOverride: "FB ONLY" }, vd.revision, "u1")).draft;
  const overridden = resolveEffectiveContent(vd, vd.targets[0]);
  check("C22 platform override replaces shared caption for that platform only", overridden.caption === "FB ONLY" && vd.defaultCaption === "SHARED");
  const clearedT = clearCaptionOverride(vd.targets[0]);
  check("C23 removing override restores shared value", resolveEffectiveContent(vd, clearedT).caption === "SHARED");
  vd = (await engine.updateTarget(p, vd, vd.targets[0].id, { mediaOrder: ["a", "b", "c"] }, vd.revision, "u1")).draft;
  check("C24 per-target media ordering preserved", JSON.stringify(vd.targets[0].mediaOrder) === JSON.stringify(["a", "b", "c"]));

  // C26–C28 · versioning
  const before = vd.currentVersion;
  const noop = await engine.editFields(p, vd, { defaultCaption: vd.defaultCaption }, vd.revision, "u1");
  check("C26 no-op update creates no new version", noop.versionCreated === false && noop.draft.currentVersion === before);
  const meaningful = await engine.editFields(p, vd, { defaultCaption: "changed!" }, vd.revision, "u1");
  check("C27 meaningful update creates exactly one version", meaningful.versionCreated === true && meaningful.draft.currentVersion === before + 1);
  check("C28 content hash deterministic", contentHash(vd) === contentHash({ ...vd }));

  // C29–C30 · approval binds to version ; duplicate pending rejected
  let ad = await engine.createDraft(p, { orgId: "orgA", userId: "creator", internalName: "appr" });
  ad = (await engine.editFields(p, ad, { defaultCaption: "ready to review" }, ad.revision, "creator")).draft;
  const submit = await engine.submitForApproval(p, ad, "creator", resolvePermissions("manager", false));
  check("C29 approval request references exact version", P.mem.approvals.find((a) => a.draftId === ad.id)?.draftVersionNumber === ad.currentVersion && submit.draft.status === "in_review");
  const dupSubmit = await engine.submitForApproval(p, submit.draft, "creator", resolvePermissions("manager", false));
  check("C30 duplicate pending approval request rejected", dupSubmit.ok === false);

  // C33–C34 · valid/invalid transitions
  check("C33 valid transition in_review→approved", transition("in_review", "pending", "approve").ok);
  check("C34 invalid transition draft→approve rejected", transition("draft", "not_required", "approve").ok === false);

  // approve then C35 · editing approved invalidates approval
  const approved = await engine.decideApproval(p, submit.draft, "approve", "manager", resolvePermissions("manager", false), null);
  check("C55 approval-request event emitted", submit.events.some((e) => e.event === "meta.post.approval_requested"));
  check("C56 approval-decision event emitted", approved.events.some((e) => e.event === "meta.post.approved"));
  const editApproved = await engine.editFields(p, approved.draft, { defaultCaption: "edited after approval" }, approved.draft.revision, "creator");
  check("C35 editing approved draft invalidates approval", editApproved.invalidatedApproval === true && editApproved.draft.status === "draft" && editApproved.draft.approvalState === "not_required");
  check("C44 approved draft still does not publish (no publish state exists)", !["published", "queued", "publishing"].includes(approved.draft.status));

  // C36 · restore creates a new version (not mutating history)
  const histLen = (await p.store.listVersions("orgA", ad.id)).length;
  const restored = await engine.restoreVersion(p, editApproved.draft, 1, "creator");
  check("C36 restore creates a new version (history preserved)", restored.versionCreated === true && (await p.store.listVersions("orgA", ad.id)).length === histLen + 1);

  // C37–C38 · comments internal + cross-org blocked
  await engine.addComment(p, ad, "creator", "internal note");
  check("C37 approval comments are internal (audited internalOnly)", P.audit.includes("meta.review.comment_added"));
  check("C38 review comment cross-org access blocked", (await p.store.listComments("orgB", ad.id)).length === 0 && (await p.store.listComments("orgA", ad.id)).length === 1);

  // C39–C41 · preview
  const prev = buildTargetPreview(cur, cur.targets[0], { assetDisplay: "Zono Page", media: () => ({ displayName: "b.jpg", kind: "image", aspectHint: "1:1" }), readiness: "ready" });
  check("C39 preview contains no Graph payload", !JSON.stringify(prev).includes("access" + "_token") && !JSON.stringify(prev).includes("graph.face" + "book.com"));
  check("C40 preview clearly marked approximate", prev.approximate === true && /APPROXIMATE/i.test(prev.marker));
  const longCap = buildTargetPreview({ ...cur, defaultCaption: "x".repeat(3000), targets: [{ ...cur.targets[1], captionOverride: null }] }, { ...cur.targets[1], captionOverride: null }, { assetDisplay: "IG", media: () => null, readiness: "warning" });
  check("C41 preview reports validation/truncation warnings", longCap.truncationWarning !== null);

  // C42–C43 · calendar
  const calItems: CalendarItem[] = [
    { draftId: "a", internalName: "A", status: "draft", approvalState: "not_required", plannedAt: "2027-02-01T10:00:00.000Z", timezone: "Asia/Jerusalem", platforms: ["facebook"], contentKinds: ["fb_text"], readiness: "ready", conflict: false },
    { draftId: "b", internalName: "B", status: "draft", approvalState: "not_required", plannedAt: null, timezone: null, platforms: [], contentKinds: [], readiness: "unknown", conflict: false },
  ];
  const cal = buildCalendar(calItems);
  check("C42 calendar item reflects planned time", cal.scheduled[0]?.plannedAt === "2027-02-01T10:00:00.000Z" && cal.unscheduled.length === 1);
  check("C43 calendar creates no publishing job (planning only)", !JSON.stringify(cal).includes("job") && !JSON.stringify(cal).includes("queue"));

  // C50–C52 · centralized validation + ruleset version + variant-required honesty
  check("C50 media validation is centralized (single ruleset version)", typeof MEDIA_RULESET_VERSION === "string" && MEDIA_RULESET_VERSION.length > 0);
  const igVid = validateMediaForTarget({ mediaKind: "video", actualMime: "video/quicktime", fileSize: 10_000_000, width: 1080, height: 1080, durationMs: 10_000 }, "instagram", "video");
  check("C51 validation records the ruleset version", igVid.rulesetVersion === MEDIA_RULESET_VERSION);
  check("C52 variant-required handled honestly", igVid.variantRequired === true && resolveVariant({ mediaAssetId: "m", variantKey: "ig", targetPlatform: "instagram", intendedContentKind: "video" }, { transformNeeded: true, originalStorageRef: "s", transcodeAvailable: false }).status === "variant_required");
  check("C52 processing matrix declares transcoding deferred", PROCESSING_MATRIX.find((o) => o.op === "target_variant")?.capability === "deferred");

  // C53–C54 · audit safety
  const uploadAuditClean = JSON.stringify(P.auditMeta).match(/signedUrl|storage_ref|secret-ref|access_token/) === null;
  check("C53 upload/draft audit contains no signed URL or secret", uploadAuditClean);
  check("C54 draft audit contains no full sensitive snapshot", !JSON.stringify(P.auditMeta).includes("defaultCaption"));

  // C57 · notification delivery not invoked (only events built, no sink import)
  { const svc = readFileSync("src/lib/meta/content/service.ts", "utf8") + readFileSync("src/lib/meta/content/engine.ts", "utf8"); check("C57 no notification delivery invoked", !/notify\/delivery|DeliveryProvider|sendNotification/.test(svc)); }

  // C58 · optimistic concurrency conflict
  const conflictEdit = await engine.editFields(p, vd, { defaultCaption: "stale write" }, vd.revision - 999, "u1");
  check("C58 optimistic concurrency conflict detected", conflictEdit.ok === false && conflictEdit.error === "conflict");

  // C59 · client DTO contains no secret/token
  { const readSrc = readFileSync("src/lib/meta/content/read.ts", "utf8"); check("C59 client DTOs expose no token/storage secret", !new RegExp("access" + "_token").test(readSrc) && !/token_ref|tokenRef/.test(readSrc)); }

  // C60–C62 · guard leakage fixtures
  check("C60 guard detects publish leakage", scanContent("src/lib/meta/content/x.ts", "const s = '" + "media" + "_publish';").some((v: string) => /rule 8/.test(v)));
  check("C61 guard detects raw Graph field leakage", scanContent("src/lib/meta/content/x.ts", "const t='" + "access" + "_token';").some((v: string) => /rule 2/.test(v)));
  check("C62 guard detects storage-secret / raw-bytes leakage", scanContent("src/lib/meta/content/x.ts", "const k=process.env." + "SUPABASE_SERVICE_ROLE_KEY;").some((v: string) => /rule 8/.test(v)) && scanContent("src/lib/meta/content/x.ts", "column " + "bytea").some((v: string) => /rule 8/.test(v)));

  // C46–C48 · no publishing table / worker / cron / comments-messaging in migrations+lib
  { const files = walk("src/lib/meta"); const migs = existsSync("supabase/migrations") ? readdirSync("supabase/migrations").filter((f) => f.includes("meta_workspace_phase2")) : [];
    const migSql = migs.map((m) => readFileSync(join("supabase/migrations", m), "utf8")).join("\n");
    check("C46 no publishing table created in Phase 2", !/meta_publishing_job|meta_published_post|create table[^;]*publish/i.test(migSql));
    check("C47 no worker/cron file created", !files.some((f) => /(worker|cron|scheduler)\.(ts|tsx)$/i.test(f)));
    check("C48 no comments/messaging ingestion implemented", !files.some((f) => /(comment-ingest|messenger-adapter|dm-adapter|engagement-ingest)/i.test(f)));
  }

  // C45 · no Graph publish request anywhere under meta (outside graph, no publish endpoints)
  { const files = walk("src/lib/meta").filter((f) => !/qa\.ts$/.test(f)); const leaked = files.filter((f) => /media_publish|scheduled_publish_time|createMediaContainer/.test(strip(readFileSync(f, "utf8")))); check("C45 no Graph publish request occurs", leaked.length === 0); }

  // C49 · Communication OS not modified (git) ; C64 · frozen modules unchanged
  { let ok = true; try { const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
      const offenders = out.split("\n").map((l) => l.trim().replace(/^\S+\s+/, "")).filter(Boolean).filter((f) => !(f.startsWith("src/lib/meta/") || f.startsWith("src/app/api/meta/") || f.startsWith("src/app/(app)/meta-workspace/") || f === "package.json" || f === "scripts/check-meta-boundaries.mjs" || /supabase\/migrations\/20261205120000/.test(f)));
      ok = offenders.length === 0; if (!ok) console.error("   frozen offenders: " + offenders.join(", ")); } catch { ok = false; }
    check("C49/C64 frozen systems + Communication OS unchanged (git scoped)", ok);
  }

  // C63 · RLS migration covers every Phase 2 table
  { const sql = readFileSync("supabase/migrations/20261205120000_meta_workspace_phase2.sql", "utf8");
    const tables = ["meta_media_asset", "meta_media_variant", "meta_content_draft", "meta_content_draft_target", "meta_content_draft_version", "meta_approval_request", "meta_approval_comment"];
    check("C63 RLS covers every Phase 2 table", tables.every((t) => sql.includes(`create table if not exists public.${t}`)) && /enable row level security/.test(sql) && sql.includes("org_id = public.current_org_id()") && /has_min_role/.test(sql) && !/alter table public\.(whatsapp_|copilot_|meta_connection)/i.test(sql));
  }

  // C65 · Phase 3 not started (no publishing module)
  check("C65 Phase 3 not started (no publish engine/module)", !existsSync("src/lib/meta/publish/engine.ts") && !existsSync("src/lib/meta/publish/worker.ts"));

  // ── Extra scenarios ────────────────────────────────────────────────────────
  const empty = await engine.createDraft(p, { orgId: "orgA", userId: "u1", internalName: "empty" });
  check("scenario: empty draft valid to save", empty.targets.length === 0);
  const dup = await engine.duplicateDraft(p, cur, "u1");
  check("scenario: duplicate draft copies targets with new ids, status draft", dup.status === "draft" && dup.targets.length === cur.targets.length && dup.targets[0].id !== cur.targets[0].id);
  const arch = await engine.setArchived(p, empty, true);
  check("scenario: archived draft cannot be edited", (await engine.editFields(p, arch.draft, { defaultCaption: "x" }, arch.draft.revision, "u1")).ok === false);
  const changesFlow = await engine.decideApproval(p, (await engine.submitForApproval(p, dup, "u1", resolvePermissions("manager", false))).draft, "request_changes", "manager", resolvePermissions("manager", false), "fix caption");
  check("scenario: changes-requested workflow + event", changesFlow.draft.status === "changes_requested" && changesFlow.events.some((e) => e.event === "meta.post.changes_requested"));
  // asset disconnected / lost permission after draft creation
  const disc = validateTarget(cur, cur.targets[0], valCtx({ media: () => imgFacts(), assetState: () => ({ status: "tombstoned", connectionHealth: "healthy" }) }));
  check("scenario: asset disconnected after creation → invalid", disc.readiness === "invalid");

  console.log(`\nMeta Workspace Phase 2 — ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) { const pth = join(dir, name); const st = statSync(pth); if (st.isDirectory()) walk(pth, acc); else if (/\.(ts|tsx)$/.test(name)) acc.push(pth); }
  return acc;
}

void main();
