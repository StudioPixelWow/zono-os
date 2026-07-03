// ============================================================================
// 📘 ZONO — Facebook Groups Campaign — WIZARD PLANNER (pure). 33.2.
// The one genuinely-new piece: turns a property + selected groups + a frequency
// into a dated posting Gantt with anti-repetition (variation rotation), per-cell
// status, and risk warnings for aggressive schedules. It plans ONLY — it never
// publishes. It reuses the EXISTING distribution data model (groups/posts/
// schedule) conceptually; no new tables. Everything remains approval-gated.
// ============================================================================

export type Frequency = "one_time" | "three_weekly" | "daily" | "full_month" | "custom";
export const FREQUENCY_HE: Record<Frequency, string> = {
  one_time: "פעם אחת", three_weekly: "3 פעמים בשבוע", daily: "כל יום", full_month: "קמפיין חודשי מלא", custom: "מותאם אישית",
};

export type SlotStatus = "draft" | "waiting_approval" | "approved" | "scheduled" | "published" | "failed" | "needs_review" | "cancelled";
export const SLOT_STATUS_HE: Record<SlotStatus, string> = {
  draft: "טיוטה", waiting_approval: "ממתין לאישור", approved: "מאושר", scheduled: "מתוזמן", published: "פורסם", failed: "נכשל", needs_review: "לבדיקה", cancelled: "בוטל",
};

export interface WizardGroup { id: string; name: string; category: string | null; city: string | null; url: string | null; membersCount: number; lastPostAt: string | null }
export interface GroupFolder { name: string; groups: WizardGroup[] }

export interface ScheduleSlot { groupId: string; groupName: string; date: string; variationIndex: number; status: SlotStatus }
export interface GanttCell { groupId: string; date: string; slot: ScheduleSlot | null }
export interface Gantt { dates: string[]; rows: { groupId: string; groupName: string; cells: GanttCell[] }[] }

export interface RiskWarning { level: "info" | "warning" | "danger"; message: string }

export interface CampaignPlan {
  frequency: Frequency; startDate: string; horizonDays: number; variations: number;
  slots: ScheduleSlot[]; gantt: Gantt; totalPosts: number; risks: RiskWarning[];
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Group the flat group list into folders by category (the "Group Folders"). */
export function foldersFromGroups(groups: WizardGroup[]): GroupFolder[] {
  const by = new Map<string, WizardGroup[]>();
  for (const g of groups) { const k = g.category?.trim() || "כללי"; (by.get(k) ?? by.set(k, []).get(k)!).push(g); }
  return [...by.entries()].map(([name, gs]) => ({ name, groups: gs.sort((a, b) => b.membersCount - a.membersCount) })).sort((a, b) => b.groups.length - a.groups.length);
}

/** Cadence (day offsets from start, within one week) per frequency. */
function cadence(freq: Frequency, horizonDays: number): number[] {
  const out: number[] = [];
  if (freq === "one_time") return [0];
  if (freq === "three_weekly") { for (let w = 0; w * 7 < horizonDays; w++) out.push(w * 7 + 0, w * 7 + 2, w * 7 + 4); }
  else if (freq === "daily") { for (let d = 0; d < horizonDays; d++) out.push(d); }
  else if (freq === "full_month") { for (let d = 0; d < horizonDays; d += 3) out.push(d); } // every 3 days
  return out.filter((d) => d < horizonDays);
}

function defaultHorizon(freq: Frequency): number {
  return freq === "one_time" ? 1 : freq === "three_weekly" ? 14 : freq === "daily" ? 14 : freq === "full_month" ? 30 : 14;
}

/** Build the dated schedule with variation rotation (anti-repetition):
 *  a group never gets the same variation on consecutive posts, and groups are
 *  offset from each other so the same text isn't blasted everywhere at once. */
export function generateSchedule(groups: WizardGroup[], freq: Frequency, startISO: string, opts: { variations?: number; horizonDays?: number; customDates?: string[] } = {}): ScheduleSlot[] {
  const variations = Math.max(1, opts.variations ?? 4);
  const horizonDays = opts.horizonDays ?? defaultHorizon(freq);
  const start = new Date(startISO + "T09:00:00").getTime();
  const offsets = freq === "custom" ? (opts.customDates ?? []).map((d) => Math.max(0, Math.round((new Date(d).getTime() - start) / DAY))) : cadence(freq, horizonDays);
  const slots: ScheduleSlot[] = [];
  groups.forEach((g, gi) => {
    offsets.forEach((off, si) => {
      // rotate variation per slot, offset by group so simultaneous posts differ
      const variationIndex = (si + gi) % variations;
      slots.push({ groupId: g.id, groupName: g.name, date: iso(start + off * DAY), variationIndex, status: "draft" });
    });
  });
  return slots;
}

export function buildGantt(slots: ScheduleSlot[], groups: WizardGroup[]): Gantt {
  const dates = [...new Set(slots.map((s) => s.date))].sort();
  const byKey = new Map(slots.map((s) => [`${s.groupId}|${s.date}`, s]));
  const rows = groups.map((g) => ({ groupId: g.id, groupName: g.name, cells: dates.map((date) => ({ groupId: g.id, date, slot: byKey.get(`${g.id}|${date}`) ?? null })) }));
  return { dates, rows };
}

/** Aggressive-schedule + policy risk warnings (no spam behavior). */
export function assessRisks(slots: ScheduleSlot[], groups: WizardGroup[]): RiskWarning[] {
  const out: RiskWarning[] = [];
  // posts per group per 7-day window
  const perGroup = new Map<string, string[]>();
  for (const s of slots) (perGroup.get(s.groupId) ?? perGroup.set(s.groupId, []).get(s.groupId)!).push(s.date);
  let maxWeekly = 0;
  for (const dates of perGroup.values()) {
    const times = dates.map((d) => new Date(d).getTime()).sort();
    for (let i = 0; i < times.length; i++) { const c = times.filter((t) => t >= times[i] && t < times[i] + 7 * DAY).length; maxWeekly = Math.max(maxWeekly, c); }
  }
  if (maxWeekly >= 5) out.push({ level: "danger", message: `תדירות גבוהה מדי — עד ${maxWeekly} פוסטים לקבוצה בשבוע. סיכון להסרה/חסימה. מומלץ לצמצם.` });
  else if (maxWeekly === 4) out.push({ level: "warning", message: "תדירות גבוהה (4 בשבוע לקבוצה). ודאו שזה תואם את חוקי הקבוצות." });
  const sameDay = new Map<string, number>();
  for (const s of slots) sameDay.set(s.date, (sameDay.get(s.date) ?? 0) + 1);
  const maxDay = Math.max(0, ...sameDay.values());
  if (maxDay > groups.length) out.push({ level: "warning", message: `ריכוז פוסטים ביום בודד (${maxDay}). מומלץ לפזר על פני מספר ימים.` });
  out.push({ level: "info", message: "כל פוסט נוצר עם וריאציית טקסט שונה כדי למנוע חזרתיות. שום דבר לא מתפרסם ללא חיבור פייסבוק ואישור מפורש." });
  return out;
}

export function buildPlan(groups: WizardGroup[], freq: Frequency, startISO: string, opts: { variations?: number; horizonDays?: number; customDates?: string[] } = {}): CampaignPlan {
  const variations = Math.max(1, opts.variations ?? 4);
  const slots = generateSchedule(groups, freq, startISO, opts);
  const gantt = buildGantt(slots, groups);
  return { frequency: freq, startDate: startISO, horizonDays: opts.horizonDays ?? defaultHorizon(freq), variations, slots, gantt, totalPosts: slots.length, risks: assessRisks(slots, groups) };
}
