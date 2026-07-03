// ============================================================================
// 🗂️ ZONO — Property Marketing Log — timeline assembler (pure). 33.1.x.
// Merges every marketing action taken on a property's file (Facebook-group
// campaigns + posts, comments/leads from those posts, and Creative Studio assets)
// into ONE chronological log with a summary. Read-only, evidence-only; it reuses
// existing data (distribution + creative-studio) and adds no tables.
// ============================================================================

export type MarketingEventKind =
  | "campaign" | "post_scheduled" | "post_published" | "post_failed" | "post_pending"
  | "comment" | "lead" | "creative" | "creative_approved";

export interface MarketingEvent {
  at: string;                       // ISO timestamp the event is anchored to
  kind: MarketingEventKind;
  title: string;
  detail: string;
  status: string | null;
  channel: string | null;           // e.g. "facebook_group", group name
  url: string | null;               // external post/link if public-safe
  source: "distribution" | "creative-studio";
}

export interface MarketingLogSummary {
  campaigns: number; scheduled: number; published: number; failed: number;
  comments: number; leads: number; creatives: number; totalReach: number; totalLeads: number;
  firstAt: string | null; lastAt: string | null;
}

export interface MarketingLog { events: MarketingEvent[]; summary: MarketingLogSummary; isEmpty: boolean }

const ts = (e: MarketingEvent) => new Date(e.at).getTime();

export function buildMarketingLog(events: MarketingEvent[], meta: { totalReach?: number; totalLeads?: number } = {}): MarketingLog {
  const sorted = [...events].filter((e) => e.at).sort((a, b) => ts(b) - ts(a));
  const count = (k: MarketingEventKind) => sorted.filter((e) => e.kind === k).length;
  const summary: MarketingLogSummary = {
    campaigns: count("campaign"),
    scheduled: count("post_scheduled") + count("post_pending"),
    published: count("post_published"),
    failed: count("post_failed"),
    comments: count("comment"),
    leads: count("lead"),
    creatives: count("creative") + count("creative_approved"),
    totalReach: meta.totalReach ?? 0,
    totalLeads: meta.totalLeads ?? 0,
    firstAt: sorted.length ? sorted[sorted.length - 1].at : null,
    lastAt: sorted.length ? sorted[0].at : null,
  };
  return { events: sorted, summary, isEmpty: sorted.length === 0 };
}

/** Group the log by day (for a segmented timeline UI). Newest day first. */
export function groupByDay(log: MarketingLog): { day: string; events: MarketingEvent[] }[] {
  const by = new Map<string, MarketingEvent[]>();
  for (const e of log.events) { const day = e.at.slice(0, 10); (by.get(day) ?? by.set(day, []).get(day)!).push(e); }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, events]) => ({ day, events }));
}
