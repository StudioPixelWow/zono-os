// ============================================================================
// ZONO — PHASE 26.10: AI Copilot answer builder (PURE, client-safe).
// Deterministic Hebrew NLG over a GROUNDED context object. It only ever states
// facts present in the context — never invents agencies, scores, deals or
// territories. Discloses missing data + low confidence, and returns the exact
// structured contract. No LLM call, fully testable.
// ============================================================================
import type {
  AgencyCopilotContext, AgencyCopilotAnswer, CopilotEntity, ParsedAgencyQuery,
} from "./agencyCopilotTypes";

const GROUNDING = "על בסיס הנתונים הקיימים במערכת";
const LOW_CONF = "⚠️ רמת הביטחון בנתונים נמוכה כרגע — מומלץ להעמיק את הסריקה והאיסוף לפני קבלת החלטה.";

const round1 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number | null): string => (n == null ? "—" : String(Math.round(n)));
const pct = (n: number | null): string => (n == null ? "—" : `${Math.round(n * 100)}%`);

const TABLE_HE: Record<string, string> = {
  agencies: "משרדים", agency_scores: "ציוני משרדים", agency_territory_stats: "שליטה אזורית",
  agency_signals: "אותות שוק", agency_timeline: "ציר זמן", agency_intelligence_reports: "דוחות מודיעין",
  rain_nodes: "גרף RAIN — צמתים", rain_edges: "גרף RAIN — קשרים", properties: "נכסים", deals: "עסקאות",
};

function entitiesFrom(p: ParsedAgencyQuery): CopilotEntity[] {
  const e: CopilotEntity[] = [];
  if (p.city) e.push({ type: "city", value: p.city });
  if (p.neighborhood) e.push({ type: "neighborhood", value: p.neighborhood });
  if (p.street) e.push({ type: "street", value: p.street });
  if (p.agencyName) e.push({ type: "agency", value: p.agencyName });
  if (p.periodLabel) e.push({ type: "period", value: p.periodLabel });
  return e;
}

const areaLabel = (ctx: AgencyCopilotContext): string =>
  ctx.resolvedArea?.neighborhood || ctx.resolvedArea?.city || ctx.parsed.neighborhood || ctx.parsed.city || "האזור שלך";

/** Build the structured Copilot answer from a grounded context. */
export function buildAgencyIntelAnswer(ctx: AgencyCopilotContext): AgencyCopilotAnswer {
  const base = {
    intent: ctx.intent,
    confidence: round1(ctx.confidence),
    entities: entitiesFrom(ctx.parsed),
    missing_data: ctx.missingData,
    source_summary: ctx.sources.map((s) => `${TABLE_HE[s.table] ?? s.table} (${s.records})`),
  };

  if (!ctx.hasData) {
    return {
      ...base,
      answer: `${GROUNDING}, אין לי עדיין מספיק מידע כדי לענות על השאלה הזו. ${ctx.missingData[0] ?? "צריך לאסוף ולנתח נתוני משרדים, שליטה אזורית ואותות שוק."}`,
      highlights: [],
      recommendations: missingDataRecommendations(ctx),
    };
  }

  let answer = "";
  let highlights: string[] = [];
  let recommendations: string[] = [];

  switch (ctx.intent) {
    case "top_agencies_in_area":
    case "dominance_by_area": {
      const rows = ctx.territories;
      if (rows.length === 0) { answer = `${GROUNDING}, אין עדיין נתוני שליטה אזורית עבור ${areaLabel(ctx)}.`; recommendations = missingDataRecommendations(ctx); break; }
      const top = rows[0];
      answer = `${GROUNDING}, ${ctx.intent === "dominance_by_area" ? "המשרד השולט" : "המשרד החזק ביותר"} ב${areaLabel(ctx)} הוא ${top.agencyName} (ציון שליטה ${fmt(top.dominance)}${top.inventoryShare != null ? `, נתח מלאי ${pct(top.inventoryShare)}` : ""}).`;
      highlights = rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.agencyName} · שליטה ${fmt(r.dominance)} · מומנטום ${fmt(r.momentum)}`);
      recommendations = [`עקוב אחר ${top.agencyName} באזור ${areaLabel(ctx)} וזהה נכסים ומוכרים בהם הוא פעיל.`];
      break;
    }
    case "strongest_competitor": {
      const a = ctx.agencies[0];
      if (!a) { answer = `${GROUNDING}, אין עדיין משרדים מדורגים.`; recommendations = missingDataRecommendations(ctx); break; }
      answer = `${GROUNDING}, המתחרה החזק ביותר כרגע הוא ${a.name}${a.city ? ` (${a.city})` : ""} — ציון כללי ${fmt(a.overall)}, איום ${fmt(a.threat)}, מומנטום ${fmt(a.momentum)}.`;
      highlights = ctx.agencies.slice(0, 3).map((x, i) => `${i + 1}. ${x.name} · כללי ${fmt(x.overall)} · איום ${fmt(x.threat)}`);
      recommendations = [`למד את אזורי הפעילות של ${a.name} כדי לזהות חפיפה עם השוק שלך.`];
      break;
    }
    case "high_threat_competitors": {
      const threats = ctx.agencies.filter((a) => a.threat != null).sort((x, y) => (y.threat ?? 0) - (x.threat ?? 0));
      if (threats.length === 0) { answer = `${GROUNDING}, אין עדיין ציוני איום מחושבים.`; recommendations = missingDataRecommendations(ctx); break; }
      const a = threats[0];
      answer = `${GROUNDING}, המתחרה המסוכן ביותר עבורך כרגע הוא ${a.name} עם ציון איום ${fmt(a.threat)}${a.topSignalTitle ? `. אות מרכזי: ${a.topSignalTitle}` : ""}.`;
      highlights = threats.slice(0, 3).map((x, i) => `${i + 1}. ${x.name} · איום ${fmt(x.threat)} · מומנטום ${fmt(x.momentum)}`);
      recommendations = [`הגדר מעקב שבועי אחר ${a.name} והאזורים בהם האיום שלו גבוה.`];
      break;
    }
    case "recent_growth": {
      const growing = ctx.agencies.filter((a) => a.momentum != null).sort((x, y) => (y.momentum ?? 0) - (x.momentum ?? 0));
      if (growing.length === 0) { answer = `${GROUNDING}, אין עדיין נתוני מומנטום לזיהוי משרדים שהתחזקו.`; recommendations = missingDataRecommendations(ctx); break; }
      const a = growing[0];
      answer = `${GROUNDING}${ctx.parsed.periodLabel ? ` (${ctx.parsed.periodLabel})` : ""}, המשרד שהתחזק בצורה הבולטת ביותר הוא ${a.name} (מומנטום ${fmt(a.momentum)}).`;
      highlights = growing.slice(0, 3).map((x, i) => `${i + 1}. ${x.name} · מומנטום ${fmt(x.momentum)} · כללי ${fmt(x.overall)}`);
      recommendations = [`בדוק מה מניע את הצמיחה של ${a.name} — אזורים חדשים, מתווכים חדשים או אותות שוק.`];
      break;
    }
    case "territory_opportunity":
    case "weak_user_area": {
      if (ctx.opportunities.length === 0) {
        answer = `${GROUNDING}, לא זוהתה כרגע הזדמנות ברורה של אזור עם תחרות נמוכה ב${areaLabel(ctx)}. ייתכן שחסרים נתוני שליטה אזורית מספקים.`;
        recommendations = missingDataRecommendations(ctx); break;
      }
      const o = ctx.opportunities[0];
      answer = `${GROUNDING}, הזדמנות בולטת היא ${o.label}${o.city ? ` (${o.city})` : ""} — ${o.reason} (כיום ${o.agencyCount} משרדים פעילים).`;
      highlights = ctx.opportunities.slice(0, 3).map((x, i) => `${i + 1}. ${x.label} · ${x.agencyCount} משרדים · ${x.reason}`);
      recommendations = [`שקול להגדיל נוכחות ב${o.label} לפני שמתחרים נכנסים.`];
      break;
    }
    case "agency_summary": {
      const d = ctx.agencyDetail;
      if (!d) { answer = `${GROUNDING}, לא מצאתי משרד בשם "${ctx.parsed.agencyName ?? ""}" בנתונים השמורים.`; recommendations = ["ודא את שם המשרד או הרץ זיהוי משרדים מחדש."]; break; }
      answer = `${GROUNDING}, ${d.agencyName}${d.city ? ` (${d.city})` : ""}: ציון כללי ${fmt(d.overall)}, איום ${fmt(d.threat)}, מומנטום ${fmt(d.momentum)}.${d.executiveSummary ? ` ${d.executiveSummary.slice(0, 180)}` : ""}`;
      if (d.topTerritories[0]) highlights.push(`אזור חזק: ${d.topTerritories[0].label} (שליטה ${fmt(d.topTerritories[0].dominance)})`);
      if (d.topSignals[0]) highlights.push(`אות אחרון: ${d.topSignals[0].title}`);
      recommendations = [`עקוב אחר האזורים בהם ${d.agencyName} חזק ביותר.`];
      break;
    }
    case "agency_comparison": {
      const c = ctx.comparison;
      if (!c) { answer = `${GROUNDING}, לא הצלחתי לזהות את שני המשרדים להשוואה.`; recommendations = ["ציין שני שמות משרדים מדויקים, למשל: \"X מול Y\"."]; break; }
      const lead = (c.a.overall ?? -1) >= (c.b.overall ?? -1) ? c.a : c.b;
      answer = `${GROUNDING}, ${c.a.agencyName}: כללי ${fmt(c.a.overall)} / איום ${fmt(c.a.threat)} / מומנטום ${fmt(c.a.momentum)}. ${c.b.agencyName}: כללי ${fmt(c.b.overall)} / איום ${fmt(c.b.threat)} / מומנטום ${fmt(c.b.momentum)}. מוביל בציון הכללי: ${lead.agencyName}.`;
      highlights = [`${c.a.agencyName}: כללי ${fmt(c.a.overall)}`, `${c.b.agencyName}: כללי ${fmt(c.b.overall)}`];
      break;
    }
    case "signals_summary": {
      if (ctx.signals.length === 0 && ctx.timeline.length === 0) { answer = `${GROUNDING}, אין אותות שוק או שינויים משמעותיים שתועדו לאחרונה.`; recommendations = missingDataRecommendations(ctx); break; }
      const s = ctx.signals[0];
      answer = `${GROUNDING}, זוהו ${ctx.signals.length} אותות שוק פעילים${s ? `. הבולט ביותר: ${s.title}${s.territoryLabel ? ` (${s.territoryLabel})` : ""}` : ""}.`;
      highlights = ctx.signals.slice(0, 4).map((x) => `${x.title}${x.severity ? ` · חומרה ${x.severity}` : ""}`);
      recommendations = ["סקור את אותות השוק ברדאר המתחרים והגדר מעקב למשרדים הרלוונטיים."];
      break;
    }
    default: {
      answer = "לא הצלחתי לזהות בדיוק מה תרצה לדעת. אפשר לשאול אותי, למשל: מי המשרד הכי חזק באזור שלי? איזה מתחרה הכי מסוכן? היכן יש לי הזדמנות?";
      recommendations = ["נסה לכלול אזור (עיר/שכונה), שם משרד, או מילים כמו \"הכי חזק\", \"הזדמנות\", \"התחזק\"."];
    }
  }

  if (ctx.confidence < 0.4 && ctx.intent !== "unknown") answer = `${answer}\n\n${LOW_CONF}`;
  return { ...base, answer, highlights, recommendations };
}

function missingDataRecommendations(ctx: AgencyCopilotContext): string[] {
  const recs = ctx.missingData.length
    ? ctx.missingData.map((m) => `כדי לענות טוב יותר: ${m}`)
    : ["הרץ זיהוי משרדים, חישוב שליטה אזורית וזיהוי אותות כדי לאפשר ניתוח מלא."];
  return recs.slice(0, 3);
}
