/**
 * Deal Execution service — server-only. Builds Deal Twins from active match
 * intelligence (without modifying Match/Forecast/Revenue), with journey,
 * negotiations, objections and tasks. Deterministic. No LLM. No auto-contact.
 * Managers see all org deals; agents see their own assigned. Org-scoped.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import {
  buildDealAi, computeDealScores, DEAL_STAGE_LABEL, expectedCloseDate, matchStageToDealStage,
  negotiationGap, nextDealAction, OBJECTION_LABEL, type DealStage,
} from "./engine";
import { syncPropertyOnDealWon } from "./deal-property-sync";
import { emitBusinessEvent, DOMAIN_EVENTS } from "@/lib/kernel";

type DB = Database["public"]["Tables"];
const DAY = 86_400_000;
const NEGOTIATING = new Set<DealStage>(["negotiation", "offer_sent", "offer_received", "agreement_draft"]);

// ── Stage 0.1 · Canonical Deal identity ──────────────────────────────────────
// public.deals is canonical; deal_profiles is a 1:1 projection linked by deal_id.
// Maps bridge the two stage vocabularies (deals.stage enum ↔ profile deal_stage text).
const PROFILE_TO_DEAL_STAGE: Record<string, string> = {
  new_opportunity: "new", contacted: "new", meeting_scheduled: "qualified", property_visit: "qualified",
  negotiation: "negotiation", offer_sent: "negotiation", offer_received: "negotiation",
  agreement_draft: "agreement", legal_review: "contract", signed: "closing",
};
const DEAL_TO_PROFILE_STAGE: Record<string, string> = {
  new: "new_opportunity", qualified: "meeting_scheduled", negotiation: "negotiation",
  agreement: "agreement_draft", contract: "legal_review", closing: "signed",
};

type SB = Awaited<ReturnType<typeof createClient>>;

/** Build the canonical open-deal row for a projection (no fabricated realized revenue). */
function canonicalDealRowFromProfile(orgId: string, p: Record<string, unknown>): Record<string, unknown> {
  return {
    org_id: orgId,
    owner_id: (p.assigned_agent_id as string | null) ?? null,
    title: p.locality ? `עסקה · ${p.locality as string}` : "עסקה",
    type: "sale",
    status: "open",
    stage: PROFILE_TO_DEAL_STAGE[(p.deal_stage as string) ?? "new_opportunity"] ?? "new",
    probability: Math.max(0, Math.min(100, (p.deal_probability as number | null) ?? 0)),
    buyer_id: (p.buyer_id as string | null) ?? null,
    seller_id: (p.seller_id as string | null) ?? null,
    property_id: (p.property_id as string | null) ?? null,
    expected_close_date: (p.expected_close_date as string | null) ?? null,
  };
}

/** Ensure a canonical public.deals row exists for a projection; returns the canonical id. Idempotent. */
export async function ensureCanonicalDeal(profileId: string): Promise<string | null> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data: p } = await supabase.from("deal_profiles")
    .select("id,deal_id,buyer_id,seller_id,property_id,assigned_agent_id,locality,deal_stage,deal_probability,expected_close_date")
    .eq("id", profileId).eq("organization_id", orgId).maybeSingle();
  if (!p) return null;
  if (p.deal_id) return p.deal_id;
  const { data: created } = await supabase.from("deals").insert(canonicalDealRowFromProfile(orgId, p as Record<string, unknown>) as never).select("id").single();
  const newId = (created as { id: string } | null)?.id ?? null;
  if (newId) await supabase.from("deal_profiles").update({ deal_id: newId } as never).eq("id", profileId);
  return newId;
}

/** Make canonical deals ⇄ projections 1:1 for the org. Only touches drift rows; idempotent. */
async function reconcileDealIdentity(supabase: SB, orgId: string): Promise<void> {
  // (1) active projections lacking a canonical deal → create + backlink.
  const { data: unlinked } = await supabase.from("deal_profiles")
    .select("id,buyer_id,seller_id,property_id,assigned_agent_id,locality,deal_stage,deal_probability,expected_close_date")
    .eq("organization_id", orgId).eq("status", "active").is("deal_id", null).limit(500);
  for (const p of unlinked ?? []) {
    try {
      const { data: created } = await supabase.from("deals").insert(canonicalDealRowFromProfile(orgId, p as Record<string, unknown>) as never).select("id").single();
      const id = (created as { id: string } | null)?.id;
      if (id) await supabase.from("deal_profiles").update({ deal_id: id } as never).eq("id", (p as { id: string }).id);
    } catch { /* best-effort */ }
  }
  // (2) open canonical deals with NO projection → create a projection (so Deals OS never hides them).
  const { data: linkedRows } = await supabase.from("deal_profiles").select("deal_id").eq("organization_id", orgId).not("deal_id", "is", null);
  const linked = new Set((linkedRows ?? []).map((r) => r.deal_id as string));
  const { data: openDeals } = await supabase.from("deals")
    .select("id,owner_id,buyer_id,seller_id,property_id,stage,value,commission_amount,probability")
    .eq("org_id", orgId).eq("status", "open").limit(500);
  const missing = (openDeals ?? []).filter((d) => !linked.has(d.id));
  if (missing.length) {
    const projRows = missing.map((d) => ({
      organization_id: orgId, deal_id: d.id, buyer_id: d.buyer_id ?? null, seller_id: d.seller_id ?? null,
      property_id: d.property_id ?? null, assigned_agent_id: d.owner_id ?? null,
      deal_stage: DEAL_TO_PROFILE_STAGE[d.stage as string] ?? "new_opportunity",
      deal_value: (d.value as number | null) ?? 0, commission_value: (d.commission_amount as number | null) ?? 0,
      deal_probability: (d.probability as number | null) ?? 0, status: "active",
    }));
    try { await supabase.from("deal_profiles").insert(projRows as never); } catch { /* unique index guards races */ }
  }
}

export { DEAL_TO_PROFILE_STAGE };

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}

// ── Recompute deal twins ─────────────────────────────────────────────────────
export interface DealRecomputeSummary { deals: number; tasks: number }

export async function recomputeDeals(): Promise<DealRecomputeSummary> {
  const { orgId } = await ctx();
  const supabase = await createClient();

  const [matchRes, existRes, objRes] = await Promise.all([
    supabase.from("match_intelligence_profiles").select("id,buyer_id,property_id,seller_id,momentum_score,risk_score,closing_probability,urgency_score,match_status,match_stage,next_best_action,primary_blocker,estimated_deal_value,estimated_commission").eq("match_status", "active").limit(2000),
    supabase.from("deal_profiles").select("id,match_id,deal_stage").eq("organization_id", orgId),
    supabase.from("deal_objections").select("deal_profile_id,resolved").eq("organization_id", orgId).eq("resolved", false),
  ]);
  const matches = (matchRes.data ?? []).filter((m) => m.match_stage !== "closed" && m.match_stage !== "lost");
  if (!matches.length) return { deals: 0, tasks: 0 };

  const existByMatch = new Map((existRes.data ?? []).map((d) => [d.match_id, d]));
  const openObjByDeal = new Map<string, number>();
  for (const o of objRes.data ?? []) openObjByDeal.set(o.deal_profile_id, (openObjByDeal.get(o.deal_profile_id) ?? 0) + 1);

  const propIds = [...new Set(matches.map((m) => m.property_id))];
  const { data: props } = await supabase.from("properties").select("id,city,price,assigned_agent_id,seller_id").in("id", propIds.length ? propIds : ["00000000-0000-0000-0000-000000000000"]);
  const propMap = new Map((props ?? []).map((p) => [p.id, p]));

  const rows: DB["deal_profiles"]["Insert"][] = [];
  const stageChange: { matchId: string; stage: DealStage }[] = [];
  for (const m of matches) {
    const p = propMap.get(m.property_id);
    const stage = matchStageToDealStage(m.match_stage);
    const existing = existByMatch.get(m.id);
    const openObj = existing ? openObjByDeal.get(existing.id) ?? 0 : 0;
    const scores = computeDealScores({ stage, matchClosingProbability: m.closing_probability, matchRisk: m.risk_score, matchUrgency: m.urgency_score, matchMomentum: m.momentum_score, daysInStage: null, openObjections: openObj, highObjections: 0 });
    const action = nextDealAction(stage, scores.deal_risk, openObj, null);
    const value = m.estimated_deal_value ?? p?.price ?? 0;
    const commission = m.estimated_commission ?? Math.round(value * 0.02);
    rows.push({
      organization_id: orgId, match_id: m.id, buyer_id: m.buyer_id, seller_id: m.seller_id ?? p?.seller_id ?? null, property_id: m.property_id,
      assigned_agent_id: p?.assigned_agent_id ?? null, deal_stage: stage, deal_health: scores.deal_health, deal_risk: scores.deal_risk,
      deal_velocity: scores.deal_velocity, deal_probability: scores.deal_probability, deal_value: value, commission_value: commission,
      expected_close_date: expectedCloseDate(stage), primary_blocker: m.primary_blocker, next_best_action: action.title,
      ai_summary: buildDealAi(stage, scores, action), status: "active", locality: p?.city ?? null, last_calculated_at: new Date().toISOString(),
    });
    if (!existing || existing.deal_stage !== stage) stageChange.push({ matchId: m.id, stage });
  }

  for (let i = 0; i < rows.length; i += 200) {
    await supabase.from("deal_profiles").upsert(rows.slice(i, i + 200) as never, { onConflict: "organization_id,match_id" });
  }

  // Resolve deal ids (by match_id) for child records.
  const { data: deals } = await supabase.from("deal_profiles").select("id,match_id,deal_stage,deal_risk,property_id,buyer_id,seller_id,assigned_agent_id,deal_value,deal_probability").eq("organization_id", orgId).eq("status", "active");
  const dealByMatch = new Map((deals ?? []).map((d) => [d.match_id, d]));

  // Journeys for stage changes.
  const journeyRows: DB["deal_journeys"]["Insert"][] = [];
  for (const sc of stageChange) { const d = dealByMatch.get(sc.matchId); if (d) journeyRows.push({ organization_id: orgId, deal_profile_id: d.id, stage: sc.stage, owner_id: d.assigned_agent_id, note: `נכנס לשלב ${DEAL_STAGE_LABEL[sc.stage]}` }); }
  if (journeyRows.length) await supabase.from("deal_journeys").insert(journeyRows as never);

  // Regenerate open deal tasks.
  await supabase.from("deal_tasks").delete().eq("organization_id", orgId).eq("status", "open");
  const taskRows: DB["deal_tasks"]["Insert"][] = [];
  for (const d of deals ?? []) {
    const stage = d.deal_stage as DealStage;
    const action = nextDealAction(stage, d.deal_risk, openObjByDeal.get(d.id) ?? 0, null);
    taskRows.push({ organization_id: orgId, deal_profile_id: d.id, title: action.title, owner_id: d.assigned_agent_id, priority: action.priority, impact_score: action.impact, reason: action.reason, deadline: new Date(Date.now() + action.deadlineDays * DAY).toISOString(), status: "open" });
  }
  for (let i = 0; i < taskRows.length; i += 500) { const cc = taskRows.slice(i, i + 500); if (cc.length) await supabase.from("deal_tasks").insert(cc as never); }

  // Seed negotiations for deals in negotiation+ without one.
  const { data: existNeg } = await supabase.from("deal_negotiations").select("deal_profile_id").eq("organization_id", orgId);
  const hasNeg = new Set((existNeg ?? []).map((n) => n.deal_profile_id));
  const negRows: DB["deal_negotiations"]["Insert"][] = [];
  for (const d of deals ?? []) {
    if (!NEGOTIATING.has(d.deal_stage as DealStage) || hasNeg.has(d.id)) continue;
    negRows.push({ organization_id: orgId, deal_profile_id: d.id, asking_price: d.deal_value, current_gap: 0, agreement_probability: d.deal_probability, note: "פתיחת מעקב משא ומתן" });
  }
  if (negRows.length) await supabase.from("deal_negotiations").insert(negRows as never);

  // Knowledge Graph links (buyer/seller/property/agent ↔ deal).
  const relRows: DB["entity_relationships"]["Insert"][] = [];
  for (const d of deals ?? []) {
    if (d.buyer_id) relRows.push(rel(orgId, "buyer", d.buyer_id, "deal", d.id, "in_deal", clamp(d.deal_probability)));
    if (d.seller_id) relRows.push(rel(orgId, "seller", d.seller_id, "deal", d.id, "in_deal", clamp(d.deal_probability)));
    if (d.property_id) relRows.push(rel(orgId, "property", d.property_id, "deal", d.id, "in_deal", 70));
    if (d.assigned_agent_id) relRows.push(rel(orgId, "agent", d.assigned_agent_id, "deal", d.id, "manages", 80));
  }
  await supabase.from("entity_relationships").delete().eq("org_id", orgId).eq("target_entity_type", "deal");
  for (let i = 0; i < relRows.length; i += 500) { const cc = relRows.slice(i, i + 500); if (cc.length) await supabase.from("entity_relationships").insert(cc as never); }

  return { deals: rows.length, tasks: taskRows.length };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
function rel(orgId: string, st: string, sid: string, tt: string, tid: string, type: string, strength: number): DB["entity_relationships"]["Insert"] {
  return { org_id: orgId, source_entity_type: st, source_entity_id: sid, target_entity_type: tt, target_entity_id: tid, relationship_type: type, strength_score: strength, status: "active" } as never;
}

// ── Actions ──────────────────────────────────────────────────────────────────
/** Real closing outcome supplied by the agent when a deal is won/lost. Money is
 *  recorded ONLY from these real values — never from pipeline estimates. */
export interface DealCloseOutcome { finalAmount?: number | null; finalCommission?: number | null; lostReason?: string | null }

export async function advanceDealStage(dealId: string, stage: DealStage, outcome?: DealCloseOutcome): Promise<void> {
  const { userId, orgId } = await ctx();
  const supabase = await createClient();
  await supabase.from("deal_profiles").update({ deal_stage: stage, status: stage === "closed" ? "won" : stage === "lost" ? "lost" : "active", expected_close_date: expectedCloseDate(stage) } as never).eq("id", dealId);
  await supabase.from("deal_journeys").insert({ organization_id: orgId, deal_profile_id: dealId, stage, owner_id: userId, note: `קודם ל${DEAL_STAGE_LABEL[stage]}` } as never);
  // CANONICAL REVENUE LEDGER: a won/lost deal_profile writes a REAL row to the
  // canonical `deals` table (so /revenue, /ai-office, /command read facts, not
  // estimates). The fact-of-close (counts) is always real; money (value /
  // commission) is written ONLY when the agent supplies the actual amount —
  // pipeline estimates are NEVER recorded as realized revenue.
  if (stage === "closed" || stage === "lost") {
    try { await syncCanonicalDealOnClose(supabase, orgId, dealId, stage === "closed" ? "won" : "lost", outcome ?? {}); }
    catch (e) { console.error("[deals] canonical sync failed:", e); }
  }
  // Stage 0.2: a WON deal marks its linked property sold/rented (idempotent).
  if (stage === "closed") {
    try {
      const { data: pr } = await supabase.from("deal_profiles").select("property_id").eq("id", dealId).eq("organization_id", orgId).maybeSingle();
      await syncPropertyOnDealWon(supabase, orgId, (pr?.property_id as string | null) ?? null);
    } catch (e) { console.error("[deals] property sync failed:", e); }
  }
  // Stage 1: emit the deal lifecycle event through the kernel.
  //
  // IDENTITY (fixed after Batch 5.2 live verification — this was a real split):
  // `dealId` here is a deal_profiles.id, but deal.created (create-actions.ts)
  // emits the canonical `deals`.id. Emitting the profile id made deal.created and
  // deal.stage_changed describe the SAME business deal under TWO entity ids — so
  // the canonical journey opened by deal.created could never be advanced, and a
  // mappable stage would have opened a SECOND deal journey keyed on the profile.
  // The event contract says entityType "deal", so it must carry the canonical
  // deals.id. We resolve it from the 1:1 link and fall back to the profile id
  // only when no canonical row exists yet (recorded honestly in the payload).
  const { data: link } = await supabase
    .from("deal_profiles").select("deal_id").eq("id", dealId).eq("organization_id", orgId).maybeSingle();
  const canonicalDealId = (link as { deal_id: string | null } | null)?.deal_id ?? null;
  const evt = stage === "closed" ? DOMAIN_EVENTS.dealWon : stage === "lost" ? DOMAIN_EVENTS.dealLost : DOMAIN_EVENTS.dealStageChanged;
  await emitBusinessEvent({
    type: evt,
    entityType: "deal",
    entityId: canonicalDealId ?? dealId,
    payload: { stage, dealProfileId: dealId, canonicalDealId },
  });
}

/** Upsert the canonical `deals` row for a closed/lost deal_profile (linked via
 *  deal_profiles.deal_id for idempotency on re-close). Real fields only. */
async function syncCanonicalDealOnClose(
  supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, profileId: string,
  status: "won" | "lost", outcome: DealCloseOutcome,
): Promise<void> {
  const { data: p } = await supabase.from("deal_profiles")
    .select("id,buyer_id,seller_id,property_id,assigned_agent_id,deal_id,locality,deal_probability,expected_close_date")
    .eq("id", profileId).eq("organization_id", orgId).maybeSingle();
  if (!p) return;
  const amount = outcome.finalAmount != null && outcome.finalAmount > 0 ? Math.round(outcome.finalAmount) : null;
  const commission = outcome.finalCommission != null && outcome.finalCommission > 0 ? Math.round(outcome.finalCommission) : null;
  const commissionPct = amount && commission ? Math.round((commission / amount) * 10000) / 100 : null;
  const row = {
    org_id: orgId,
    owner_id: p.assigned_agent_id ?? null,
    title: p.locality ? `עסקה · ${p.locality}` : "עסקה",
    type: "sale",
    status,                                                  // won | lost — real fact
    value: status === "won" ? amount : null,                 // real money only (else NULL)
    commission_amount: status === "won" ? commission : null,
    commission_pct: status === "won" ? commissionPct : null,
    probability: Math.max(0, Math.min(100, p.deal_probability ?? 0)),
    buyer_id: p.buyer_id ?? null,
    seller_id: p.seller_id ?? null,
    property_id: p.property_id ?? null,
    expected_close_date: p.expected_close_date ?? null,
    closed_at: status === "won" ? new Date().toISOString() : null,
    lost_reason: status === "lost" ? (outcome.lostReason ?? null) : null,
  };
  if (p.deal_id) {
    await supabase.from("deals").update(row as never).eq("id", p.deal_id).eq("org_id", orgId);
  } else {
    const { data: created } = await supabase.from("deals").insert(row as never).select("id").single();
    const newId = (created as { id: string } | null)?.id;
    if (newId) await supabase.from("deal_profiles").update({ deal_id: newId } as never).eq("id", profileId);
  }
}

export async function logNegotiation(dealId: string, input: { asking: number | null; buyerOffer: number | null; sellerCounter: number | null; note?: string }): Promise<void> {
  const { userId, orgId } = await ctx();
  const supabase = await createClient();
  const { gap, agreementProbability } = negotiationGap(input.asking, input.buyerOffer, input.sellerCounter);
  await supabase.from("deal_negotiations").insert({ organization_id: orgId, deal_profile_id: dealId, asking_price: input.asking, buyer_offer: input.buyerOffer, seller_counter_offer: input.sellerCounter, current_gap: gap, agreement_probability: agreementProbability, note: input.note ?? null, created_by: userId } as never);
}

export async function addObjection(dealId: string, type: string, severity: string, description?: string): Promise<void> {
  const { userId, orgId } = await ctx();
  const supabase = await createClient();
  await supabase.from("deal_objections").insert({ organization_id: orgId, deal_profile_id: dealId, objection_type: type, severity, description: description ?? null, owner_id: userId, recommended_action: `טפל בהתנגדות: ${OBJECTION_LABEL[type] ?? type}` } as never);
}

export async function resolveObjection(objectionId: string): Promise<void> {
  await ctx();
  const supabase = await createClient();
  await supabase.from("deal_objections").update({ resolved: true, resolved_at: new Date().toISOString() } as never).eq("id", objectionId);
}

export async function setDealTaskStatus(taskId: string, status: string): Promise<void> {
  await ctx();
  const supabase = await createClient();
  await supabase.from("deal_tasks").update({ status } as never).eq("id", taskId);
}

// ── Read models ──────────────────────────────────────────────────────────────
export type DealRow = DB["deal_profiles"]["Row"] & { buyerName: string | null; propertyTitle: string | null; agentName: string | null };

export interface DealsBoard {
  deals: DealRow[];
  pipeline: { stage: string; label: string; count: number; value: number }[];
  negotiations: (DB["deal_negotiations"]["Row"] & { dealTitle: string })[];
  objections: (DB["deal_objections"]["Row"] & { dealTitle: string })[];
  tasks: (DB["deal_tasks"]["Row"] & { dealTitle: string })[];
  atRisk: DealRow[];
  upcomingClosings: DealRow[];
  revenue: { pipelineValue: number; weightedRevenue: number; expectedCommission: number };
}

export async function getDealsBoard(): Promise<DealsBoard> {
  const supabase = await createClient();
  // Stage 0.1: guarantee canonical deals ⇄ projections 1:1 so no deal is hidden.
  try { const { orgId } = await ctx(); await reconcileDealIdentity(supabase, orgId); } catch { /* best-effort */ }
  const [dealRes, negRes, objRes, taskRes] = await Promise.all([
    supabase.from("deal_profiles").select("*").eq("status", "active").order("deal_value", { ascending: false }).limit(500),
    supabase.from("deal_negotiations").select("*").order("created_at", { ascending: false }).limit(40),
    supabase.from("deal_objections").select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(40),
    supabase.from("deal_tasks").select("*").eq("status", "open").order("impact_score", { ascending: false }).limit(40),
  ]);
  const deals0 = dealRes.data ?? [];
  const buyerIds = [...new Set(deals0.map((d) => d.buyer_id).filter((x): x is string => !!x))];
  const propIds = [...new Set(deals0.map((d) => d.property_id).filter((x): x is string => !!x))];
  const agentIds = [...new Set(deals0.map((d) => d.assigned_agent_id).filter((x): x is string => !!x))];
  const [buyersR, propsR, usersR] = await Promise.all([
    buyerIds.length ? supabase.from("buyers").select("id,full_name").in("id", buyerIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    propIds.length ? supabase.from("properties").select("id,title").in("id", propIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    agentIds.length ? supabase.from("users").select("id,full_name").in("id", agentIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const buyerName = new Map((buyersR.data ?? []).map((b) => [b.id, b.full_name]));
  const propTitle = new Map((propsR.data ?? []).map((p) => [p.id, p.title]));
  const agentName = new Map((usersR.data ?? []).map((u) => [u.id, u.full_name]));
  const deals: DealRow[] = deals0.map((d) => ({ ...d, buyerName: d.buyer_id ? buyerName.get(d.buyer_id) ?? null : null, propertyTitle: d.property_id ? propTitle.get(d.property_id) ?? null : null, agentName: d.assigned_agent_id ? agentName.get(d.assigned_agent_id) ?? null : null }));
  const dealTitle = (id: string) => { const d = deals.find((x) => x.id === id); return d ? `${d.buyerName ?? "קונה"} ← ${d.propertyTitle ?? "נכס"}` : "עסקה"; };

  const stageAgg = new Map<string, { count: number; value: number }>();
  for (const d of deals) { const a = stageAgg.get(d.deal_stage) ?? { count: 0, value: 0 }; a.count++; a.value += d.deal_value; stageAgg.set(d.deal_stage, a); }
  const STAGE_ORDER = ["new_opportunity", "contacted", "meeting_scheduled", "property_visit", "negotiation", "offer_sent", "offer_received", "agreement_draft", "legal_review", "signed"];
  const pipeline = STAGE_ORDER.map((s) => ({ stage: s, label: DEAL_STAGE_LABEL[s as DealStage] ?? s, count: stageAgg.get(s)?.count ?? 0, value: stageAgg.get(s)?.value ?? 0 })).filter((s) => s.count > 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  return {
    deals,
    pipeline,
    negotiations: (negRes.data ?? []).map((n) => ({ ...n, dealTitle: dealTitle(n.deal_profile_id) })),
    objections: (objRes.data ?? []).map((o) => ({ ...o, dealTitle: dealTitle(o.deal_profile_id) })),
    tasks: (taskRes.data ?? []).map((t) => ({ ...t, dealTitle: dealTitle(t.deal_profile_id) })),
    atRisk: deals.filter((d) => d.deal_risk >= 55).sort((a, b) => b.deal_risk - a.deal_risk).slice(0, 10),
    upcomingClosings: deals.filter((d) => d.expected_close_date && d.expected_close_date >= todayStr && d.expected_close_date <= in30).sort((a, b) => (a.expected_close_date ?? "").localeCompare(b.expected_close_date ?? "")).slice(0, 10),
    revenue: {
      pipelineValue: deals.reduce((s, d) => s + d.deal_value, 0),
      weightedRevenue: deals.reduce((s, d) => s + Math.round(d.commission_value * (d.deal_probability / 100)), 0),
      expectedCommission: deals.reduce((s, d) => s + d.commission_value, 0),
    },
  };
}
