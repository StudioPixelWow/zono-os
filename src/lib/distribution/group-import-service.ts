// ============================================================================
// ZONO — Facebook Groups: import the CONNECTED USER's groups (server-only).
// ----------------------------------------------------------------------------
// The browser extension (already paired to org+user, see extension-service.ts)
// reports the groups the signed-in user is a MEMBER of. We upsert them into the
// canonical distribution_groups registry keyed on (org_id, external_group_id),
// classify them with the SAME engine the intelligence layer uses, attribute them
// to the org + importing user, and record an append-only audit event per change.
//
// This does NOT create a parallel publishing model: imported groups are ordinary
// distribution_groups rows and flow through the canonical path
// (campaigns → posts → jobs → events). We never receive FB credentials/cookies —
// only the group metadata the user themselves can see, on their explicit import.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { getSessionContext } from "@/lib/auth/session";
import { classifyGroup } from "./groups-engine";
import type { AuthedInstance } from "./extension-service";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GROUPS = "distribution_groups";
const INSTANCES = "facebook_extension_instances";
const AUDIT = "distribution_group_sync_events";
const LOG = "[fb-group-import]";

/** One group as reported by the extension from the user's own Facebook session. */
export interface ScannedGroup {
  externalGroupId: string;                 // Facebook group id (stable key)
  name: string;
  url?: string | null;
  membersCount?: number | null;
  privacyLevel?: string | null;            // public | private | closed
  memberRole?: string | null;              // member | admin | moderator
  isMember?: boolean | null;
}

export interface ImportResult {
  ok: boolean;
  imported: number;   // new groups created
  updated: number;    // existing groups refreshed
  skipped: number;    // invalid rows ignored
  total: number;      // valid rows received
  error?: string;
}

const normUrl = (u?: string | null): string | null => {
  if (!u) return null;
  const t = u.trim();
  return t ? t.replace(/\/+$/, "") : null;
};

async function audit(db: any, e: {
  orgId: string; userId: string | null; instanceId: string | null; action: string;
  externalGroupId?: string | null; groupId?: string | null; details?: Record<string, unknown>;
}): Promise<void> {
  await db.from(AUDIT).insert({
    org_id: e.orgId, user_id: e.userId, instance_id: e.instanceId, action: e.action,
    external_group_id: e.externalGroupId ?? null, group_id: e.groupId ?? null, details: e.details ?? {},
  }).then((r: { error?: { message?: string } | null }) => {
    if (r.error) console.error(`${LOG} audit(${e.action}) failed: ${r.error.message}`);
  });
}

/**
 * Upsert the user's scanned groups into distribution_groups (idempotent on
 * external_group_id). Attributes each to the org + importing user, classifies it,
 * and writes an append-only audit event. Re-scans update stats, never duplicate.
 */
export async function importScannedGroups(inst: AuthedInstance, groups: ScannedGroup[]): Promise<ImportResult> {
  if (!isServiceRoleConfigured()) return { ok: false, imported: 0, updated: 0, skipped: 0, total: 0, error: "service unavailable" };
  const db: any = createServiceRoleClient();
  const now = new Date().toISOString();

  const valid = (Array.isArray(groups) ? groups : []).filter(
    (g) => g && typeof g.externalGroupId === "string" && g.externalGroupId.trim() && typeof g.name === "string" && g.name.trim(),
  );
  await audit(db, { orgId: inst.orgId, userId: inst.userId, instanceId: inst.id, action: "scan_started", details: { received: groups?.length ?? 0, valid: valid.length } });

  let imported = 0, updated = 0;
  const skipped = (groups?.length ?? 0) - valid.length;

  for (const g of valid) {
    const cls = classifyGroup(g.name, null, null); // region derived from the group name
    // Does this group already exist for the org (by external id)?
    const { data: existing } = await db.from(GROUPS)
      .select("id,source,members_count,privacy_level,name")
      .eq("org_id", inst.orgId).eq("external_group_id", g.externalGroupId).maybeSingle();
    const cur = existing as { id: string; source: string | null } | null;

    if (cur) {
      // Refresh membership + stats; keep manual edits to name/category intact where set.
      await db.from(GROUPS).update({
        members_count: g.membersCount ?? undefined,
        privacy_level: g.privacyLevel ?? undefined,
        group_url: normUrl(g.url) ?? undefined,
        is_member: g.isMember ?? true,
        member_role: g.memberRole ?? undefined,
        last_synced_at: now,
        // Mark provenance as scan only if it was never explicitly manual.
        source: cur.source === "manual" ? cur.source : "scan",
      }).eq("id", cur.id).eq("org_id", inst.orgId);
      updated++;
      await audit(db, { orgId: inst.orgId, userId: inst.userId, instanceId: inst.id, action: "group_updated", externalGroupId: g.externalGroupId, groupId: cur.id, details: { members: g.membersCount ?? null } });
      continue;
    }

    // New group → insert (idempotent under uq_dgroups_org_external).
    const { data: ins, error } = await db.from(GROUPS).insert({
      org_id: inst.orgId, name: g.name.trim(), platform: "facebook",
      external_group_id: g.externalGroupId, group_url: normUrl(g.url),
      members_count: g.membersCount ?? 0, privacy_level: g.privacyLevel ?? "public",
      category: cls.category, region: cls.region, property_types: cls.propertyTypes, language: "he",
      status: "active", classification_source: "auto",
      source: "scan", is_member: g.isMember ?? true, member_role: g.memberRole ?? null,
      imported_by: inst.userId, imported_at: now, last_synced_at: now, created_by: inst.userId,
    }).select("id").maybeSingle();

    if (error) {
      // Lost a race to a concurrent scan → the unique index means it now exists; count as update.
      if (/duplicate key|23505/i.test(error.message)) { updated++; continue; }
      console.error(`${LOG} insert failed for ${g.externalGroupId}: ${error.message}`);
      continue;
    }
    const newId = (ins as { id: string } | null)?.id ?? null;
    imported++;
    await audit(db, { orgId: inst.orgId, userId: inst.userId, instanceId: inst.id, action: "group_imported", externalGroupId: g.externalGroupId, groupId: newId, details: { members: g.membersCount ?? null } });
  }

  // Stamp scan stats on the instance + clear any pending request.
  const { data: prev } = await db.from(INSTANCES).select("groups_imported").eq("id", inst.id).maybeSingle();
  const prevCount = Number((prev as { groups_imported?: number } | null)?.groups_imported ?? 0);
  await db.from(INSTANCES).update({
    last_scan_at: now, scan_requested_at: null, groups_imported: prevCount + imported,
    capabilities: { group_read: true },
  }).eq("id", inst.id);

  return { ok: true, imported, updated, skipped, total: valid.length };
}

// ── Pull-model scan request (ZONO UI asks → extension reads on heartbeat) ─────
/** True if the ZONO UI has requested a group scan that the extension hasn't run yet. */
export async function getPendingScan(inst: AuthedInstance): Promise<boolean> {
  const db: any = createServiceRoleClient();
  const { data } = await db.from(INSTANCES).select("scan_requested_at").eq("id", inst.id).maybeSingle();
  return Boolean((data as { scan_requested_at?: string | null } | null)?.scan_requested_at);
}

// ── User-scoped surfaces for the ZONO UI ─────────────────────────────────────
type Ctx = { orgId: string; userId: string | null };
async function ctx(): Promise<Ctx | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { orgId: profile.org_id, userId: profile.id ?? null };
}

export interface GroupConnectionOverview {
  ready: boolean;
  connected: boolean;                 // a live (non-revoked) instance exists
  status: string | null;              // installed | ready | ...
  facebookProfileName: string | null;
  scanRequested: boolean;
  lastScanAt: string | null;
  groupsImported: number;             // groups with source in (scan, import) for the org
  lastSeenAt: string | null;
}

/** Connection + import snapshot for the signed-in user's org. */
export async function getGroupConnectionOverview(): Promise<GroupConnectionOverview> {
  const c = await ctx();
  const empty: GroupConnectionOverview = { ready: false, connected: false, status: null, facebookProfileName: null, scanRequested: false, lastScanAt: null, groupsImported: 0, lastSeenAt: null };
  if (!c) return empty;
  const db: any = createServiceRoleClient();
  const { data: inst } = await db.from(INSTANCES)
    .select("status,metadata,scan_requested_at,last_scan_at,last_seen_at")
    .eq("org_id", c.orgId).neq("status", "revoked")
    .order("last_seen_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const i = inst as { status?: string; metadata?: Record<string, unknown>; scan_requested_at?: string | null; last_scan_at?: string | null; last_seen_at?: string | null } | null;
  const { count } = await db.from(GROUPS).select("id", { count: "exact", head: true })
    .eq("org_id", c.orgId).in("source", ["scan", "import"]);
  return {
    ready: true,
    connected: Boolean(i),
    status: i?.status ?? null,
    facebookProfileName: (i?.metadata?.facebook_profile_name as string) ?? null,
    scanRequested: Boolean(i?.scan_requested_at),
    lastScanAt: i?.last_scan_at ?? null,
    groupsImported: count ?? 0,
    lastSeenAt: i?.last_seen_at ?? null,
  };
}

export interface SyncEventView { id: string; action: string; externalGroupId: string | null; groupId: string | null; details: Record<string, unknown>; occurredAt: string }

/** Recent append-only import/sync audit for the org (Connection panel). */
export async function listGroupSyncEvents(limit = 30): Promise<SyncEventView[]> {
  const c = await ctx(); if (!c) return [];
  const db: any = createServiceRoleClient();
  const { data } = await db.from(AUDIT)
    .select("id,action,external_group_id,group_id,details,occurred_at")
    .eq("org_id", c.orgId).order("occurred_at", { ascending: false }).limit(limit);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, action: r.action, externalGroupId: r.external_group_id ?? null,
    groupId: r.group_id ?? null, details: r.details ?? {}, occurredAt: r.occurred_at,
  }));
}

export interface ActionResult { ok: boolean; error?: string }

/** Request a group scan: the extension picks it up on its next heartbeat and imports. */
export async function requestGroupScan(): Promise<ActionResult> {
  const c = await ctx(); if (!c?.userId) return { ok: false, error: "unauthorized" };
  const db: any = createServiceRoleClient();
  const { data: inst } = await db.from(INSTANCES)
    .select("id,instance_id").eq("org_id", c.orgId).neq("status", "revoked")
    .order("last_seen_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const i = inst as { id: string; instance_id: string } | null;
  if (!i) return { ok: false, error: "no_extension" }; // honest: nothing to scan with
  await db.from(INSTANCES).update({ scan_requested_at: new Date().toISOString() }).eq("id", i.id);
  await audit(db, { orgId: c.orgId, userId: c.userId, instanceId: i.instance_id, action: "scan_requested" });
  return { ok: true };
}
