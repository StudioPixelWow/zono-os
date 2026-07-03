// ============================================================================
// 📣 Marketing Core — audience engine (pure). 33.0.
// Derives marketing segments from the REUSED CRM digital-twin totals. Every
// segment carries its real size + evidence. No fabricated audiences.
// ============================================================================
import type { CampaignAudience, AudienceKind, MarketingInput } from "./types";
import { AUDIENCE_HE } from "./types";

function seg(kind: AudienceKind, size: number, segmentOf: CampaignAudience["segmentOf"], evidence: string[], matchQuality: number): CampaignAudience {
  return { kind, label: AUDIENCE_HE[kind], size, matchQuality, evidence, segmentOf };
}

/** All available marketing audiences for the org (only non-empty ones).
 *  For overlapping segments (luxury / investors) it DEFERS to the existing
 *  marketing engine's persisted segment sizes instead of re-segmenting. */
export function buildAudiences(input: MarketingInput): CampaignAudience[] {
  const b = input.buyers, s = input.sellers, l = input.leads;
  const persisted = new Map((input.existing?.segments ?? []).map((x) => [x.key, x]));
  const luxSize = persisted.get("luxury")?.size ?? b.luxury;
  const invSize = persisted.get("investors")?.size ?? b.investors;
  const all: CampaignAudience[] = [
    seg("buyers", b.total, "buyer", [`${b.total} קונים במערכת`, `${b.hot} חמים`], b.total ? 80 : 0),
    seg("sellers", s.total, "seller", [`${s.total} מוכרים במערכת`, `${s.readyToSign} בשלים לחתימה`], s.total ? 80 : 0),
    seg("leads", l.total, "lead", [`${l.total} לידים`, `${l.qualified} מוסמכים`], l.total ? 70 : 0),
    seg("investors", invSize, "buyer", [`${invSize} משקיעים מזוהים`], invSize ? 85 : 0),
    seg("luxury", luxSize, "buyer", [`${luxSize} קונים בפרופיל יוקרה`], luxSize ? 88 : 0),
    seg("dormant", b.dormant + l.stale, "buyer", [`${b.dormant} קונים רדומים`, `${l.stale} לידים ישנים`], (b.dormant + l.stale) ? 65 : 0),
    seg("high_value", b.highValue + s.highValue, "buyer", [`${b.highValue} קונים בעלי ערך גבוה`, `${s.highValue} מוכרים בעלי ערך גבוה`], (b.highValue + s.highValue) ? 82 : 0),
    seg("repeat", 0, "market", ["לקוחות חוזרים — נגזר ממסע הלקוח"], 0),
    seg("neighborhood", input.listings.topNeighborhoods.length, "market", input.listings.topNeighborhoods.slice(0, 3).map((n) => `אזור: ${n}`), input.listings.topNeighborhoods.length ? 60 : 0),
  ];
  return all.filter((a) => a.size > 0).sort((a, b2) => b2.matchQuality - a.matchQuality || b2.size - a.size);
}

/** Pick the best audience(s) for an objective. */
export function audiencesFor(kinds: AudienceKind[], input: MarketingInput): CampaignAudience[] {
  const av = buildAudiences(input);
  return kinds.map((k) => av.find((a) => a.kind === k)).filter((a): a is CampaignAudience => !!a);
}
