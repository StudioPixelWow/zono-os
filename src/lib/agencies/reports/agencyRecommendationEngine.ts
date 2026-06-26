// ============================================================================
// ZONO — Agency recommendation engine (Phase 26.7, PURE, client-safe).
// Turns the real snapshot + stored signals into actionable, prioritized
// recommendations. Each is grounded in data (no invented advice) and links back
// to its source signal/territory for auditability.
// ============================================================================
import type { AgencyReportSnapshot, AgencyRecommendation } from "./agencyReportTypes";

export function generateAgencyRecommendations(s: AgencyReportSnapshot): AgencyRecommendation[] {
  const out: AgencyRecommendation[] = [];
  const sc = s.scores;
  const seen = new Set<string>();
  const push = (key: string, rec: AgencyRecommendation) => { if (!seen.has(key)) { seen.add(key); out.push(rec); } };

  for (const sig of s.signals) {
    const area = sig.territoryLabel;
    const conf = Math.min(1, (sig.importance ?? 50) / 100 + 0.2);
    switch (sig.signalType) {
      case "user_weak_area":
        push(`weak_${area}`, { title: `הגדלת פנייה יזומה ל${area ?? "אזור החולשה"}`, reason: "נוכחות נמוכה באזור עם פעילות קיימת.", priority: "high", relatedSignalId: sig.id, relatedTerritory: area, confidence: conf });
        break;
      case "territory_opportunity":
      case "low_competition_area":
        push(`opp_${area}`, { title: `השקת קמפיין ב${area ?? "אזור ההזדמנות"}`, reason: "ביקוש/פוטנציאל גבוה מול תחרות נמוכה.", priority: "medium", relatedSignalId: sig.id, relatedTerritory: area, confidence: conf });
        break;
      case "competitor_momentum":
        push(`watch_${area}`, { title: `מעקב אחר מתחרה בצמיחה מהירה${area ? ` ב${area}` : ""}`, reason: "מתחרה צובר תאוצה — לעקוב ולהגיב.", priority: "medium", relatedSignalId: sig.id, relatedTerritory: area, confidence: conf });
        break;
      case "high_competition_threat":
      case "competitor_dominance":
        push(`defend_${area}`, { title: `חיזוק נוכחות${area ? ` ב${area}` : ""} מול שליטת מתחרה`, reason: "מתחרה שולט/מאיים באזור פעילות.", priority: "high", relatedSignalId: sig.id, relatedTerritory: area, confidence: conf });
        break;
      case "agency_inventory_loss":
        push(`inv_${area}`, { title: `שחזור מלאי${area ? ` ב${area}` : ""}`, reason: "ירידה במלאי הפעיל — להגביר גיוס מוכרים.", priority: "high", relatedSignalId: sig.id, relatedTerritory: area, confidence: conf });
        break;
    }
  }

  // Luxury gap — only when luxury share is measurably absent in active inventory.
  if ((s.territory.luxuryShare ?? 1) < 0.05 && s.territory.activeListings >= 5) {
    push("luxury_gap", { title: "כניסה לנכסי יוקרה", reason: "מלאי פעיל ללא נתח יוקרה — פוטנציאל לבידול.", priority: "medium", confidence: 0.5 });
  }

  // Low data confidence → manual review (always grounded).
  if ((sc.dataConfidence ?? 100) < 40) {
    push("manual_review", { title: "סקירה ידנית של המשרד", reason: "רמת ביטחון נתונים נמוכה — לאמת ולהשלים נתונים לפני החלטות.", priority: "high", confidence: 0.9 });
  }

  // Sort: priority then confidence.
  const rank = { high: 3, medium: 2, low: 1 } as const;
  return out.sort((a, b) => (rank[b.priority] - rank[a.priority]) || (b.confidence - a.confidence));
}
