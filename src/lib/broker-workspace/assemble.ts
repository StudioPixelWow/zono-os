// ============================================================================
// 👤 ZONO Broker Personal Workspace™ — pure assembler (client-safe). 35.0.
// Turns lean, broker-scoped engine outputs into the daily operating center:
// ranked priorities, hot buyers, sellers at risk, critical listings, lead
// follow-ups, approvals, workflows, meetings, a derived AI briefing, an
// approval-gated comms list, and personal performance. Deterministic, pure,
// evidence-only — no fabrication, no side effects, nothing auto-sends/books.
// ============================================================================
import type {
  BrokerWorkspace, BrokerWorkspaceInput, ScoredEntity, WsMission,
  WsCommItem, BrokerBriefingItem, BrokerPerformance, Impact,
} from "./types";
import { BROKER_WORKSPACE_VERSION } from "./types";

const DAY = 86_400_000;
const impactRank: Record<Impact, number> = { high: 3, medium: 2, low: 1 };

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}
const inSet = (id: string | null, set: Set<string>) => !!id && set.has(id);
const byScoreDesc = (a: ScoredEntity, b: ScoredEntity) => (b.score ?? b.healthScore ?? 0) - (a.score ?? a.healthScore ?? 0);

export function assembleBrokerWorkspace(input: BrokerWorkspaceInput): BrokerWorkspace {
  const now = input.now ?? Date.now();
  const notes = [...input.notes];
  const owned = {
    buyer: new Set(input.owned.buyerIds),
    seller: new Set(input.owned.sellerIds),
    lead: new Set(input.owned.leadIds),
    property: new Set(input.owned.propertyIds),
  };

  // ── Dashboard collections (inputs for buyers/sellers/listings/leads are
  //    already broker-scoped by the service; we rank + slice here). ──────────
  const hotBuyers = [...input.buyers].sort(byScoreDesc).slice(0, 8);
  const sellersAtRisk = [...input.sellers]
    .filter((s) => (s.score ?? 0) >= 40 || !!s.riskLabel)
    .sort(byScoreDesc).slice(0, 8);
  const criticalListings = [...input.listings]
    .sort((a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100)) // worst health first
    .slice(0, 8);
  const leadFollowUps = [...input.leads]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);

  // Missions owned by this broker OR about an entity the broker owns.
  const brokerMissions = input.missions.filter((m) =>
    (input.brokerId != null && m.owner === input.brokerId) ||
    inSet(m.entityId, owned.buyer) || inSet(m.entityId, owned.seller) ||
    inSet(m.entityId, owned.lead) || inSet(m.entityId, owned.property));
  const todaysPriorities = [...brokerMissions].sort((a, b) => {
    const p = impactRank[b.priority] - impactRank[a.priority];
    if (p !== 0) return p;
    return (Date.parse(a.dueAt ?? "") || Infinity) - (Date.parse(b.dueAt ?? "") || Infinity);
  }).slice(0, 12);

  const brokerInbox = input.inbox.filter((i) =>
    inSet(i.entityId, owned.buyer) || inSet(i.entityId, owned.seller) ||
    inSet(i.entityId, owned.lead) || inSet(i.entityId, owned.property));
  const pendingApprovals = brokerInbox.filter((i) => i.requiresApproval && i.status === "pending").slice(0, 12);

  const activeWorkflows = input.workflows.filter((w) =>
    inSet(w.entityId, owned.buyer) || inSet(w.entityId, owned.seller) ||
    inSet(w.entityId, owned.lead) || inSet(w.entityId, owned.property)).slice(0, 12);

  const upcomingMeetings = [...input.meetings]
    .filter((m) => (Date.parse(m.startAt ?? "") || 0) >= now - DAY)
    .sort((a, b) => (Date.parse(a.startAt ?? "") || 0) - (Date.parse(b.startAt ?? "") || 0))
    .slice(0, 10);

  // ── AI Briefing — derived from the above, evidence-only ────────────────────
  const briefing = buildBriefing({ todaysPriorities, hotBuyers, criticalListings, leadFollowUps, sellersAtRisk, now });

  // ── Comms center — approval-gated draft candidates ─────────────────────────
  const comms = buildComms({ leads: input.leads, buyers: input.buyers, sellers: input.sellers, now });

  // ── Performance ────────────────────────────────────────────────────────────
  const performance = buildPerformance({
    buyers: input.buyers, sellers: input.sellers, leads: input.leads, listings: input.listings,
    hotBuyers, sellersAtRisk, criticalListings, now,
  });

  return {
    version: BROKER_WORKSPACE_VERSION,
    brokerId: input.brokerId,
    brokerName: input.brokerName,
    generatedAt: new Date(now).toISOString(),
    dashboard: { todaysPriorities, hotBuyers, sellersAtRisk, criticalListings, leadFollowUps, pendingApprovals, activeWorkflows, upcomingMeetings },
    briefing,
    calendar: { upcoming: upcomingMeetings, suggested: input.suggested.slice(0, 12), note: "אין קביעת פגישות אוטומטית — כל אירוע דורש אישור." },
    comms,
    inbox: brokerInbox.slice(0, 20),
    performance,
    whatsapp: input.whatsapp ?? { unread: 0, waiting: 0, urgent: 0, today: 0, waitingConversations: [] },
    facebook: input.facebook ?? { scheduledToday: 0, commentsWaiting: 0, leadApprovals: 0, groupsToPublish: 0, tasks: [] },
    website: input.website ?? { hasSite: false, published: false, healthScore: 0, seoAlerts: 0, landingDrafts: 0, approvalsPending: 0, alerts: [] },
    notes,
  };
}

function buildBriefing(a: {
  todaysPriorities: WsMission[]; hotBuyers: ScoredEntity[]; criticalListings: ScoredEntity[];
  leadFollowUps: ScoredEntity[]; sellersAtRisk: ScoredEntity[]; now: number;
}): BrokerWorkspace["briefing"] {
  const items: BrokerBriefingItem[] = [];

  // 1) What should I do today?
  if (a.todaysPriorities.length || a.sellersAtRisk.length) {
    const top = a.todaysPriorities.slice(0, 3);
    const ev = top.map((m) => `${m.title}${m.entityName ? ` · ${m.entityName}` : ""}`);
    items.push({
      question: "מה עליי לעשות היום?",
      answer: top.length
        ? `${top.length} משימות בעדיפות עליונה ממתינות לך${a.sellersAtRisk.length ? `, ו-${a.sellersAtRisk.length} מוכרים בסיכון דורשים מעקב` : ""}.`
        : `אין משימות פתוחות, אך ${a.sellersAtRisk.length} מוכרים בסיכון דורשים תשומת לב.`,
      evidence: ev.length ? ev : a.sellersAtRisk.slice(0, 3).map((s) => s.name),
      targets: top.map((m) => ({ label: m.title, href: entityHref(m.entityType, m.entityId) })),
    });
  }

  // 2) Who should I call?
  const calls = [...a.hotBuyers.slice(0, 3), ...a.leadFollowUps.slice(0, 2)];
  if (calls.length) {
    items.push({
      question: "למי כדאי להתקשר?",
      answer: `${a.hotBuyers.length} קונים חמים ו-${a.leadFollowUps.length} לידים ממתינים למעקב. התחל מהחמים ביותר.`,
      evidence: calls.map((c) => `${c.name}${c.reason ? ` — ${c.reason}` : ""}`),
      targets: calls.map((c) => ({ label: c.name, href: c.href })),
    });
  }

  // 3) Which property needs attention?
  if (a.criticalListings.length) {
    const p = a.criticalListings[0];
    items.push({
      question: "איזה נכס דורש תשומת לב?",
      answer: `${p.name} עם הציון הנמוך ביותר${p.riskLabel ? ` (${p.riskLabel})` : ""}. כדאי לטפל בו קודם.`,
      evidence: a.criticalListings.slice(0, 3).map((x) => `${x.name}${x.healthScore != null ? ` · בריאות ${x.healthScore}` : ""}`),
      targets: a.criticalListings.slice(0, 3).map((x) => ({ label: x.name, href: x.href })),
    });
  }

  // 4) Which buyer is close to closing?
  const closer = a.hotBuyers.find((b) => (b.healthScore ?? 0) >= 70) ?? a.hotBuyers[0];
  if (closer) {
    items.push({
      question: "איזה קונה קרוב לסגירה?",
      answer: `${closer.name}${closer.healthScore != null ? ` (בריאות ${closer.healthScore})` : ""} הוא המועמד החם ביותר לסגירה.`,
      evidence: [closer.reason ?? "בריאות גבוהה ופעילות עדכנית", closer.lastActivityAt ? `פעילות אחרונה: ${closer.lastActivityAt.slice(0, 10)}` : "אין תאריך פעילות"],
      targets: [{ label: closer.name, href: closer.href }],
    });
  }

  return { generatedAt: new Date(a.now).toISOString(), items };
}

function buildComms(a: { leads: ScoredEntity[]; buyers: ScoredEntity[]; sellers: ScoredEntity[]; now: number }): BrokerWorkspace["comms"] {
  const items: WsCommItem[] = [];
  // Leads never contacted / brand new → first response.
  for (const l of a.leads) {
    const d = daysSince(l.lastActivityAt, a.now);
    if (l.lastActivityAt == null || (d != null && d >= 1)) {
      items.push({ kind: "lead", entityId: l.id, entityName: l.name, intent: l.lastActivityAt == null ? "first_response" : "follow_up",
        why: l.lastActivityAt == null ? "ליד חדש ללא מענה" : `ללא מגע ${d} ימים`, channelHint: "whatsapp", href: commHref("lead", l.id) });
    }
    if (items.length >= 6) break;
  }
  // Stale hot buyers → follow up.
  for (const b of a.buyers) {
    const d = daysSince(b.lastActivityAt, a.now);
    if (d != null && d >= 5) {
      items.push({ kind: "buyer", entityId: b.id, entityName: b.name, intent: "follow_up", why: `קונה פעיל ללא מגע ${d} ימים`, channelHint: "whatsapp", href: commHref("buyer", b.id) });
    }
    if (items.length >= 10) break;
  }
  // Sellers at risk → update.
  for (const s of a.sellers) {
    if ((s.score ?? 0) >= 40 || s.riskLabel) {
      items.push({ kind: "seller", entityId: s.id, entityName: s.name, intent: "update", why: s.riskLabel ?? "מוכר בסיכון — עדכון מצב", channelHint: "message", href: commHref("seller", s.id) });
    }
    if (items.length >= 12) break;
  }
  return { items: items.slice(0, 12), note: "טיוטות בלבד — שום הודעה לא נשלחת אוטומטית. כל שליחה דורשת אישור." };
}

function buildPerformance(a: {
  buyers: ScoredEntity[]; sellers: ScoredEntity[]; leads: ScoredEntity[]; listings: ScoredEntity[];
  hotBuyers: ScoredEntity[]; sellersAtRisk: ScoredEntity[]; criticalListings: ScoredEntity[]; now: number;
}): BrokerPerformance {
  const people = [...a.buyers, ...a.sellers, ...a.leads];
  const recent = people.filter((p) => { const d = daysSince(p.lastActivityAt, a.now); return d != null && d <= 14; }).length;
  const followUpRatePct = people.length ? Math.round((recent / people.length) * 100) : 0;
  const conversionOpportunities = a.hotBuyers.filter((b) => (b.healthScore ?? 0) >= 70).length;

  const staleLeads = a.leads.filter((l) => { const d = daysSince(l.lastActivityAt, a.now); return l.lastActivityAt == null || (d != null && d >= 3); }).length;
  const staleListings = a.listings.filter((p) => { const d = daysSince(p.lastActivityAt, a.now); return d != null && d >= 21; }).length;
  const weakSpots: BrokerPerformance["weakSpots"] = [];
  if (staleLeads) weakSpots.push({ title: "לידים ללא מענה", detail: `${staleLeads} לידים ללא מגע 3+ ימים`, impact: staleLeads >= 5 ? "high" : "medium" });
  if (a.sellersAtRisk.length) weakSpots.push({ title: "מוכרים בסיכון נטישה", detail: `${a.sellersAtRisk.length} מוכרים דורשים חיזוק`, impact: a.sellersAtRisk.length >= 3 ? "high" : "medium" });
  if (staleListings) weakSpots.push({ title: "נכסים ללא פעילות", detail: `${staleListings} נכסים ללא פעילות 3+ שבועות`, impact: "medium" });
  if (followUpRatePct < 50 && people.length >= 5) weakSpots.push({ title: "שיעור מעקב נמוך", detail: `רק ${followUpRatePct}% מהאנשים בטיפול נגעת בהם ב-14 הימים האחרונים`, impact: "high" });

  return {
    activeListings: a.listings.length, activeBuyers: a.buyers.length, activeSellers: a.sellers.length,
    leadsHandled: a.leads.length, followUpRatePct, conversionOpportunities, weakSpots,
  };
}

function entityHref(kind: string | null, id: string | null): string {
  if (!id) return "/my";
  switch (kind) {
    case "buyer": return `/buyers/${id}`;
    case "seller": return `/sellers/${id}`;
    case "lead": return `/leads/${id}`;
    case "property": return `/properties/${id}`;
    default: return "/my";
  }
}
function commHref(kind: string, id: string): string {
  return `/communication?entityKind=${kind}&entityId=${id}`;
}
