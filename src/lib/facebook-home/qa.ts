// ============================================================================
// ✅ ZONO Facebook Growth Platform™ — pure self-tests (offline). 37.0.
// Validates KPI passthrough, group bucketing, recommendations (evidence-only),
// marketplace planning, and performance. No I/O.
// ============================================================================
import { assembleFacebookHome } from "./assemble";
import type { FbInput } from "./types";

export interface FHCheck { name: string; pass: boolean; detail: string }
export interface FHSelfCheck { ok: boolean; total: number; passed: number; checks: FHCheck[] }

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-04T09:00:00.000Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

function base(o: Partial<FbInput> = {}): FbInput {
  return {
    connection: { metaStatus: "connected", extensionStatus: "paired", connected: true, warnings: [] },
    stats: { groups: 10, activeGroups: 7, campaigns: 3, activeCampaigns: 2, scheduledPosts: 5, publishedPosts: 20, comments: 40, needsReply: 6, leads: 12, newLeads: 4, reach: 5000, conversionRate: 8 },
    groups: [
      { id: "g1", name: "נדל״ן חיפה", city: "חיפה", folder: "צפון", performance: 85, leadScore: 70, totalLeads: 9, daysSincePost: 2, recommendation: "המשך" },
      { id: "g2", name: "דירות קר", city: "קריות", folder: "צפון", performance: 30, leadScore: 20, totalLeads: 0, daysSincePost: 40, recommendation: "שקול הסרה" },
      { id: "g3", name: "משקיעים", city: "תל אביב", folder: "מרכז", performance: 60, leadScore: 75, totalLeads: 3, daysSincePost: 25, recommendation: "פרסם" },
    ],
    groupSummary: { total: 3, strong: 1, weak: 1, inactive: 2, noLeads: 1 },
    comments: { total: 40, needsReply: 6, hotLeads: 2, leads: 5 },
    needsReplyItems: [{ id: "c1", author: "יוסי", text: "מה המחיר?", category: "asks_for_price", suggestedReply: "אשמח לפרט", shouldCreateLead: true, href: "/distribution/groups" }],
    leadCandidates: [{ id: "c1", author: "יוסי", text: "מה המחיר?", category: "asks_for_price", suggestedReply: "אשמח לפרט", shouldCreateLead: true, href: "/distribution/groups" }],
    campaigns: [{ id: "cm1", name: "פרויקט ים", status: "active", city: "חיפה", totalGroups: 5, totalLeads: 8, href: "/distribution" }],
    scheduled: [{ id: "p1", title: "פוסט", status: "scheduled", scheduledAt: ago(-2), href: "/distribution" }],
    territoryActions: [{ title: "הזדמנות יוקרה בכרמל", why: "ביקוש גבוה", evidence: ["3 עסקאות"], impact: "high", href: "/market-domination", label: "פעל", kind: "opportunity", areaName: "כרמל" }],
    weakAreas: [{ name: "נהריה", score: 25 }],
    missingAreas: [{ name: "עכו" }],
    properties: [
      { id: "pr1", title: "פנטהאוז", city: "חיפה", status: "active", lastExposureAt: null, zonoScore: 82 },
      { id: "pr2", title: "דירת גן", city: "חיפה", status: "active", lastExposureAt: ago(30), zonoScore: 50 },
      { id: "pr3", title: "ישן", city: "חיפה", status: "sold", lastExposureAt: ago(5), zonoScore: 40 },
    ],
    notes: [],
    now: NOW,
    ...o,
  };
}

export function runSelfCheck(): FHSelfCheck {
  const checks: FHCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });
  const h = assembleFacebookHome(base());

  add("kpis passthrough", h.kpis.groups === 10 && h.kpis.leads === 12);
  add("groups: best sorted by performance", h.groups.best[0].id === "g1");
  add("groups: inactive detected (>=21d)", h.groups.inactive.some((g) => g.id === "g2") && h.groups.inactive.some((g) => g.id === "g3"));
  add("groups: opportunity (high leadScore + stale)", h.groups.opportunity.some((g) => g.id === "g3"));
  add("groups: coverage gaps from missing areas", h.groups.coverageGaps.some((c) => c.area === "עכו"));

  add("comments surfaced", h.comments.counts.needsReply === 6 && h.comments.needsReplyItems.length === 1);

  add("rec: weak city present with evidence", h.recommendations.some((r) => r.kind === "weak_city" && r.evidence.length > 0));
  add("rec: missing groups present", h.recommendations.some((r) => r.kind === "missing_groups"));
  add("rec: inactive pages present", h.recommendations.some((r) => r.kind === "inactive_pages"));
  add("rec: missing campaigns (active no exposure)", h.recommendations.some((r) => r.kind === "missing_campaigns"));
  add("rec: opportunity from territory action", h.recommendations.some((r) => r.kind === "opportunity" && r.title.includes("יוקרה")));
  add("rec: sorted high→low impact", h.recommendations[0].impact === "high");

  add("marketplace: only active properties", h.marketplace.length === 2 && !h.marketplace.some((m) => m.id === "pr3"));
  add("marketplace: renew when no/stale exposure", h.marketplace.find((m) => m.id === "pr1")!.recommendRenew === true && h.marketplace.find((m) => m.id === "pr2")!.recommendRenew === true);
  add("marketplace: high priority for no-exposure/high-score", h.marketplace[0].priority === "high");

  add("performance: top groups + campaigns", h.performance.topGroups[0].name === "נדל״ן חיפה" && h.performance.topCampaigns[0].name === "פרויקט ים");

  const disc = assembleFacebookHome(base({ connection: { metaStatus: "not_configured", extensionStatus: "not_paired", connected: false, warnings: [] } }));
  add("disconnected → note added", disc.notes.some((n) => n.includes("אינו מחובר")));

  const empty = assembleFacebookHome(base({ groups: [], campaigns: [], scheduled: [], properties: [], weakAreas: [], missingAreas: [], territoryActions: [], needsReplyItems: [], leadCandidates: [] }));
  add("empty-safe", empty.groups.best.length === 0 && empty.marketplace.length === 0 && empty.recommendations.length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
