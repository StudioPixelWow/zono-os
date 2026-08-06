// ============================================================================
// ZONO — People (unified Person) · Service (server-only)
// ----------------------------------------------------------------------------
// A canonical Person workspace WITHOUT a second identity model. Buyers, sellers
// and leads remain the source-of-truth entities; a person is resolved at read
// time by matching contact (normalized phone, else email) across those tables,
// so one human with multiple roles is presented as ONE identity with a merged
// timeline and role links — never duplicated. Org-isolated.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { activityEventRepository } from "@/lib/activity/repository";
import { normPhone, normEmail } from "./identity";

export type PersonRole = "buyer" | "seller" | "lead";
const TABLES: Record<PersonRole, string> = { buyer: "buyers", seller: "sellers", lead: "leads" };
const ROLE_LABEL: Record<PersonRole, string> = { buyer: "קונה", seller: "מוכר", lead: "ליד" };
const ROLE_ROUTE: Record<PersonRole, string> = { buyer: "buyers", seller: "sellers", lead: "leads" };

export interface PersonRoleRef { type: PersonRole; id: string; label: string; route: string; stage: string | null; created_at: string | null }
export interface PersonTimelineItem { event_type: string; title: string | null; occurred_at: string; role: PersonRole }
export interface PersonProfile {
  name: string; phone: string | null; email: string | null; agentName: string | null;
  roles: PersonRoleRef[]; timeline: PersonTimelineItem[]; primary: { type: PersonRole; id: string };
}
export interface PersonListItem { key: string; name: string; phone: string | null; email: string | null; roles: PersonRole[]; primary: { type: PersonRole; id: string } }

interface ContactRow { id: string; full_name: string | null; phone: string | null; email: string | null; owner_id: string | null; created_at: string | null; stage?: string | null }
type DB = Awaited<ReturnType<typeof createClient>>;

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const supabase = await createClient();
  return { orgId: profile.org_id, supabase };
}

async function fetchRole(supabase: DB, orgId: string, role: PersonRole, limit = 300): Promise<ContactRow[]> {
  const { data } = await supabase.from(TABLES[role] as never).select("id,full_name,phone,email,owner_id,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as ContactRow[]);
}

/** Resolve the unified person that owns a given buyer/seller/lead record. */
export async function resolvePersonByEntity(type: PersonRole, id: string): Promise<PersonProfile | null> {
  if (!TABLES[type]) return null;
  const { orgId, supabase } = await ctx();
  const { data: seedData } = await supabase.from(TABLES[type] as never).select("id,full_name,phone,email,owner_id,created_at").eq("org_id", orgId).eq("id", id).maybeSingle();
  const seed = seedData as unknown as ContactRow | null;
  if (!seed) return null;

  const pk = normPhone(seed.phone);
  const ek = normEmail(seed.email);

  const roles: PersonRoleRef[] = [];
  const timeline: PersonTimelineItem[] = [];
  for (const role of ["buyer", "seller", "lead"] as PersonRole[]) {
    const rows = await fetchRole(supabase, orgId, role);
    for (const row of rows) {
      const match = (row.id === seed.id && role === type) || (pk && normPhone(row.phone) === pk) || (ek && normEmail(row.email) === ek);
      if (!match) continue;
      roles.push({ type: role, id: row.id, label: ROLE_LABEL[role], route: ROLE_ROUTE[role], stage: row.stage ?? null, created_at: row.created_at ?? null });
      try {
        const events = await activityEventRepository.listForEntity(role, row.id, 40);
        for (const e of events) timeline.push({ event_type: e.event_type, title: e.title ?? null, occurred_at: e.occurred_at, role });
      } catch { /* timeline best-effort */ }
    }
  }
  if (!roles.length) roles.push({ type, id: seed.id, label: ROLE_LABEL[type], route: ROLE_ROUTE[type], stage: null, created_at: seed.created_at ?? null });

  let agentName: string | null = null;
  if (seed.owner_id) {
    try { const { data } = await supabase.from("users").select("full_name").eq("org_id", orgId).eq("id", seed.owner_id).maybeSingle(); agentName = (data as { full_name?: string } | null)?.full_name ?? null; } catch { /* ignore */ }
  }
  timeline.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  return {
    name: seed.full_name || roles[0]?.label || "איש קשר", phone: seed.phone ?? null, email: seed.email ?? null, agentName,
    roles, timeline: timeline.slice(0, 60), primary: { type, id: seed.id },
  };
}

/** List distinct people (deduped by phone/email) across buyers/sellers/leads. */
export async function listPeople(): Promise<PersonListItem[]> {
  const { orgId, supabase } = await ctx();
  const [buyers, sellers, leads] = await Promise.all([
    fetchRole(supabase, orgId, "buyer", 400), fetchRole(supabase, orgId, "seller", 400), fetchRole(supabase, orgId, "lead", 400),
  ]);
  const byKey = new Map<string, PersonListItem>();
  const add = (role: PersonRole, rows: ContactRow[]) => {
    for (const row of rows) {
      const key = normPhone(row.phone) ?? normEmail(row.email) ?? `${role}:${row.id}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.roles.includes(role)) existing.roles.push(role);
        if (!existing.name && row.full_name) existing.name = row.full_name;
      } else {
        byKey.set(key, { key, name: row.full_name || "איש קשר", phone: row.phone ?? null, email: row.email ?? null, roles: [role], primary: { type: role, id: row.id } });
      }
    }
  };
  add("buyer", buyers); add("seller", sellers); add("lead", leads);
  return Array.from(byKey.values()).slice(0, 300);
}
