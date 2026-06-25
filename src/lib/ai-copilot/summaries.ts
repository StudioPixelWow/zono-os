// ============================================================================
// ZONO — smart summaries (pure builders + deterministic fallbacks).
// Morning/evening briefs + entity summaries. All numbers come from the
// deterministic engines; the AI only phrases them. Fallbacks are real, readable
// Hebrew briefs so the feature works with no AI provider.
// ============================================================================
import type { MorningBriefContext, OfficeBriefContext, SellerCallContext } from "./types";

const ACTION_HE: Record<string, string> = {
  call_today: "להתקשר היום", send_whatsapp: "וואטסאפ", schedule_meeting: "לקבוע פגישה", follow_up_tomorrow: "מעקב מחר", wait: "להמתין",
};

export function buildMorningBrief(c: MorningBriefContext): { instruction: string; fallback: string } {
  const prio = c.topPriorities.slice(0, 5).map((p, i) => `${i + 1}. ${p.label} — ${p.probability}% (${ACTION_HE[p.action] ?? p.action})`).join("\n");
  const hot = c.hotOpportunities.slice(0, 3).map((h) => `• ${h.label} — ${h.probability}%`).join("\n");
  const fallback = [
    "תדריך בוקר — ZONO",
    `עדיפויות להיום:\n${prio || "אין עדיפויות פתוחות"}`,
    `הזדמנויות חמות:\n${hot || "—"}`,
    `מצב צבירה: ${c.totals.profiles} הזדמנויות · ${c.totals.veryHigh} בסבירות גבוהה מאוד · ${c.totals.high} גבוהה · ${c.totals.signed} בלעדיות נחתמו.`,
    `משימות פתוחות: ${c.pendingTasks} · הושלמו אתמול: ${c.completedYesterday}.`,
  ].join("\n\n");
  return {
    instruction: "כתוב תדריך בוקר קצר ומעורר פעולה לסוכן: עדיפויות עליונות, הזדמנויות מובילות, המלצות מוכרים, הזדמנויות קונים, " +
      "עסקאות חמות, דופק שוק, מה הושלם אתמול ומשימות פתוחות. התבסס רק על המספרים שבהקשר. עברית, תכליתי.",
    fallback,
  };
}

export function buildOfficeBrief(c: OfficeBriefContext): { instruction: string; fallback: string } {
  const funnel = c.funnel.filter((s) => s.count > 0).map((s) => `${s.stage}: ${s.count}`).join(" · ");
  const top = c.topOpportunities.slice(0, 5).map((t) => `• ${t.label} — ${t.probability}%`).join("\n");
  const fallback = [
    "תדריך משרד — ZONO",
    `ביצועי משרד: ${c.totals.profiles} הזדמנויות · ${c.totals.signed} בלעדיות נחתמו.`,
    `הזדמנויות בלעדיות מובילות:\n${top || "—"}`,
    `משפך: ${funnel || "—"}`,
    `המלצות: למקד את הצוות ב-${c.totals.veryHigh + c.totals.high} ההזדמנויות בסבירות הגבוהה.`,
  ].join("\n\n");
  return {
    instruction: "כתוב תדריך מנהל משרד: ביצועי משרד, סוכנים מובילים, הזדמנויות בלעדיות, שינויי שוק, פריטי סיכון והמלצות. " +
      "התבסס על ההקשר בלבד. עברית.",
    fallback,
  };
}

export function buildEntitySummary(kind: "property_summary" | "seller_summary" | "buyer_summary", c: SellerCallContext): { instruction: string; fallback: string } {
  const a = c.addressText ?? ([c.neighborhood, c.city].filter(Boolean).join(", ") || "הנכס");
  const fallback = [
    `${a} — ${c.listingType ?? ""} ב${c.city ?? ""}`,
    `מחיר ${c.price != null ? `₪${c.price.toLocaleString("he-IL")}` : "—"} · ${c.daysOnMarket ?? "?"} ימים בשוק · ${c.priceDropCount} ירידות מחיר.`,
    `${c.buyerMatchCount} קונים מתאימים · ציון מוכר ${c.sellerScore} · סבירות בלעדיות ${c.exclusiveProbability}% (${c.exclusiveBand}).`,
    `המלצה: ${ACTION_HE[c.recommendedAction] ?? c.recommendedAction} — ${c.recommendedActionReason}.`,
  ].join("\n");
  return {
    instruction: `סכם ${kind === "buyer_summary" ? "את הקונה" : kind === "seller_summary" ? "את המוכר" : "את הנכס"} ב-3-5 משפטים, ` +
      `תוך ציטוט הציון/הסבירות הדטרמיניסטיים כפי שהם. עברית, תכליתי.`,
    fallback,
  };
}
