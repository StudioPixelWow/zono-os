// ============================================================================
// 📣 ZONO — External Listing Acquisition & Buyer-Match Alerts · pure. 41.2.
// Builds the approval-gated WhatsApp DRAFT text for the two broker alerts on a
// new external (Yad2/Madlan) listing: (A) acquisition — "try to recruit this
// listing", (B) buyer-match — "this fits your buyers". Pure text builders,
// evidence-only. NEVER auto-sent (the service creates a draft the broker approves).
// ============================================================================

export interface AlertListing {
  id: string;
  source: string | null;            // yad2 | madlan | ...
  city: string | null; neighborhood: string | null; street: string | null;
  price: number | null; rooms: number | null; sqm: number | null;
  reason: string | null;            // why it matters (from detail.whyItMatters[0])
}
export interface AlertBuyerMatch { name: string; reasons: string[]; closingProbability: number; commissionOpportunity: number }

const nis = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const SOURCE_HE: Record<string, string> = { yad2: "יד2", madlan: "מדלן" };
const sourceLabel = (s: string | null) => (s ? SOURCE_HE[s.toLowerCase()] ?? s : "מקור חיצוני");
const locationLine = (l: AlertListing) => [l.street, l.neighborhood, l.city].filter(Boolean).join(", ") || (l.city ?? "—");
const factsLine = (l: AlertListing) => [l.rooms ? `${l.rooms} חד'` : null, l.sqm ? `${l.sqm} מ״ר` : null, l.price != null ? nis(l.price) : null].filter(Boolean).join(" · ");
const internalLink = (id: string) => `/external-listings/${id}`;

/** (A) Acquisition alert — recruit an unassigned external listing. */
export function buildAcquisitionDraft(l: AlertListing): string {
  const lines = [
    "עלה נכס חדש באזור שלך שכדאי לנסות לגייס 🏠",
    "",
    `📍 ${locationLine(l)}`,
    factsLine(l) ? `🔑 ${factsLine(l)}` : null,
    `🌐 מקור: ${sourceLabel(l.source)}`,
    l.reason ? `💡 למה כדאי: ${l.reason}` : "💡 נכס בבעלות פרטית ללא מתווך — הזדמנות גיוס בלעדיות.",
    "",
    `➡️ פרטים מלאים ופעולות: ${internalLink(l.id)}`,
    "פעולה מומלצת: פנייה יזומה לבעלים והצעת ייצוג בלעדי.",
  ].filter((x): x is string => x != null);
  return lines.join("\n");
}

/** (B) Buyer-match alert — a new listing that fits existing buyers. */
export function buildBuyerMatchDraft(l: AlertListing, matches: AlertBuyerMatch[]): string {
  const top = [...matches].sort((a, b) => b.closingProbability - a.closingProbability).slice(0, 5);
  const urgency = top.some((m) => m.closingProbability >= 70) ? "דחיפות גבוהה" : top.length >= 2 ? "דחיפות בינונית" : "לבדיקה";
  const buyerLines = top.map((m) => `• ${m.name} — ${m.reasons[0] ?? "התאמה"}${m.closingProbability ? ` (סיכוי סגירה ${Math.round(m.closingProbability)}%)` : ""}`);
  const lines = [
    "עלה נכס חדש שמתאים לקונים שלך 🎯",
    "",
    `📍 ${locationLine(l)}`,
    factsLine(l) ? `🔑 ${factsLine(l)}` : null,
    `🌐 מקור: ${sourceLabel(l.source)}`,
    "",
    `👥 קונים מתאימים (${top.length}):`,
    ...buyerLines,
    "",
    `⚡ ${urgency}`,
    `➡️ פרטים והתאמות: ${internalLink(l.id)}`,
    "פעולה מומלצת: יצירת קשר עם הקונים המתאימים ותיאום צפייה.",
  ].filter((x): x is string => x != null);
  return lines.join("\n");
}

// ── Pure self-check (offline) ────────────────────────────────────────────────
export interface ACheck { name: string; pass: boolean; detail: string }
export interface ASelfCheck { ok: boolean; total: number; passed: number; checks: ACheck[] }
export function runSelfCheck(): ASelfCheck {
  const checks: ACheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const l: AlertListing = { id: "x1", source: "yad2", city: "חיפה", neighborhood: "כרמל", street: "הרצל", price: 2400000, rooms: 4, sqm: 110, reason: "בבעלות פרטית" };
  const acq = buildAcquisitionDraft(l);
  add("acquisition: headline + location + source + internal link", acq.includes("לגייס") && acq.includes("כרמל") && acq.includes("יד2") && acq.includes("/external-listings/x1"));
  add("acquisition: facts + price", acq.includes("4 חד'") && acq.includes("₪2,400,000"));
  add("acquisition: no external URL", !/yad2\.co\.il|madlan|http/.test(acq));

  const bm = buildBuyerMatchDraft(l, [
    { name: "יוסי", reasons: ["תקציב מתאים"], closingProbability: 80, commissionOpportunity: 40000 },
    { name: "דנה", reasons: ["אזור מבוקש"], closingProbability: 50, commissionOpportunity: 30000 },
  ]);
  add("buyer-match: headline + buyers + closing prob", bm.includes("מתאים לקונים") && bm.includes("יוסי") && bm.includes("80%"));
  add("buyer-match: sorted by closing prob (top first)", bm.indexOf("יוסי") < bm.indexOf("דנה"));
  add("buyer-match: urgency high when >=70", bm.includes("דחיפות גבוהה"));
  add("buyer-match: internal link, no external URL", bm.includes("/external-listings/x1") && !/http|yad2|madlan\./.test(bm));

  const bare = buildAcquisitionDraft({ id: "x2", source: null, city: null, neighborhood: null, street: null, price: null, rooms: null, sqm: null, reason: null });
  add("acquisition empty-safe (default reason + source)", bare.includes("מקור חיצוני") && bare.includes("הזדמנות גיוס"));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
