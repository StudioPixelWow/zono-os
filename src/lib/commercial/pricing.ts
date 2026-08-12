// ============================================================================
// ZONO — Flat pricing model (PURE, client-safe). ONE product plan: 197 ₪ per
// ACTIVE AGENT (seat) / month, all features open, 14-day free trial. Offices
// with more than 10 agents go to the custom enterprise contact flow (no self-
// serve price). Single source for seat math + trial state.
// ============================================================================
import { STANDARD_SEAT_PRICE_ILS, TRIAL_DAYS, ENTERPRISE_SEAT_THRESHOLD } from "@/lib/launch/types";

const _dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });
/** UTC instant → Israel calendar day 'YYYY-MM-DD' (DST-aware). */
function israelDayKey(instant: string | number | Date): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return Number.isNaN(d.getTime()) ? "" : _dayFmt.format(d);
}

export const SEAT_PRICE_ILS = STANDARD_SEAT_PRICE_ILS; // 197
export { TRIAL_DAYS, ENTERPRISE_SEAT_THRESHOLD };

// ── Seat billing ────────────────────────────────────────────────────────────
export interface SeatBilling { seats: number; unitPriceIls: number; totalIls: number; isEnterprise: boolean }
/** 197 ₪ × active agents. >10 agents → enterprise (custom pricing, no self-serve total). */
export function computeSeatBilling(activeSeats: number): SeatBilling {
  const seats = Math.max(0, Math.floor(activeSeats || 0));
  const isEnterprise = seats > ENTERPRISE_SEAT_THRESHOLD;
  return { seats, unitPriceIls: SEAT_PRICE_ILS, totalIls: seats * SEAT_PRICE_ILS, isEnterprise };
}
/** Self-serve standard is only offered up to the enterprise threshold (10 agents). */
export function isSelfServeSeatCount(seats: number): boolean {
  return seats >= 1 && seats <= ENTERPRISE_SEAT_THRESHOLD;
}

// ── Trial ───────────────────────────────────────────────────────────────────
export type TrialState = "trialing" | "active" | "past_due" | "canceled" | "expired" | "enterprise";
export interface TrialInfo { started: string | null; endsAt: string | null; daysRemaining: number | null; expired: boolean }
/** 14 days from the trial start (Israel calendar day for display). */
export function trialEndsAtIso(startIso: string): string {
  const start = new Date(startIso).getTime();
  return new Date(start + TRIAL_DAYS * 86_400_000).toISOString();
}
/** Whole days remaining until trial end (0 when passed). null when no trial. */
export function trialDaysRemaining(trialEndsAt: string | null, nowMs: number): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - nowMs) / 86_400_000));
}
export function computeTrialInfo(startIso: string | null, endsAtIso: string | null, nowMs: number): TrialInfo {
  const endsAt = endsAtIso ?? (startIso ? trialEndsAtIso(startIso) : null);
  const daysRemaining = trialDaysRemaining(endsAt, nowMs);
  return { started: startIso, endsAt, daysRemaining, expired: daysRemaining === 0 && endsAt !== null };
}

// ── Display helpers (₪ formatting) ──────────────────────────────────────────
export function formatIls(amount: number): string { return `${amount.toLocaleString("he-IL")} ₪`; }
/** e.g. "5 סוכנים · 197 ₪ לסוכן · סה״כ 985 ₪ לחודש" */
export function seatBillingSummaryHe(b: SeatBilling): string {
  if (b.isEnterprise) return `${b.seats} סוכנים · תמחור בהתאמה אישית`;
  return `${b.seats} ${b.seats === 1 ? "סוכן" : "סוכנים"} · ${formatIls(b.unitPriceIls)} לסוכן · סה״כ ${formatIls(b.totalIls)} לחודש`;
}
/** Israel-day key for a trial end date (display). */
export function trialEndDayHe(endsAt: string | null): string { return endsAt ? israelDayKey(endsAt) : "—"; }
