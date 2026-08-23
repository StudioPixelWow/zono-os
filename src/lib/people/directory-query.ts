// ============================================================================
// ZONO — People directory · SERVER-PAGINATED query (real data only).
// ----------------------------------------------------------------------------
// The old /people shipped up to ~1,200 rows to the client and capped at 300.
// This replaces that: a bounded column set is fetched per role table, unified
// into ONE person per human (dedup by normalized phone, else email — the same
// identity rule the Person workspace uses), then KPIs / attention / search /
// role & attention filters / sort / TRUE offset pagination are all computed
// SERVER-SIDE. Only one hydrated page (with resolved agent names) reaches the
// client. Org-isolated via RLS (cookie server client). No fabricated values.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normPhone, normEmail } from "./identity";
import type {
  PersonRole, PeopleSortKey, PersonTarget, PersonAttention, PersonDirectoryRow, PersonKpi,
  PeopleDirectoryParams, PeopleDirectoryPage,
} from "./directory";

const TABLES: Record<PersonRole, string> = { buyer: "buyers", seller: "sellers", lead: "leads" };

const STALE_DAYS = 30;
const STALE_MS = STALE_DAYS * 86_400_000;

// Bounded scope columns (never SELECT *). Shared prefix + role-specific activity.
const BASE_COLS = "id,owner_id,full_name,phone,email,created_at,updated_at";
const ROLE_COLS: Record<PersonRole, string> = {
  buyer: `${BASE_COLS},temperature,last_contacted_at`,
  seller: `${BASE_COLS},has_signed_agreement`,
  lead: `${BASE_COLS},stage,last_activity_at`,
};

interface ScopeRow {
  id: string; owner_id: string | null; full_name: string | null; phone: string | null; email: string | null;
  created_at: string | null; updated_at: string | null;
  temperature?: string | null; last_contacted_at?: string | null; has_signed_agreement?: boolean | null;
  stage?: string | null; last_activity_at?: string | null;
}

// ----- internal aggregate (pre-hydration) --------------------------------
interface Agg {
  key: string; name: string; phone: string | null; email: string | null;
  roles: Set<PersonRole>; targets: PersonTarget[]; owners: Set<string>;
  lastActivityMs: number; createdMs: number;
  leadStage: string | null; buyerTemperature: string | null; sellerSigned: boolean;
}

const ms = (iso: string | null | undefined): number => { if (!iso) return 0; const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };

function attentionFor(a: Agg, nowMs: number): PersonAttention | null {
  if (!a.phone && !a.email) return { key: "uncontactable", label: "ללא פרטי קשר", tone: "danger" };
  if (a.owners.size === 0) return { key: "unassigned", label: "לא משויך", tone: "warning" };
  const last = a.lastActivityMs || a.createdMs;
  if (last && nowMs - last > STALE_MS) return { key: "stale", label: `ללא פעילות ${STALE_DAYS}+ ימים`, tone: "neutral" };
  return null;
}

/**
 * Server-paginated people directory. Fetches a bounded column set per role for
 * the org, unifies into people, then filters/sorts/paginates server-side and
 * hydrates ONLY the requested page with agent display names.
 */
export async function queryPeopleDirectory(params: PeopleDirectoryParams): Promise<PeopleDirectoryPage> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const orgId = profile.org_id;
  const supabase = await createClient();
  const nowMs = Date.now();

  // 1) Bounded scope fetch per role (org-scoped; RLS also enforces).
  const roleRows = await Promise.all(
    (["buyer", "seller", "lead"] as PersonRole[]).map(async (role) => {
      const { data } = await supabase.from(TABLES[role] as never).select(ROLE_COLS[role]).eq("org_id", orgId).order("updated_at", { ascending: false }).limit(2000);
      return { role, rows: ((data ?? []) as unknown as ScopeRow[]) };
    }),
  );

  // 2) Unify into people (dedup by normPhone → normEmail → role:id).
  const byKey = new Map<string, Agg>();
  for (const { role, rows } of roleRows) {
    for (const row of rows) {
      const key = normPhone(row.phone) ?? normEmail(row.email) ?? `${role}:${row.id}`;
      let a = byKey.get(key);
      if (!a) {
        a = { key, name: "", phone: null, email: null, roles: new Set(), targets: [], owners: new Set(), lastActivityMs: 0, createdMs: 0, leadStage: null, buyerTemperature: null, sellerSigned: false };
        byKey.set(key, a);
      }
      a.roles.add(role);
      a.targets.push({ type: role, id: row.id });
      if (row.owner_id) a.owners.add(row.owner_id);
      if (!a.name && row.full_name) a.name = row.full_name;
      if (!a.phone && row.phone) a.phone = row.phone;
      if (!a.email && row.email) a.email = row.email;
      const activity = Math.max(ms(row.last_contacted_at), ms(row.last_activity_at), ms(row.updated_at), ms(row.created_at));
      if (activity > a.lastActivityMs) a.lastActivityMs = activity;
      const created = ms(row.created_at);
      if (created && (a.createdMs === 0 || created < a.createdMs)) a.createdMs = created;
      if (role === "lead" && row.stage) a.leadStage = row.stage;
      if (role === "buyer" && row.temperature) a.buyerTemperature = row.temperature;
      if (role === "seller" && row.has_signed_agreement) a.sellerSigned = true;
    }
  }
  const all = Array.from(byKey.values());
  for (const a of all) if (!a.name) a.name = "איש קשר";

  // 3) KPIs (real counts over the full unified set).
  const attByKey = new Map<string, PersonAttention | null>();
  for (const a of all) attByKey.set(a.key, attentionFor(a, nowMs));
  const count = (fn: (a: Agg) => boolean) => all.reduce((n, a) => n + (fn(a) ? 1 : 0), 0);
  const kpis: PersonKpi[] = [
    { key: "all", label: "כל האנשים", value: all.length, tone: "brand" },
    { key: "buyer", label: "קונים", value: count((a) => a.roles.has("buyer")), tone: "brand" },
    { key: "seller", label: "מוכרים", value: count((a) => a.roles.has("seller")), tone: "success" },
    { key: "lead", label: "לידים", value: count((a) => a.roles.has("lead")), tone: "warning" },
    { key: "multi", label: "רב-תפקיד", value: count((a) => a.roles.size > 1), tone: "accent" },
    { key: "unassigned", label: "לא משויכים", value: count((a) => attByKey.get(a.key)?.key === "unassigned"), tone: "warning" },
    { key: "stale", label: "ללא פעילות", value: count((a) => attByKey.get(a.key)?.key === "stale"), tone: "neutral" },
  ];

  // 4) Filters (search / role / attention).
  const qRaw = (params.q ?? "").trim().toLowerCase();
  const qDigits = qRaw.replace(/\D/g, "");
  const role = params.role ?? null;
  const attention = params.attention ?? null;
  const filtered = all.filter((a) => {
    if (qRaw) {
      const hitName = a.name.toLowerCase().includes(qRaw);
      const hitEmail = (a.email ?? "").toLowerCase().includes(qRaw);
      const hitPhone = qDigits.length > 0 && (a.phone ?? "").replace(/\D/g, "").includes(qDigits);
      if (!hitName && !hitEmail && !hitPhone) return false;
    }
    if (role === "multi") { if (a.roles.size <= 1) return false; }
    else if (role && !a.roles.has(role as PersonRole)) return false;
    const att = attByKey.get(a.key);
    if (attention === "any") { if (!att) return false; }
    else if (attention && att?.key !== attention) return false;
    return true;
  });

  // 5) Sort.
  const sort: PeopleSortKey = params.sort ?? "activity";
  filtered.sort((x, y) => {
    switch (sort) {
      case "name": return x.name.localeCompare(y.name, "he");
      case "created": return (y.createdMs || 0) - (x.createdMs || 0);
      case "roles": return y.roles.size - x.roles.size || (y.lastActivityMs - x.lastActivityMs);
      case "activity":
      default: return (y.lastActivityMs || y.createdMs) - (x.lastActivityMs || x.createdMs);
    }
  });

  // 6) True offset pagination.
  const total = filtered.length;
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 5), 100);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(params.page ?? 1, 1), pageCount);
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  // 7) Hydrate ONLY this page — resolve agent names for owners on the page.
  const ownerIds = new Set<string>();
  for (const a of slice) for (const o of a.owners) ownerIds.add(o);
  const nameByOwner = new Map<string, string>();
  if (ownerIds.size) {
    try {
      const { data } = await supabase.from("users").select("id,full_name").eq("org_id", orgId).in("id", Array.from(ownerIds));
      for (const u of (data ?? []) as { id: string; full_name: string | null }[]) nameByOwner.set(u.id, u.full_name || "סוכן");
    } catch { /* names best-effort */ }
  }

  const rows: PersonDirectoryRow[] = slice.map((a) => {
    const owners = Array.from(a.owners);
    const ownerId = owners.length === 1 ? owners[0] : null;
    const ownerMixed = owners.length > 1;
    return {
      key: a.key, name: a.name, phone: a.phone, email: a.email,
      roles: Array.from(a.roles), targets: a.targets,
      ownerId, ownerMixed, agentName: ownerId ? (nameByOwner.get(ownerId) ?? null) : null,
      lastActivity: a.lastActivityMs ? new Date(a.lastActivityMs).toISOString() : null,
      createdAt: a.createdMs ? new Date(a.createdMs).toISOString() : null,
      leadStage: a.leadStage, buyerTemperature: a.buyerTemperature, sellerSigned: a.sellerSigned,
      attention: attByKey.get(a.key) ?? null,
    };
  });

  // 8) One evidence-gated brief (real counts → deep link).
  const brief: { text: string; href: string }[] = [];
  const unassigned = kpis.find((k) => k.key === "unassigned")?.value ?? 0;
  const uncontactable = count((a) => attByKey.get(a.key)?.key === "uncontactable");
  const stale = kpis.find((k) => k.key === "stale")?.value ?? 0;
  if (uncontactable > 0) brief.push({ text: `${uncontactable} אנשים ללא טלפון ואימייל — לא ניתן ליצור קשר. השלם פרטים.`, href: "/people?attention=uncontactable" });
  else if (unassigned > 0) brief.push({ text: `${unassigned} אנשים עדיין לא משויכים לסוכן. שייך כדי שמישהו יטפל.`, href: "/people?attention=unassigned" });
  else if (stale > 0) brief.push({ text: `${stale} אנשים ללא פעילות מעל ${STALE_DAYS} ימים. אולי הגיע הזמן לחזור אליהם.`, href: "/people?attention=stale" });

  return { rows, total, page, pageSize, pageCount, kpis, brief };
}
