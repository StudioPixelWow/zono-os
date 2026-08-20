// ============================================================================
// ZONO — Next Best Action + opportunity explanation (pure).
// The action is MAPPED from the deterministic Seller Intelligence recommendation
// — the AI never decides it. AI only EXPLAINS the deterministic verdict. The
// copilot recommends; it never executes automatically.
// ============================================================================
import type { NextBestActionKind, SellerCallContext } from "./types";

const NBA_LABEL: Record<NextBestActionKind, string> = {
  call: "להתקשר", whatsapp: "לשלוח וואטסאפ", wait: "להמתין", schedule_meeting: "לקבוע פגישה",
  reduce_price: "להמליץ על עדכון מחיר", invite_buyer: "להזמין קונה", create_reminder: "ליצור תזכורת",
};

/** Map the deterministic recommended action → a Next Best Action (no AI decision). */
export function nextBestAction(c: SellerCallContext): { kind: NextBestActionKind; label: string; reason: string } {
  const map: Record<string, NextBestActionKind> = {
    call_today: "call", send_whatsapp: "whatsapp", schedule_meeting: "schedule_meeting", follow_up_tomorrow: "create_reminder", wait: "wait",
  };
  // Consume the deterministic Seller-Intelligence action VERBATIM — the copilot
  // never mints its own next-best-action (no ad-hoc prioritization in ZI/copilot).
  const kind: NextBestActionKind = map[c.recommendedAction] ?? "wait";
  const reason = c.recommendedActionReason || "בהתאם למנוע מודיעין המוכרים";
  return { kind, label: NBA_LABEL[kind], reason };
}

export function buildExplainOpportunity(c: SellerCallContext): { instruction: string; fallback: string } {
  const a = c.addressText ?? ([c.neighborhood, c.city].filter(Boolean).join(", ") || "הנכס");
  const reasons = c.scoreReasons.length ? c.scoreReasons.map((r) => `• ${r}`).join("\n") : "• אין גורמים בולטים";
  const nba = nextBestAction(c);
  const fallback = [
    `למה ZONO סימן את ${a} כהזדמנות`,
    `ציון מוכר ${c.sellerScore}/100 · סבירות בלעדיות ${c.exclusiveProbability}% (${c.exclusiveBand}).`,
    `גורמים מרכזיים:\n${reasons}`,
    `${c.buyerMatchCount} קונים מתאימים · ${c.priceDropCount} ירידות מחיר · ${c.daysOnMarket ?? "?"} ימים בשוק.`,
    `פעולה מומלצת: ${nba.label} — ${nba.reason}.`,
  ].join("\n\n");
  return {
    instruction: "הסבר בשפה פשוטה מדוע ZONO דירג את ההזדמנות כך, על בסיס הגורמים שבהקשר. אל תשנה את הציון או הסבירות — " +
      "רק הסבר אותם. סיים בפעולה המומלצת (שכבר נקבעה דטרמיניסטית). עברית, קצר.",
    fallback,
  };
}
