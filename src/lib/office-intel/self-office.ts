// ============================================================================
// ZONO — SELF OFFICE resolution (server-only, READ-ONLY except explicit claim).
//
// Answers "which observed office is MINE" for the signed-in user, IDENTITY-FIRST
// and NEVER name-only. Resolution order, strongest first:
//   0. an explicit CONFIRMED claim  (office_self_claims)          → resolved
//   1. canonical broker by phone/email → current membership       → resolved
//   2. brokerage agent by normalized phone (primary/whatsapp)      → resolved
//   3. office by primary phone / owner-manager phone / email       → resolved
//   4. agent/office by email                                       → resolved
//   5. name + city match only                                     → needs_confirmation
//   else                                                          → unresolved
//
// Any office the user has REJECTED (negative evidence) is excluded from every
// path except an explicit re-confirm. A name-only signal never auto-resolves — it
// only ever produces a candidate the user must confirm. This is what stops "my
// office" from ever being guessed from a shared brand name.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizePhoneIL, normalizeEmailAddr } from "@/lib/util/identity";
import { normalizeHebrewName } from "@/lib/broker/engine";
import { localityHe } from "@/lib/geo/locality";

/* eslint-disable @typescript-eslint/no-explicit-any -- brokerage_* + canonical_* live outside generated types; loose shape matches the other office-intel selectors. */

export type SelfOfficeStatus = "resolved" | "needs_confirmation" | "unresolved";
export type SelfOfficeVia = "claim" | "canonical_phone" | "canonical_email" | "agent_phone" | "office_phone" | "office_email" | "agent_email" | "name_city" | "none";

export interface SelfOfficeCandidate { officeId: string; name: string; brand: string | null; city: string | null; reason: string; via: SelfOfficeVia }
export interface SelfOfficeResolution {
  status: SelfOfficeStatus;
  officeId: string | null;
  officeName: string | null;
  confidence: "verified" | "high" | "medium" | null;
  via: SelfOfficeVia;
  candidates: SelfOfficeCandidate[];
  userId: string | null;
}

interface Ident { userId: string | null; orgId: string | null; phone: string; email: string; name: string; city: string }

async function currentIdentity(): Promise<Ident> {
  const db = createServiceRoleClient();
  let userId: string | null = null, orgId: string | null = null;
  try { const ctx = await getSessionContext(); userId = (ctx as any)?.userId ?? (ctx as any)?.user?.id ?? null; orgId = ctx.profile?.org_id ?? null; } catch { /* ignore */ }
  let phone = "", email = "", name = "", city = "";
  if (userId) {
    const { data } = await (db.from("users" as never).select("full_name,email,phone,operating_city,primary_city,org_id").eq("id", userId).maybeSingle() as any);
    if (data) {
      phone = normalizePhoneIL(data.phone); email = normalizeEmailAddr(data.email);
      name = normalizeHebrewName(String(data.full_name ?? "")); city = String(data.operating_city ?? data.primary_city ?? "").trim();
      orgId = orgId ?? (data.org_id ? String(data.org_id) : null);
    }
  }
  return { userId, orgId, phone, email, name, city };
}

const rowOffice = (r: any): SelfOfficeCandidate => ({ officeId: String(r.id), name: String(r.name ?? "").trim() || "משרד", brand: (r.brand_network as string) ?? null, city: localityHe(String(r.city ?? "")) || null, reason: "", via: "none" });

async function officeById(db: any, officeId: string): Promise<SelfOfficeCandidate | null> {
  const { data } = await (db.from("brokerage_offices" as never).select("id,name,brand_network,city").eq("id", officeId).maybeSingle() as any);
  return data ? rowOffice(data) : null;
}

export async function resolveSelfOffice(): Promise<SelfOfficeResolution> {
  const db = createServiceRoleClient();
  const me = await currentIdentity();
  const empty: SelfOfficeResolution = { status: "unresolved", officeId: null, officeName: null, confidence: null, via: "none", candidates: [], userId: me.userId };
  if (!me.userId) return empty;

  // Negative evidence + explicit confirm.
  const { data: claims } = await (db.from("office_self_claims" as never).select("office_id,decision").eq("user_id", me.userId) as any);
  const rejected = new Set<string>((claims ?? []).filter((c: any) => c.decision === "rejected").map((c: any) => String(c.office_id)));
  const confirmed = (claims ?? []).find((c: any) => c.decision === "confirmed");
  if (confirmed) {
    const off = await officeById(db, String(confirmed.office_id));
    if (off) return { status: "resolved", officeId: off.officeId, officeName: off.name, confidence: "verified", via: "claim", candidates: [], userId: me.userId };
  }

  const resolve = (off: SelfOfficeCandidate, via: SelfOfficeVia, confidence: "high" | "medium"): SelfOfficeResolution =>
    ({ status: "resolved", officeId: off.officeId, officeName: off.name, confidence, via, candidates: [], userId: me.userId });

  // 1. Canonical broker by phone/email → current membership → office.
  if (me.phone || me.email) {
    const or: string[] = [];
    if (me.phone) or.push(`normalized_phone.eq.${me.phone}`);
    if (me.email) or.push(`normalized_email.eq.${me.email}`);
    const { data: cbs } = await (db.from("canonical_brokers" as never).select("id,normalized_phone,normalized_email").or(or.join(",")).limit(5) as any);
    for (const cb of cbs ?? []) {
      const { data: mem } = await (db.from("broker_office_memberships" as never).select("office_id,is_current").eq("canonical_broker_id", String(cb.id)).eq("is_current", "true").limit(3) as any);
      for (const m of mem ?? []) {
        const oid = String(m.office_id); if (rejected.has(oid)) continue;
        const off = await officeById(db, oid);
        if (off) return resolve(off, me.phone && cb.normalized_phone === me.phone ? "canonical_phone" : "canonical_email", "high");
      }
    }
  }

  // 2. Brokerage agent by normalized phone (primary or whatsapp).
  if (me.phone) {
    const { data: agents } = await (db.from("brokerage_agents" as never).select("office_id,primary_phone,whatsapp_phone").not("office_id", "is", null).limit(20000) as any);
    const hit = (agents ?? []).find((a: any) => (normalizePhoneIL(a.primary_phone) === me.phone || normalizePhoneIL(a.whatsapp_phone) === me.phone) && !rejected.has(String(a.office_id)));
    if (hit) { const off = await officeById(db, String(hit.office_id)); if (off) return resolve(off, "agent_phone", "high"); }
  }

  // 3. Office by phone (primary) / email.
  if (me.phone || me.email) {
    const { data: offices } = await (db.from("brokerage_offices" as never).select("id,name,brand_network,city,primary_phone,primary_email").limit(20000) as any);
    const byPhone = me.phone ? (offices ?? []).find((o: any) => normalizePhoneIL(o.primary_phone) === me.phone && !rejected.has(String(o.id))) : null;
    if (byPhone) return resolve(rowOffice(byPhone), "office_phone", "high");
    const byEmail = me.email ? (offices ?? []).find((o: any) => normalizeEmailAddr(o.primary_email) === me.email && !rejected.has(String(o.id))) : null;
    if (byEmail) return resolve(rowOffice(byEmail), "office_email", "high");
  }

  // 4. Agent by email → office.
  if (me.email) {
    const { data: agents } = await (db.from("brokerage_agents" as never).select("office_id,primary_email").not("office_id", "is", null).limit(20000) as any);
    const hit = (agents ?? []).find((a: any) => normalizeEmailAddr(a.primary_email) === me.email && !rejected.has(String(a.office_id)));
    if (hit) { const off = await officeById(db, String(hit.office_id)); if (off) return resolve(off, "agent_email", "medium"); }
  }

  // 5. Name + city → CANDIDATES ONLY (never auto-resolve name-only).
  const candidates: SelfOfficeCandidate[] = [];
  if (me.name) {
    const { data: offices } = await (db.from("brokerage_offices" as never).select("id,name,brand_network,city,owner_name,manager_name,normalized_name").limit(20000) as any);
    for (const o of offices ?? []) {
      const oid = String(o.id); if (rejected.has(oid)) continue;
      const on = normalizeHebrewName(String(o.owner_name ?? "")); const mn = normalizeHebrewName(String(o.manager_name ?? ""));
      const nameHit = (on && on === me.name) || (mn && mn === me.name);
      const cityHit = me.city && String(o.city ?? "").trim() && localityHe(String(o.city)).includes(localityHe(me.city));
      if (nameHit) { const c = rowOffice(o); c.reason = `בעל/מנהל המשרד: ${o.owner_name || o.manager_name}`; c.via = "name_city"; candidates.push(c); }
      else if (cityHit && me.name && normalizeHebrewName(String(o.name ?? "")).includes(me.name)) { const c = rowOffice(o); c.reason = "התאמת שם ועיר"; c.via = "name_city"; candidates.push(c); }
      if (candidates.length >= 5) break;
    }
  }
  if (candidates.length) return { status: "needs_confirmation", officeId: null, officeName: null, confidence: null, via: "name_city", candidates, userId: me.userId };
  return empty;
}

// ── Claim writes (explicit user action only) ─────────────────────────────────

export async function confirmSelfOffice(officeId: string, evidence: Record<string, unknown> = {}): Promise<{ ok: boolean }> {
  const me = await currentIdentity();
  if (!me.userId || !officeId) return { ok: false };
  const db = createServiceRoleClient();
  await (db.from("office_self_claims" as never).upsert({ user_id: me.userId, org_id: me.orgId, office_id: officeId, decision: "confirmed", confidence: "verified", evidence, updated_at: new Date().toISOString() } as never, { onConflict: "user_id,office_id" } as never) as any);
  return { ok: true };
}

export async function rejectSelfOffice(officeId: string): Promise<{ ok: boolean }> {
  const me = await currentIdentity();
  if (!me.userId || !officeId) return { ok: false };
  const db = createServiceRoleClient();
  await (db.from("office_self_claims" as never).upsert({ user_id: me.userId, org_id: me.orgId, office_id: officeId, decision: "rejected", updated_at: new Date().toISOString() } as never, { onConflict: "user_id,office_id" } as never) as any);
  return { ok: true };
}
