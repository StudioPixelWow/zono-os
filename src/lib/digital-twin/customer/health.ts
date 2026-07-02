// ============================================================================
// 🧭 Customer Journey — customer health model (pure). 28.5. Part 6.
// Relationship health, activity, trust, lifetime value, future value, retention
// risk and referral potential — merged across every lifecycle role. Evidence-
// based; magnitudes come from real budgets / prices only.
// ============================================================================
import { clamp } from "../core";
import type { MemberSummary, CustomerRole, CustomerHealth } from "./types";

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0);

export function computeCustomerHealth(members: MemberSummary[], roles: CustomerRole[], mergedRecency: number, mergedEngagement: number): CustomerHealth {
  const trust = members.length ? Math.max(...members.map((m) => m.trust)) : 0;
  const relDegree = members.reduce((s, m) => s + m.relationshipDegree, 0);
  const relationshipHealth = clamp(mean(members.map((m) => m.healthScore)) + Math.min(20, relDegree * 2));
  const activity = clamp(mergedEngagement * 0.6 + mergedRecency * 0.4);

  const values = members.map((m) => m.value ?? 0).filter((v) => v > 0);
  const ltvEstimate = values.length ? Math.round(values.reduce((s, v) => s + v, 0)) : null;
  const valueMag = ltvEstimate == null ? 0 : ltvEstimate >= 6_000_000 ? 35 : ltvEstimate >= 3_000_000 ? 25 : ltvEstimate >= 1_000_000 ? 15 : 8;
  const roleBreadth = Math.min(30, roles.length * 8);
  const dealBonus = members.some((m) => m.dealSignal) ? 20 : 0;
  const lifetimeValue = clamp(valueMag + roleBreadth + dealBonus);

  const intentMax = members.length ? Math.max(...members.map((m) => m.intentScore)) : 0;
  const referralPotential = clamp((roles.includes("referral") ? 30 : 0) + (members.some((m) => m.dealSignal) ? trust * 0.4 : trust * 0.2) + (roles.includes("repeat_client") ? 20 : 0));
  const futureValue = clamp(intentMax * 0.45 + referralPotential * 0.3 + (roles.includes("repeat_client") ? 20 : 0) + (roles.includes("investor") ? 15 : 0));
  const retentionRisk = clamp(100 - mergedRecency * 0.6 - trust * 0.3 - (members.some((m) => m.dealSignal) ? 10 : 0));

  return {
    relationshipHealth, activity, trust: clamp(trust),
    lifetimeValue, futureValue, retentionRisk, referralPotential, ltvEstimate,
    basis: [
      `${members.length} תפקידים · אמון ${clamp(trust)} · פעילות ${activity}`,
      ltvEstimate != null ? `ערך מצטבר ~${ltvEstimate.toLocaleString("he-IL")} ₪` : "אין ערך כספי מתועד",
      `כוונה ${intentMax} · פוטנציאל הפניה ${referralPotential}`,
    ],
  };
}
