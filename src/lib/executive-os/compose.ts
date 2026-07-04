// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ · pure compose. PHASE 45.0.
// Rolls up PROVIDED engine numbers into one executive view. It REUSES the
// Chief-of-Staff overall score/confidence (never recomputes), classifies office
// health, merges reused recommendations into priorities/risks/opportunities,
// derives decisions, and builds period briefings. No fabrication: dimensions
// without data stay null/"insufficient". Pure & deterministic.
// ============================================================================
import type {
  ExecutiveInput, ExecutiveOS, ExecutiveScore, OfficeHealth, OfficeState,
  ExecItem, ExecDecision, ExecBriefing, BriefPeriod, ExecDimension,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const gradeOf = (n: number) => (n >= 80 ? "מצוין" : n >= 60 ? "טוב" : n >= 40 ? "בינוני" : "דורש שיפור");

export function classifyDimensions(dims: ExecDimension[]): ExecDimension[] {
  return dims.map((d) => ({ ...d, status: d.score == null ? "insufficient" : "ok", score: d.score == null ? null : clamp(d.score) }));
}

/** Office Score — REUSES the Chief-of-Staff overall + confidence; dimensions are explanatory context. */
export function buildScore(input: ExecutiveInput): ExecutiveScore {
  const overall = clamp(input.cosOverall);
  return { overall, confidence: clamp(input.cosConfidence), grade: gradeOf(overall), dimensions: classifyDimensions(input.dimensions) };
}

/** Office Health — classified from the Chief-of-Staff health scores + trend. */
export function buildHealth(input: ExecutiveInput): OfficeHealth {
  const scored = input.healthScores.filter((h) => Number.isFinite(h.score));
  const avg = scored.length ? scored.reduce((t, h) => t + h.score, 0) / scored.length : input.cosOverall;
  let state: OfficeState;
  if (input.trend === "up" && avg >= 60) state = "growth";
  else if (input.trend === "down" && avg < 55) state = "decline";
  else if (avg >= 70) state = "healthy";
  else if (avg < 45) state = "critical";
  else state = "needs_attention";
  const evidence = scored.slice(0, 6).map((h) => `${h.label}: ${clamp(h.score)} — ${h.basis}`);
  return { state, trend: input.trend, confidence: clamp(input.cosConfidence), evidence: evidence.length ? evidence : ["מבוסס על ציון הארגון של Chief of Staff."] };
}

/** Executive decisions — derived (not recomputed) from the top priorities. */
export function buildDecisions(priorities: ExecItem[]): ExecDecision[] {
  return priorities.slice(0, 5).map((p) => ({
    title: p.title, impact: p.impact,
    risk: p.urgency >= 75 ? "גבוה אם לא מטופל" : "בינוני",
    cost: "זמן ברוקר / פעולה יזומה",
    confidence: p.confidence, affectedModules: [p.sourceModule],
    approvalRequired: true,
  }));
}

const PERIOD_LABEL: Record<BriefPeriod, string> = { morning: "תדריך בוקר", afternoon: "תדריך צהריים", weekly: "תדריך שבועי", monthly: "תדריך חודשי", quarterly: "תדריך רבעוני" };
export function buildBriefings(input: ExecutiveInput, periods: BriefPeriod[] = ["morning", "afternoon", "weekly", "monthly", "quarterly"]): ExecBriefing[] {
  const base = input.briefingPoints.filter(Boolean);
  return periods.map((period) => ({
    period, label: PERIOD_LABEL[period],
    headline: input.briefingHeadline || `ציון הארגון ${clamp(input.cosOverall)} · ${gradeOf(input.cosOverall)}`,
    points: base.length ? base.slice(0, period === "morning" || period === "afternoon" ? 4 : 6) : [`ציון ${clamp(input.cosOverall)}`, `${input.recs.length} המלצות פעילות`],
  }));
}

export function composeExecutive(input: ExecutiveInput): ExecutiveOS {
  const score = buildScore(input);
  const health = buildHealth(input);
  const priorities = input.recs.filter((r) => r.kind === "priority").sort((a, b) => b.urgency - a.urgency);
  const risks = input.recs.filter((r) => r.kind === "risk").sort((a, b) => b.urgency - a.urgency);
  const opportunities = input.recs.filter((r) => r.kind === "opportunity").sort((a, b) => b.confidence - a.confidence);
  return {
    version: "45.0", orgId: input.orgId, generatedAt: new Date().toISOString(),
    score, health, briefings: buildBriefings(input),
    priorities, risks, opportunities,
    timeline: [...input.timeline].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 40),
    decisions: buildDecisions(priorities),
    approvalCenter: { count: input.bundles.length, bundles: [...input.bundles].sort((a, b) => b.priority - a.priority) },
    brokerComparison: [...input.brokers].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    notes: ["הנתונים נצרכים ממנועי ZONO הקיימים — אין חישוב כפול. שום פעולה לא מבוצעת אוטומטית."],
  };
}

// ── Executive AI (STEP 9) — answers from the composed, reused data ───────────
export function answerExecutive(os: ExecutiveOS, question: string): { answer: string; items: { title: string; detail: string }[] } {
  const q = question.toLowerCase();
  const items = (list: ExecItem[]) => list.slice(0, 5).map((x) => ({ title: x.title, detail: x.why }));
  if (/focus|להתמקד|מה לעשות/.test(q)) return { answer: os.priorities.length ? "המיקוד המומלץ (לפי דחיפות):" : "אין עדיפויות פתוחות.", items: items(os.priorities) };
  if (/losing money|מפסיד|כסף|leak/.test(q)) return { answer: "היכן עלול להיפגע רווח (סיכונים):", items: items(os.risks) };
  if (/grow|לצמוח|הכי מהר|growth/.test(q)) return { answer: "היכן הצמיחה המהירה (הזדמנויות):", items: items(os.opportunities) };
  if (/broker|ברוקר|צוות/.test(q)) { const weak = os.brokerComparison.filter((b) => b.score != null).slice(-3).reverse(); return { answer: weak.length ? "ברוקרים שעשויים להזדקק לתמיכה:" : "אין נתוני ברוקרים.", items: weak.map((b) => ({ title: b.name ?? "ברוקר", detail: `ציון ${b.score ?? "—"}${b.note ? ` · ${b.note}` : ""}` })) }; }
  if (/biggest opportunity|הזדמנות/.test(q)) return { answer: os.opportunities[0] ? `ההזדמנות הגדולה: ${os.opportunities[0].title}` : "אין הזדמנות בולטת כרגע.", items: items(os.opportunities.slice(0, 1)) };
  if (/biggest risk|סיכון/.test(q)) return { answer: os.risks[0] ? `הסיכון הגדול: ${os.risks[0].title}` : "אין סיכון בולט כרגע.", items: items(os.risks.slice(0, 1)) };
  return { answer: `ציון הארגון ${os.score.overall} (${os.score.grade}). ${os.priorities.length} עדיפויות, ${os.risks.length} סיכונים, ${os.opportunities.length} הזדמנויות.`, items: items(os.priorities) };
}

// ── Self-check ───────────────────────────────────────────────────────────────
export interface ECheck { name: string; pass: boolean }
export interface ESelfCheck { ok: boolean; total: number; passed: number; checks: ECheck[] }
export function runSelfCheck(): ESelfCheck {
  const checks: ECheck[] = []; const add = (n: string, p: boolean) => checks.push({ name: n, pass: p });
  const rec = (kind: ExecItem["kind"], id: string, urgency: number, confidence = 70): ExecItem => ({ id, kind, title: `${kind} ${id}`, why: "כי", evidence: ["ראיה"], impact: "גבוה", confidence, urgency, sourceModule: "chief-of-staff" });
  const input: ExecutiveInput = {
    orgId: "o1", cosOverall: 72, cosConfidence: 65, trend: "up",
    dimensions: [
      { key: "growth", label: "צמיחה", score: 70, basis: "CoS", status: "ok", sourceModule: "chief-of-staff" },
      { key: "calendar", label: "בריאות יומן", score: 80, basis: "calendar", status: "ok", sourceModule: "calendar-os" },
      { key: "satisfaction", label: "שביעות רצון", score: null, basis: "אין נתונים", status: "insufficient", sourceModule: "—" },
    ],
    healthScores: [{ key: "sales", label: "מכירות", score: 68, basis: "b1" }, { key: "growth", label: "צמיחה", score: 74, basis: "b2" }],
    recs: [rec("priority", "p1", 90), rec("priority", "p2", 60), rec("risk", "r1", 85), rec("opportunity", "op1", 50, 88)],
    timeline: [{ at: "2026-07-04T10:00:00Z", kind: "meeting", title: "פגישה", detail: null, href: "/x" }, { at: "2026-07-04T08:00:00Z", kind: "task", title: "משימה", detail: null, href: null }],
    bundles: [{ bundleId: "b:lead:1", title: "ליד", priority: 70, entityHref: "/leads/1" }, { bundleId: "b:seller:2", title: "מוכר", priority: 90, entityHref: "/sellers/2" }],
    brokers: [{ brokerId: "a", name: "א", score: 80, label: "בריא", note: null }, { brokerId: "b", name: "ב", score: 40, label: "חלש", note: "עומס" }],
    briefingHeadline: "בוקר טוב", briefingPoints: ["נקודה 1", "נקודה 2"],
  };

  const os = composeExecutive(input);
  add("score: REUSES CoS overall (72) — not recomputed", os.score.overall === 72 && os.score.confidence === 65 && os.score.grade === "טוב");
  add("dimensions: insufficient marked, no fabrication", os.score.dimensions.find((d) => d.key === "satisfaction")?.status === "insufficient" && os.score.dimensions.find((d) => d.key === "satisfaction")?.score === null);
  add("health: growth state on up-trend + good avg", os.health.state === "growth" && os.health.trend === "up" && os.health.evidence.length > 0);
  add("priorities/risks/opps split + sorted", os.priorities.length === 2 && os.priorities[0].urgency === 90 && os.risks.length === 1 && os.opportunities.length === 1);
  add("timeline: merged + sorted ascending", os.timeline.length === 2 && Date.parse(os.timeline[0].at) < Date.parse(os.timeline[1].at));
  add("decisions: derived from priorities, approvalRequired", os.decisions.length === 2 && os.decisions.every((d) => d.approvalRequired));
  add("approval center: bundles sorted by priority desc", os.approvalCenter.count === 2 && os.approvalCenter.bundles[0].priority === 90);
  add("broker comparison: sorted by score desc (reused)", os.brokerComparison[0].brokerId === "a" && os.brokerComparison[1].brokerId === "b");
  add("briefings: 5 periods with headline+points", os.briefings.length === 5 && os.briefings.every((b) => b.headline.length > 0 && b.points.length > 0));

  add("ask: focus → priorities", answerExecutive(os, "on what should I focus?").items[0]?.title.includes("priority"));
  add("ask: losing money → risks", answerExecutive(os, "where am I losing money?").items.length === 1);
  add("ask: grow → opportunities", answerExecutive(os, "where will I grow fastest?").items.length === 1);
  add("ask: broker → weakest surfaced", /תמיכה/.test(answerExecutive(os, "which broker needs help?").answer));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
