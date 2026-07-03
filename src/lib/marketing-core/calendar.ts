// ============================================================================
// 📣 Marketing Core — marketing calendar (pure). 33.0.
// Proposes a launch timeline for the planned campaigns (staggered), with review
// reminders + dependencies. Proposals only — nothing is scheduled or executed.
// ============================================================================
import type { Campaign, CalendarEntry } from "./types";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Stagger campaign launches from `startFrom` (default: 3 days out), highest
 *  priority first, spaced by ~7 days. Adds a review reminder mid-run. */
export function buildCalendar(campaigns: Campaign[], startFrom = Date.now() + 3 * DAY): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  campaigns.forEach((c, i) => {
    const launch = startFrom + i * 7 * DAY;
    out.push({ campaignId: c.id, name: c.name, date: iso(launch), kind: "launch", note: `השקה מוצעת · ${c.goal.objective}` });
    out.push({ campaignId: c.id, name: c.name, date: iso(launch - 2 * DAY), kind: "reminder", note: "תזכורת: אישורים + נכסים" });
    out.push({ campaignId: c.id, name: c.name, date: iso(launch + Math.round(c.timeline.durationDays / 2) * DAY), kind: "review", note: "נקודת בחינת ביצועים" });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Apply the proposed launch dates back onto campaign timelines (pure copy). */
export function withProposedDates(campaigns: Campaign[], calendar: CalendarEntry[]): Campaign[] {
  const launchByCampaign = new Map(calendar.filter((e) => e.kind === "launch").map((e) => [e.campaignId, e.date]));
  return campaigns.map((c) => ({ ...c, timeline: { ...c.timeline, proposedLaunch: launchByCampaign.get(c.id) ?? null } }));
}
