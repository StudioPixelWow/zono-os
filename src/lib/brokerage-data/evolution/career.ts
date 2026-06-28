// ============================================================================
// ZONO Brokerage Evolution — Agent Career engine (pure).
// Career timeline scoring: experience, stability, growth, expertise. From the
// agent's activity series + office-change/inactive history. Deterministic.
// ============================================================================
import type { CareerInput, CareerProfile } from "./types";

const MONTH = 30 * 86_400_000;

/** Linear-ish slope of an activity series (last vs first half), -1..1-ish. */
function trend(series: { listings: number }[]): number {
  if (series.length < 2) return 0;
  const mid = Math.floor(series.length / 2);
  const first = series.slice(0, mid).reduce((a, b) => a + b.listings, 0) / Math.max(1, mid);
  const second = series.slice(mid).reduce((a, b) => a + b.listings, 0) / Math.max(1, series.length - mid);
  if (first === 0 && second === 0) return 0;
  return (second - first) / Math.max(1, first + second);
}

export function computeCareer(input: CareerInput): CareerProfile {
  const now = Date.now();
  const first = input.firstSeen ? new Date(input.firstSeen).getTime() : now;
  const experienceMonths = Math.max(0, Math.round((now - first) / MONTH));

  // Stability: long tenure + few office changes + few inactive gaps.
  const tenureScore = Math.min(60, (experienceMonths / 60) * 60); // 5y → 60
  const changePenalty = Math.min(30, input.officeChanges * 12);
  const gapPenalty = Math.min(20, input.inactiveGaps * 8);
  const stabilityScore = Math.round(Math.max(0, Math.min(100, 50 + tenureScore - changePenalty - gapPenalty)));

  // Growth: activity trend, centered at 50 (flat).
  const tr = trend(input.activitySeries);
  const growthScore = Math.round(Math.max(0, Math.min(100, 50 + tr * 50)));

  // Career: blend of experience, stability and recent activity volume.
  const recentVolume = input.activitySeries.slice(-3).reduce((a, b) => a + b.listings, 0);
  const volumeScore = Math.min(100, recentVolume * 6);
  const careerScore = Math.round(Math.max(0, Math.min(100, stabilityScore * 0.4 + Math.min(100, (experienceMonths / 36) * 100) * 0.3 + volumeScore * 0.3)));

  const expertise: string[] = [];
  if (input.specialization) expertise.push(input.specialization);
  if (experienceMonths >= 60) expertise.push("ותיק (5+ שנים)");
  else if (experienceMonths >= 24) expertise.push("מנוסה");
  if (growthScore >= 65) expertise.push("בצמיחה");
  else if (growthScore <= 35) expertise.push("בירידה");

  const explanation = `ניסיון ~${Math.round(experienceMonths / 12)} שנים · ${input.officeChanges} מעברי משרד · ${input.inactiveGaps} תקופות לא פעילות. יציבות ${stabilityScore}% · צמיחה ${growthScore}% · קריירה ${careerScore}%.`;
  return { experienceMonths, careerScore, stabilityScore, growthScore, expertise, explanation };
}
