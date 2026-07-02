// ============================================================================
// 🏢 Office Growth Agent — Inventory + Broker Performance engines (pure). 29.7.
// Parts 2 + 3. Evidence-only: only real signals produce a finding, each with WHY.
// Reuses Broker Intelligence output (broker cards) — no re-derivation.
// ============================================================================
import type { OfficeSignals, InventoryFinding, BrokerFinding } from "./types";

const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);

// ── Part 2 — Inventory Intelligence ─────────────────────────────────────────
export function detectInventory(sig: OfficeSignals): InventoryFinding[] {
  const out: InventoryFinding[] = [];
  const total = sig.listingPipeline.total;
  const perBroker = ratio(sig.activeListings, Math.max(1, sig.brokers));

  // Shortage vs. surplus (relative to broker capacity).
  if (sig.brokers > 0 && perBroker < 2 && total > 0) out.push({ type: "inventory_shortage", title: "מחסור במלאי", why: "מעט נכסים פעילים ביחס למספר המתווכים — יש קיבולת לא מנוצלת.", evidence: [`${sig.activeListings} נכסים · ${sig.brokers} מתווכים (${perBroker.toFixed(1)}/מתווך)`], impact: "high" });
  else if (perBroker > 12) out.push({ type: "inventory_surplus", title: "עודף מלאי", why: "יותר מדי נכסים פעילים למתווך — סיכון לטיפול חלקי ולנכסים מתיישנים.", evidence: [`${perBroker.toFixed(1)} נכסים/מתווך`, `${sig.listingPipeline.stale} מתיישנים`], impact: "medium" });

  // Strong vs. weak neighborhoods (city distribution + territory).
  const inv = [...sig.cityInventory].sort((a, b) => b.listings - a.listings);
  if (inv.length >= 2) {
    const avg = inv.reduce((n, c) => n + c.listings, 0) / inv.length;
    const strong = inv.filter((c) => c.listings >= avg * 1.5);
    const weak = inv.filter((c) => c.listings > 0 && c.listings <= Math.max(1, avg * 0.4));
    if (strong[0]) out.push({ type: "strong_neighborhood", title: `שכונות/ערים חזקות: ${strong.slice(0, 3).map((c) => c.city).join(", ")}`, why: "ריכוז מלאי גבוה מהממוצע — בסיס לחיזוק המובילות ולמינוף שיווקי.", evidence: strong.slice(0, 3).map((c) => `${c.city}: ${c.listings} נכסים`), impact: "medium" });
    if (weak[0]) out.push({ type: "weak_neighborhood", title: `שכונות/ערים חלשות: ${weak.slice(0, 3).map((c) => c.city).join(", ")}`, why: "מלאי נמוך משמעותית מהממוצע — כיסוי חסר מול המתחרים.", evidence: weak.slice(0, 3).map((c) => `${c.city}: ${c.listings} נכסים`), impact: "medium" });
  }
  for (const a of sig.strongAreas.slice(0, 1)) if (!out.some((f) => f.type === "strong_neighborhood")) out.push({ type: "strong_neighborhood", title: `אזור חזק: ${a}`, why: "טריטוריה עם נוכחות מובילה לפי Territory Intelligence.", evidence: [a], impact: "medium" });
  for (const a of sig.weakAreas.slice(0, 1)) if (!out.some((f) => f.type === "weak_neighborhood")) out.push({ type: "weak_neighborhood", title: `אזור חלש: ${a}`, why: "טריטוריה עם כיסוי חסר לפי Territory Intelligence.", evidence: [a], impact: "medium" });

  // Property-type imbalance (luxury skew as the observable proxy).
  if (total >= 5) {
    const luxShare = ratio(sig.listingPipeline.luxury, total);
    if (luxShare >= 0.6) out.push({ type: "property_type_imbalance", title: "חוסר איזון בסוגי נכסים", why: "רוב המלאי בקטגוריה אחת (יוקרה) — תלות-יתר וחשיפה לסיכון ביקוש.", evidence: [`${sig.listingPipeline.luxury}/${total} יוקרה`], impact: "medium" });
  }

  // Missing luxury / commercial inventory.
  if (total >= 4 && sig.listingPipeline.luxury === 0) out.push({ type: "missing_luxury", title: "אין מלאי יוקרה", why: "לא זוהו נכסי יוקרה — פלח שוק בעל שולי רווח גבוהים שאינו מכוסה.", evidence: [`0/${total} יוקרה`], impact: "medium" });
  if (total >= 4 && sig.commercialListings === 0) out.push({ type: "missing_commercial", title: "אין מלאי מסחרי", why: "לא זוהו נכסים מסחריים — הזדמנות הרחבה לפלח המסחרי.", evidence: [`0/${total} מסחרי`], impact: "low" });

  return out;
}

// ── Part 3 — Broker Performance (reuses Broker Intelligence cards) ───────────
const ACTIVE = new Set(["ACTIVE", "RECENTLY_ACTIVE", "פעיל", "פעיל לאחרונה"]);
const INACTIVE = new Set(["INACTIVE", "לא פעיל"]);
const LOW = new Set(["LOW_ACTIVITY", "פעילות נמוכה"]);

export function detectBrokerPerformance(sig: OfficeSignals): BrokerFinding[] {
  const out: BrokerFinding[] = [];
  const cards = sig.brokerCards;
  const perBroker = ratio(sig.activeListings, Math.max(1, sig.brokers));

  if (cards.length) {
    const top = [...cards].sort((a, b) => b.activeListings - a.activeListings).filter((c) => c.activeListings > 0).slice(0, 3);
    if (top[0]) out.push({ type: "top_performer", title: `מובילים: ${top.map((c) => c.name).join(", ")}`, why: "מספר הנכסים הפעילים הגבוה ביותר — מומלץ לתגמל ולשכפל שיטות עבודה.", evidence: top.map((c) => `${c.name}: ${c.activeListings} פעילים`), impact: "medium" });

    const declining = cards.filter((c) => LOW.has(c.status) || (c.activeListings > 0 && c.recentListings === 0));
    if (declining[0]) out.push({ type: "declining_broker", title: `מתווכים בירידה: ${declining.slice(0, 3).map((c) => c.name).join(", ")}`, why: "פעילות יורדת/ללא רישומים חדשים לאחרונה — נדרש ליווי לפני נטישה.", evidence: declining.slice(0, 3).map((c) => `${c.name}: ${c.recentListings} חדשים`), impact: "high" });

    const inactive = cards.filter((c) => INACTIVE.has(c.status) || (c.activeListings === 0 && c.recentListings === 0));
    if (inactive[0]) out.push({ type: "inactive_broker", title: `לא פעילים: ${inactive.slice(0, 3).map((c) => c.name).join(", ")}`, why: "אין נכסים פעילים/חדשים — קיבולת שאינה מייצרת תוצאה.", evidence: inactive.slice(0, 3).map((c) => c.name), impact: "medium" });

    const overloaded = cards.filter((c) => ACTIVE.has(c.status) && c.activeListings >= 15);
    if (overloaded[0]) out.push({ type: "overloaded_broker", title: `עומס יתר: ${overloaded.slice(0, 3).map((c) => c.name).join(", ")}`, why: "מספר נכסים גבוה מאוד למתווך — סיכון לטיפול חלקי; שקול הקצאה מחדש.", evidence: overloaded.slice(0, 3).map((c) => `${c.name}: ${c.activeListings} פעילים`), impact: "medium" });

    const spare = cards.filter((c) => ACTIVE.has(c.status) && c.activeListings <= 1);
    if (spare[0]) out.push({ type: "unused_capacity", title: `קיבולת פנויה: ${spare.slice(0, 3).map((c) => c.name).join(", ")}`, why: "מתווכים פעילים עם מעט מאוד נכסים — ניתן להקצות להם מלאי/לידים.", evidence: spare.slice(0, 3).map((c) => c.name), impact: "medium" });
  }

  // Recruitment / training (org-level, evidence from ratios).
  if (sig.brokers > 0 && perBroker > 10) out.push({ type: "recruitment_need", title: "צורך בגיוס מתווכים", why: "עומס נכסים גבוה לכלל המתווכים — גיוס יגדיל את הקיבולת ואת ההמרה.", evidence: [`${perBroker.toFixed(1)} נכסים/מתווך`], impact: "high" });
  else if (sig.brokers === 0 && sig.activeListings > 0) out.push({ type: "recruitment_need", title: "צורך בגיוס מתווכים", why: "יש מלאי פעיל אך אין מתווכים מקושרים — נדרש גיוס/שיוך.", evidence: [`${sig.activeListings} נכסים · 0 מתווכים`], impact: "high" });

  const weakConversion = ratio(sig.leadPipeline.convertReady, Math.max(1, sig.leadPipeline.total)) < 0.15 && sig.leadPipeline.total >= 5;
  if (weakConversion || sig.executionScore < 45) out.push({ type: "training_opportunity", title: "הזדמנות הדרכה", why: "המרה/ביצוע נמוכים — הדרכה ממוקדת (המרת לידים/סגירה) תשפר תוצאות.", evidence: [`ביצוע ${sig.executionScore}`, `המרה מוכנה ${sig.leadPipeline.convertReady}/${sig.leadPipeline.total}`], impact: "medium" });

  return out;
}
