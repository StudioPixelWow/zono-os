// ============================================================================
// 🛒 Buyer Portal — view-model assembler (pure). 32.3.
// Turns the normalized BuyerPortalInput (built by the server from REUSED engines)
// into buyer-facing view models. Public/buyer-safe, evidence-only. Nothing
// auto-executes: every actionable item is approval-gated.
// ============================================================================
import { aiSummary, explainRecommendation, buyingTips, timelineGuidance, offerPrepGuidance, mortgagePrepGuidance, STAGE_HE, budgetLine } from "./content";
import type { BuyerPortalInput, BuyerDashboard, BuyerFavorites, RecoProperty, PortalAction, PortalNotification, PortalInsight, MatchTier } from "./types";

const READY_LABEL = (r: number) => (r >= 75 ? "מוכנות גבוהה" : r >= 50 ? "מוכנות בינונית" : r >= 25 ? "בתחילת הדרך" : "טרם התחלנו");

function reco(input: BuyerPortalInput, listingId: string, score: number, tier: MatchTier, why: string[]): RecoProperty | null {
  const l = input.listings[listingId]; if (!l) return null;
  const base: RecoProperty = { id: l.id, title: l.title, price: l.price, image: l.image, city: l.city, neighborhood: l.neighborhood, rooms: l.rooms, area: l.area, matchScore: score, tier, why };
  return { ...base, why: explainRecommendation(base, input.profile) };
}

function group(input: BuyerPortalInput, tier: MatchTier): RecoProperty[] {
  return input.matches.filter((m) => m.tier === tier).map((m) => reco(input, m.listingId, m.score, m.tier, m.why)).filter((x): x is RecoProperty => x !== null).sort((a, b) => b.matchScore - a.matchScore);
}

export function buildDashboard(input: BuyerPortalInput): BuyerDashboard {
  const p = input.profile;
  const perfect = group(input, "perfect"), emerging = group(input, "emerging"), hidden = group(input, "hidden"), future = group(input, "future");

  const recommendedActions: PortalAction[] = input.strategyPlaybook.slice(0, 5).map((a) => ({ order: a.order, title: a.action, why: a.why, requiresApproval: true }));
  // buyer-facing "open items" = opportunities in progress (NOT raw missions/workflows).
  const openItems: PortalAction[] = input.opportunities.slice(0, 4).map((o, i) => ({ order: i + 1, title: o.title, why: o.evidence[0] ?? "", requiresApproval: true }));

  const marketUpdates: PortalInsight[] = input.opportunities.slice(0, 3).map((o) => ({ title: o.title, body: o.evidence.join(" · ") || "הזדמנות רלוונטית עבורכם.", evidence: o.evidence }));
  const insights: PortalInsight[] = [timelineGuidance(input.stage), ...buyingTips(input), offerPrepGuidance(), mortgagePrepGuidance(p.hasPreapproval)].slice(0, 6);

  const savedSearches = (() => {
    const areas = [...new Set([...p.preferredCities, ...p.preferredAreas])];
    if (!areas.length && p.budgetMax == null) return [] as { label: string; criteria: string }[];
    const crit = [budgetLine(p), areas.slice(0, 3).join(", ") || null, p.roomsMin != null ? `${p.roomsMin}+ חדרים` : null].filter(Boolean).join(" · ");
    return [{ label: "החיפוש שלי", criteria: crit }];
  })();

  const returning = input.hasActivity;
  const firstName = p.firstName || "ברוכים הבאים";
  const resume = returning ? resumeLine(input) : null;

  return {
    welcome: { greeting: returning ? `שוב שלום, ${firstName}` : `ברוכים הבאים, ${firstName}`, returning, resume },
    stage: input.stage, stageLabel: STAGE_HE[input.stage],
    readiness: input.readiness, readinessLabel: READY_LABEL(input.readiness), healthLabel: input.healthLabel, confidence: input.confidence,
    aiSummary: aiSummary(input),
    recommendedActions,
    recommendations: { perfect, emerging, hidden, future },
    upcomingAppointments: input.appointments.filter((a) => new Date(a.startAt).getTime() >= Date.now() - 3600_000).slice(0, 5),
    recentConversations: input.conversations.slice(0, 5),
    openItems,
    marketUpdates,
    savedSearches,
    insights,
    notifications: buildNotifications(input),
  };
}

function resumeLine(input: BuyerPortalInput): string {
  const perfect = input.matches.filter((m) => m.tier === "perfect").length;
  if (perfect > 0) return `יש ${perfect} התאמות מושלמות חדשות שממתינות לכם`;
  const nextAppt = input.appointments.find((a) => new Date(a.startAt).getTime() >= Date.now());
  if (nextAppt) return `הצפייה הבאה שלכם: ${nextAppt.title}`;
  if (input.strategyPlaybook[0]) return `הצעד הבא: ${input.strategyPlaybook[0].action}`;
  return "המשיכו מהמקום שבו עצרתם";
}

export function buildNotifications(input: BuyerPortalInput): PortalNotification[] {
  const out: PortalNotification[] = [];
  const perfect = input.matches.filter((m) => m.tier === "perfect");
  if (perfect.length) out.push({ id: "n-match", type: "new_match", title: "התאמה מושלמת חדשה", detail: `${perfect.length} נכסים תואמים במיוחד להעדפות שלכם`, at: input.lastActivityAt, requiresApproval: false });
  for (const [id, l] of Object.entries(input.listings)) {
    if (l.priceDropPct != null && l.priceDropPct > 0) out.push({ id: `n-drop-${id}`, type: "price_drop", title: "ירידת מחיר", detail: `${l.title}: ירידה של ${l.priceDropPct}%`, at: null, requiresApproval: false });
    if (l.sold && input.savedListingIds.includes(id)) out.push({ id: `n-sold-${id}`, type: "sold", title: "נכס נמכר", detail: `${l.title} כבר לא זמין`, at: null, requiresApproval: false });
  }
  const nextAppt = input.appointments.find((a) => { const t = new Date(a.startAt).getTime(); return t >= Date.now() && t <= Date.now() + 3 * 86400_000; });
  if (nextAppt) out.push({ id: `n-appt-${nextAppt.id}`, type: "appointment", title: "תזכורת לצפייה", detail: `${nextAppt.title} · ${new Date(nextAppt.startAt).toLocaleString("he-IL")}`, at: nextAppt.startAt, requiresApproval: false });
  const brokerMsg = input.conversations.find((c) => c.fromBroker);
  if (brokerMsg) out.push({ id: "n-msg", type: "message", title: "הודעה מהברוקר", detail: brokerMsg.summary, at: brokerMsg.at, requiresApproval: false });
  return out.slice(0, 8);
}

export function buildFavorites(input: BuyerPortalInput): BuyerFavorites {
  const byId = (id: string): RecoProperty | null => {
    const m = input.matches.find((x) => x.listingId === id);
    return reco(input, id, m?.score ?? 0, m?.tier ?? "future", m?.why ?? []);
  };
  const saved = input.savedListingIds.map(byId).filter((x): x is RecoProperty => x !== null);
  const recentlyViewed = input.viewedListingIds.filter((id) => !input.savedListingIds.includes(id)).map(byId).filter((x): x is RecoProperty => x !== null);
  const updates: BuyerFavorites["updates"] = [];
  for (const id of input.savedListingIds) {
    const l = input.listings[id]; if (!l) continue;
    if (l.priceDropPct != null && l.priceDropPct > 0) updates.push({ propertyId: id, kind: "price_drop", detail: `ירידת מחיר של ${l.priceDropPct}%` });
    if (l.sold) updates.push({ propertyId: id, kind: "status", detail: "הנכס נמכר" });
  }
  for (const m of input.matches) if (input.savedListingIds.includes(m.listingId) && m.tier === "perfect") updates.push({ propertyId: m.listingId, kind: "new_match", detail: "עלה לדירוג התאמה מושלמת" });
  const aiRanking = [...saved].sort((a, b) => b.matchScore - a.matchScore).map((r, i) => ({ propertyId: r.id, rank: i + 1, why: r.why[0] ?? "התאמה להעדפות שלכם" }));
  return { saved, recentlyViewed, updates, aiRanking };
}
