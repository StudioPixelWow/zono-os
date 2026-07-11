// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.3 · Canonical spine service + guarded backfill.
//
// Two things live here, and nothing else in ZONO may write `journeys` after this
// batch except these and the kernel's journey-applier (5.2):
//
//   openCanonicalJourney()  — THE command-side journey creator. Every stage it
//                             writes goes through buildTransition(). It is what
//                             journey-intelligence's ensureJourney now delegates
//                             to, which is how a seller can no longer be created
//                             at the non-canonical stage `potential`.
//
//   runJourneyBackfill()    — reads the real legacy sources, resolves them through
//                             the pure planner, and applies the plan. Idempotent:
//                             re-running it produces zero new rows.
//
// Both rely on the SAME DB constraints as the kernel:
//   journeys_entity_uniq                  → one journey per (org, type, entity)
//   journey_events_source_transition_uniq → one history row per (journey, src, to)
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  buildTransition, compatOpenStage, isValidStage, machineFor, resolveLegacyStage,
  type JourneyType, type ResolvedStage,
} from "@/lib/journey-canonical";
import {
  planBackfill, summarize,
  type BackfillCandidate, type BackfillDecision, type BackfillTotals, type ExistingJourney,
} from "./plan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const isDuplicate = (e: { message?: string } | null) =>
  !!e?.message && /duplicate key|unique constraint/i.test(e.message);

// ── The ONE canonical journey row reader ────────────────────────────────────
async function findJourney(db: Db, orgId: string, journeyType: JourneyType, entityType: string, entityId: string): Promise<ExistingJourney | null> {
  const { data } = await db
    .from("journeys")
    .select("id,current_stage,status,source")
    .eq("org_id", orgId).eq("journey_type", journeyType)
    .eq("entity_type", entityType).eq("entity_id", entityId)
    .maybeSingle();
  const r = data as { id: string; current_stage: string; status: string; source: string | null } | null;
  return r ? { id: r.id, currentStage: r.current_stage, status: r.status, source: r.source } : null;
}

export interface OpenJourneyInput {
  orgId: string;
  journeyType: JourneyType;
  entityType: string;
  entityId: string;
  /** What the legacy caller WANTED. Resolved, never written raw. */
  requestedLegacyStage?: string | null;
  ownerUserId?: string | null;
  /** Where the row came from — 'compat' (ensureJourney) or 'legacy_backfill'. */
  source: "compat" | "legacy_backfill";
  actorUserId?: string | null;
}

export type OpenJourneyResult =
  | { ok: true; id: string; created: boolean; stage: string }
  | { ok: false; error: string; diagnostic?: ResolvedStage };

/**
 * PART 2 — the canonical creation service. Idempotent, never overwrites, never
 * writes a stage the machine has not accepted.
 */
export async function openCanonicalJourney(db: Db, input: OpenJourneyInput): Promise<OpenJourneyResult> {
  const { orgId, journeyType, entityType, entityId } = input;

  // 1. Never compete with the kernel — an existing journey is RETURNED, not touched.
  const existing = await findJourney(db, orgId, journeyType, entityType, entityId);
  if (existing) return { ok: true, id: existing.id, created: false, stage: existing.currentStage };

  // 2. Resolve the opening stage. A legacy caller's raw value never reaches the DB.
  const compat = compatOpenStage(journeyType, input.requestedLegacyStage);
  if (compat.stage === null) {
    return {
      ok: false,
      error: `legacy stage '${input.requestedLegacyStage}' has no canonical mapping for a ${journeyType} journey — refusing to write it`,
      diagnostic: compat.resolved,
    };
  }
  const opening = compat.stage;

  // 3. Validate through the SAME machine the kernel uses. Belt and braces: if the
  //    resolver ever returned something the machine rejects, we fail loudly.
  const t = buildTransition(journeyType, null, opening, {
    reason: input.source === "compat" ? "compat:ensureJourney" : "legacy_backfill",
    evidence: {
      openedVia: input.source,
      requestedLegacyStage: input.requestedLegacyStage ?? null,
      resolved: compat.resolved ?? null,
    },
  });
  if (!t) return { ok: false, error: `cannot open a ${journeyType} journey at '${opening}'` };

  const now = new Date().toISOString();
  const insert: Record<string, unknown> = {
    org_id: orgId,
    journey_type: journeyType,
    entity_type: entityType,
    entity_id: entityId,
    current_stage: t.toStage,
    status: t.status,
    owner_user_id: input.ownerUserId ?? null,
    source: input.source,
    metadata: {
      openedBy: input.source,
      requestedLegacyStage: input.requestedLegacyStage ?? null,
      resolved: compat.resolved ?? null,
    },
    stage_entered_at: now,
    last_activity_at: now,
    started_at: now,
  };
  if (t.timestampField) insert[t.timestampField] = now;

  const { data, error } = await db.from("journeys").insert(insert).select("id").maybeSingle();
  if (error) {
    // journeys_entity_uniq: the kernel drain won the race between step 1 and now.
    // Re-read and return THEIR row. We never create a second journey.
    if (isDuplicate(error)) {
      const again = await findJourney(db, orgId, journeyType, entityType, entityId);
      if (again) return { ok: true, id: again.id, created: false, stage: again.currentStage };
    }
    return { ok: false, error: error.message };
  }
  const id = (data as { id: string }).id;

  await db.from("journey_events").insert({
    org_id: orgId,
    journey_id: id,
    entity_type: entityType,
    entity_id: entityId,
    event_type: "journey_opened",
    from_stage: null,
    to_stage: t.toStage,
    title: `מסע נפתח: ${t.toStage}`,
    occurred_at: now,
    actor_user_id: input.actorUserId ?? null,   // null when unknown — NEVER faked
    reason: t.reason,
    evidence: t.evidence,
  });

  return { ok: true, id, created: true, stage: t.toStage };
}

// ── PART 11 — LIVE DIAGNOSTICS ──────────────────────────────────────────────
export interface JourneyDiagnostics {
  scannedAt: string;
  sourceRows: Record<string, number>;
  canonicalJourneysBefore: number;
  candidates: number;
  duplicateCandidates: number;
  unmappable: { source: string; rowId: string; detail: string }[];
  missingEntities: { source: string; rowId: string; detail: string }[];
  crossOrgAnomalies: { source: string; rowId: string; detail: string }[];
  conflictingStages: { source: string; rowId: string; detail: string }[];
  legacyNewerThanCanonical: number;
  canonicalNewerThanLegacy: number;
  notesWithUnresolvedJourney: number;
  plan: BackfillTotals;
  decisions: BackfillDecision[];
}

/** Read every real legacy source and resolve it. READ-ONLY — writes nothing. */
export async function diagnoseJourneyBackfill(db: Db): Promise<JourneyDiagnostics> {
  const sourceRows: Record<string, number> = {};
  const candidates: BackfillCandidate[] = [];
  const unmappable: JourneyDiagnostics["unmappable"] = [];
  const missingEntities: JourneyDiagnostics["missingEntities"] = [];
  const crossOrg: JourneyDiagnostics["crossOrgAnomalies"] = [];
  const conflicting: JourneyDiagnostics["conflictingStages"] = [];
  let legacyNewer = 0;
  let canonicalNewer = 0;

  // ── SOURCE A: property_journeys (the only legacy table with real data) ─────
  const { data: pjs } = await db
    .from("property_journeys")
    .select("id,org_id,property_id,current_stage,stage_entered_at,created_at,updated_at,stage_history");
  const pjRows = (pjs ?? []) as {
    id: string; org_id: string; property_id: string; current_stage: string;
    stage_entered_at: string | null; created_at: string; updated_at: string;
  }[];
  sourceRows["property_journeys"] = pjRows.length;

  const propIds = pjRows.map((r) => r.property_id);
  const { data: props } = propIds.length
    ? await db.from("properties").select("id,org_id,status,owner_id,updated_at").in("id", propIds)
    : { data: [] };
  const propById = new Map<string, { id: string; org_id: string; status: string | null; owner_id: string | null; updated_at: string }>(
    ((props ?? []) as { id: string; org_id: string; status: string | null; owner_id: string | null; updated_at: string }[]).map((p) => [p.id, p]),
  );

  for (const r of pjRows) {
    const p = propById.get(r.property_id);
    const legacy = resolveLegacyStage("property", "journey_stage_enum", r.current_stage);
    const entity = p ? resolveLegacyStage("property", "properties_status", p.status) : null;

    const anomaly = !p ? "missing_entity" as const
      : p.org_id !== r.org_id ? "cross_org" as const
        : undefined;
    if (anomaly === "missing_entity") missingEntities.push({ source: "property_journeys", rowId: r.id, detail: `property ${r.property_id} not found` });
    if (anomaly === "cross_org") crossOrg.push({ source: "property_journeys", rowId: r.id, detail: `journey org ${r.org_id} ≠ property org ${p!.org_id}` });
    if (legacy.quality === "unmappable" || legacy.quality === "ambiguous") {
      unmappable.push({ source: "property_journeys", rowId: r.id, detail: `${legacy.vocabulary}='${legacy.legacy}' — ${legacy.note ?? "no peer"}` });
    }
    if (p && entity && legacy.canonical && entity.canonical && legacy.canonical !== entity.canonical) {
      conflicting.push({
        source: "property_journeys", rowId: r.id,
        detail: `legacy journey says '${legacy.legacy}'→${legacy.canonical}, property.status says '${entity.legacy}'→${entity.canonical}`,
      });
      if (new Date(p.updated_at) > new Date(r.updated_at)) legacyNewer++; else canonicalNewer++;
    }

    candidates.push({
      orgId: r.org_id,
      journeyType: "property",
      entityType: "property",
      entityId: r.property_id,
      sourceTable: "property_journeys",
      sourceRowId: r.id,
      legacyStage: legacy,
      entityStage: entity,
      legacyUpdatedAt: r.updated_at,
      entityUpdatedAt: p?.updated_at ?? null,
      startedAt: r.created_at,
      ownerUserId: p?.owner_id ?? null,
      anomaly,
    });
  }

  // ── SOURCE B: deal_journeys — keyed by deal_profiles.id (the 5.2 dual identity).
  //    EVERY row must be resolved to public.deals.id. A profile id is never an entity id.
  const { data: djs } = await db
    .from("deal_journeys")
    .select("id,organization_id,deal_profile_id,stage,entered_at,owner_id,created_at");
  const djRows = (djs ?? []) as {
    id: string; organization_id: string; deal_profile_id: string; stage: string;
    entered_at: string | null; owner_id: string | null; created_at: string;
  }[];
  sourceRows["deal_journeys"] = djRows.length;

  if (djRows.length) {
    const profileIds = [...new Set(djRows.map((r) => r.deal_profile_id))];
    const { data: profs } = await db
      .from("deal_profiles").select("id,organization_id,deal_id,deal_stage,updated_at").in("id", profileIds);
    const profById = new Map<string, { id: string; organization_id: string; deal_id: string | null; deal_stage: string | null; updated_at: string | null }>(
      ((profs ?? []) as { id: string; organization_id: string; deal_id: string | null; deal_stage: string | null; updated_at: string | null }[]).map((p) => [p.id, p]),
    );
    // Keep only the LATEST deal_journeys row per profile — the earlier ones are
    // history, and we do not fabricate a ladder from them (Part 7).
    const latestByProfile = new Map<string, typeof djRows[number]>();
    for (const r of djRows) {
      const prev = latestByProfile.get(r.deal_profile_id);
      const t = new Date(r.entered_at ?? r.created_at).getTime();
      if (!prev || t >= new Date(prev.entered_at ?? prev.created_at).getTime()) latestByProfile.set(r.deal_profile_id, r);
    }

    for (const r of latestByProfile.values()) {
      const prof = profById.get(r.deal_profile_id);
      if (!prof) {
        missingEntities.push({ source: "deal_journeys", rowId: r.id, detail: `deal_profile ${r.deal_profile_id} not found` });
        continue;
      }
      if (!prof.deal_id) {
        // The dual identity, unresolvable: this profile has NO canonical deal.
        // We refuse to key a journey on a profile id — reported, not guessed.
        conflicting.push({
          source: "deal_journeys", rowId: r.id,
          detail: `deal_profile ${prof.id} has deal_id NULL — no canonical public.deals row to anchor the journey on`,
        });
        continue;
      }
      const legacy = resolveLegacyStage("deal", "deal_stage", r.stage);
      const entity = resolveLegacyStage("deal", "deal_stage", prof.deal_stage);
      if (legacy.quality === "unmappable") {
        unmappable.push({ source: "deal_journeys", rowId: r.id, detail: `deal stage '${legacy.legacy}' has no canonical peer` });
      }
      candidates.push({
        orgId: r.organization_id,
        journeyType: "deal",
        entityType: "deal",
        entityId: prof.deal_id,                 // ← canonical deals.id, ALWAYS
        sourceTable: "deal_journeys",
        sourceRowId: r.id,
        legacyStage: legacy,
        entityStage: entity,
        legacyUpdatedAt: r.entered_at ?? r.created_at,
        entityUpdatedAt: prof.updated_at,
        startedAt: r.created_at,
        ownerUserId: r.owner_id,
        anomaly: prof.organization_id !== r.organization_id ? "cross_org" : undefined,
      });
    }
  }

  // ── Duplicate candidates: two source rows aiming at the same canonical journey.
  const seen = new Map<string, number>();
  for (const c of candidates) {
    const k = `${c.orgId}|${c.journeyType}|${c.entityType}|${c.entityId}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const duplicateCandidates = [...seen.values()].filter((n) => n > 1).length;

  // ── Existing canonical journeys ───────────────────────────────────────────
  const { count: before } = await db.from("journeys").select("id", { count: "exact", head: true });

  const decisions: BackfillDecision[] = [];
  for (const c of candidates) {
    const existing = c.anomaly ? null : await findJourney(db, c.orgId, c.journeyType, c.entityType, c.entityId);
    decisions.push(planBackfill(c, existing));
  }

  // ── PART 8: journey_notes. The live schema keys notes by (entity_type, entity_id),
  //    NOT by journey_id — so a note can never be orphaned by this migration. We
  //    still count any note whose entity has no canonical journey, honestly.
  const { data: notes } = await db.from("journey_notes").select("id,org_id,entity_type,entity_id");
  const noteRows = (notes ?? []) as { id: string; org_id: string; entity_type: string; entity_id: string }[];
  sourceRows["journey_notes"] = noteRows.length;
  let notesUnresolved = 0;
  for (const n of noteRows) {
    const { count } = await db.from("journeys").select("id", { count: "exact", head: true })
      .eq("org_id", n.org_id).eq("entity_type", n.entity_type).eq("entity_id", n.entity_id);
    if (!count) notesUnresolved++;
  }

  const { count: stagesCount } = await db.from("journey_stages").select("id", { count: "exact", head: true });
  sourceRows["journey_stages"] = stagesCount ?? 0;

  return {
    scannedAt: new Date().toISOString(),
    sourceRows,
    canonicalJourneysBefore: before ?? 0,
    candidates: candidates.length,
    duplicateCandidates,
    unmappable,
    missingEntities,
    crossOrgAnomalies: crossOrg,
    conflictingStages: conflicting,
    legacyNewerThanCanonical: legacyNewer,
    canonicalNewerThanLegacy: canonicalNewer,
    notesWithUnresolvedJourney: notesUnresolved,
    plan: summarize(decisions),
    decisions,
  };
}

// ── PART 4 — APPLY THE PLAN (idempotent) ────────────────────────────────────
export interface BackfillResult extends BackfillTotals {
  journeyEventsCreated: number;
  duplicateEventsSkipped: number;
  failures: { source: string; rowId: string; error: string }[];
  conflicts: number;
  conflictDetail: { source: string; rowId: string; reason: string; detail: string }[];
}

export async function runJourneyBackfill(db: Db, dryRun = false): Promise<{ diagnostics: JourneyDiagnostics; result: BackfillResult }> {
  const diagnostics = await diagnoseJourneyBackfill(db);
  const result: BackfillResult = {
    candidates: diagnostics.candidates, created: 0, advanced: 0, unchanged: 0, skipped: 0, conflicts: 0,
    journeyEventsCreated: 0, duplicateEventsSkipped: 0, failures: [], conflictDetail: [],
  };

  for (const d of diagnostics.decisions) {
    const c = d.candidate;
    const a = d.action;

    if (a.kind === "conflict") {
      result.conflicts++;
      result.conflictDetail.push({ source: c.sourceTable, rowId: c.sourceRowId, reason: a.reason, detail: a.detail });
      continue;
    }
    if (a.kind === "skip") { result.skipped++; continue; }
    if (a.kind === "unchanged") { result.unchanged++; continue; }
    if (dryRun) { if (a.kind === "create") result.created++; else result.advanced++; continue; }

    if (a.kind === "create") {
      const open = await openCanonicalJourney(db, {
        orgId: c.orgId,
        journeyType: c.journeyType,
        entityType: c.entityType,
        entityId: c.entityId,
        requestedLegacyStage: a.stage,     // already canonical; validated again inside
        ownerUserId: c.ownerUserId,
        source: "legacy_backfill",
        actorUserId: null,                 // unknown actor → NULL, never faked
      });
      if (!open.ok) {
        result.failures.push({ source: c.sourceTable, rowId: c.sourceRowId, error: open.error });
        continue;
      }
      if (!open.created) { result.unchanged++; continue; }   // kernel won the race
      result.created++;
      result.journeyEventsCreated++;
      // Enrich the opening row with the legacy provenance (Part 7).
      await db.from("journeys").update({
        metadata: { openedBy: "legacy_backfill", ...d.evidence, mappingQuality: a.quality },
      }).eq("id", open.id).eq("org_id", c.orgId);
      continue;
    }

    // a.kind === "advance"
    const t = buildTransition(c.journeyType, a.from, a.to, {
      reason: a.reason,
      evidence: { ...d.evidence, mappingQuality: a.quality },
    });
    if (!t) {
      result.failures.push({ source: c.sourceTable, rowId: c.sourceRowId, error: `machine rejected ${a.from} → ${a.to}` });
      continue;
    }

    // History first — the unique index is the replay guard, exactly as in the kernel.
    const { error: hErr } = await db.from("journey_events").insert({
      org_id: c.orgId,
      journey_id: a.journeyId,
      entity_type: c.entityType,
      entity_id: c.entityId,
      event_type: "stage_change",
      from_stage: a.from,
      to_stage: a.to,
      title: `מעבר שלב (השלמה מהעבר): ${a.from} → ${a.to}`,
      occurred_at: c.legacyUpdatedAt ?? c.entityUpdatedAt ?? new Date().toISOString(),
      actor_user_id: null,                 // unknown → NULL, never faked
      reason: a.reason,
      evidence: { ...d.evidence, source: "legacy_backfill", mappingQuality: a.quality },
    });
    if (hErr) {
      if (isDuplicate(hErr)) { result.duplicateEventsSkipped++; result.unchanged++; continue; }
      result.failures.push({ source: c.sourceTable, rowId: c.sourceRowId, error: hErr.message });
      continue;
    }
    result.journeyEventsCreated++;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      current_stage: t.toStage, status: t.status,
      stage_entered_at: now, last_activity_at: now, updated_at: now,
    };
    if (t.timestampField) patch[t.timestampField] = now;

    const { data: moved, error: uErr } = await db
      .from("journeys").update(patch)
      .eq("id", a.journeyId).eq("org_id", c.orgId)
      .eq("current_stage", a.from)          // ← same stale guard the kernel uses
      .select("id");
    if (uErr) { result.failures.push({ source: c.sourceTable, rowId: c.sourceRowId, error: uErr.message }); continue; }
    if (!moved || (moved as unknown[]).length === 0) { result.unchanged++; continue; }
    result.advanced++;
  }

  return { diagnostics, result };
}

// ── Session-scoped entry points (RLS-respecting) ─────────────────────────────
async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id as string };
}

/** Manager-facing read-only diagnostics, through RLS. */
export async function getJourneyBackfillDiagnostics(): Promise<JourneyDiagnostics> {
  await ctx();
  const db = await createClient();
  return diagnoseJourneyBackfill(db);
}

/** Guarded backfill for the CURRENT org, through RLS (never a global sweep from the UI). */
export async function backfillMyOrgJourneys(dryRun = false): Promise<{ diagnostics: JourneyDiagnostics; result: BackfillResult }> {
  await ctx();
  const db = await createClient();
  return runJourneyBackfill(db, dryRun);
}

/** All-orgs sweep — service role, for the one-time migration run. */
export async function backfillAllOrgsJourneys(dryRun = false): Promise<{ diagnostics: JourneyDiagnostics; result: BackfillResult }> {
  const db = createServiceRoleClient();
  return runJourneyBackfill(db, dryRun);
}

/**
 * PART 2 — the compatibility primitive journey-intelligence now calls.
 * Session-scoped so RLS applies exactly as it did before.
 */
export async function ensureCanonicalJourneyForSession(
  entityType: string,
  entityId: string,
  journeyType?: string,
  requestedLegacyStage?: string | null,
): Promise<OpenJourneyResult> {
  const { orgId, userId } = await ctx();
  const jt = (journeyType ?? (entityType === "seller" ? "seller" : entityType === "lead" ? "lead" : entityType === "property" ? "property" : entityType === "deal" ? "deal" : "buyer")) as JourneyType;
  if (!isValidStage(jt, machineFor(jt).initial)) return { ok: false, error: `unknown journey type '${jt}'` };
  const db = await createClient();
  return openCanonicalJourney(db, {
    orgId, journeyType: jt, entityType, entityId,
    requestedLegacyStage: requestedLegacyStage ?? null,
    ownerUserId: userId, actorUserId: userId,
    source: "compat",
  });
}
