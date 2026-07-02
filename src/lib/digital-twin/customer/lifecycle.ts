// ============================================================================
// 🧭 Customer Journey — lifecycle roles, stage & transitions (pure). 28.5.
// Parts 2 + 3. Roles can co-exist; transitions are detected from member presence
// + explicit conversion links, each explained with why / evidence / confidence.
// ============================================================================
import type { MemberSummary, CustomerRole, LifecycleStage, StageTransition } from "./types";

const has = (m: MemberSummary[], k: MemberSummary["kind"]) => m.filter((x) => x.kind === k);
const isDormant = (m: MemberSummary) => m.recencyScore <= 10;

export function deriveRoles(members: MemberSummary[]): CustomerRole[] {
  const roles = new Set<CustomerRole>();
  const buyers = has(members, "buyer"), sellers = has(members, "seller"), leads = has(members, "lead");
  if (leads.length) roles.add("lead");
  if (buyers.length) roles.add("buyer");
  if (sellers.length) roles.add("seller");
  if (members.some((m) => m.classification.some((c) => /משקיע/.test(c)))) roles.add("investor");
  if (members.some((m) => m.sourceReferral)) roles.add("referral");
  if (buyers.length >= 2) roles.add("repeat_client");
  if (members.some((m) => m.dealSignal) && members.length > 0 && members.every(isDormant)) roles.add("former_client");
  return [...roles];
}

export function deriveCurrentStage(members: MemberSummary[]): LifecycleStage {
  const buyer = has(members, "buyer")[0];
  const seller = has(members, "seller")[0];
  const lead = has(members, "lead")[0];
  const allDormant = members.length > 0 && members.every(isDormant);
  const repeat = has(members, "buyer").length >= 2;

  let stage: LifecycleStage;
  if (seller?.dealSignal) stage = "seller";
  else if (seller) stage = "owner";
  else if (buyer?.dealSignal) stage = "negotiation";
  else if (repeat && buyer) stage = "repeat_buyer";
  else if (buyer) stage = "buyer_viewing";
  else if (lead) stage = lead.classification.some((c) => /מוסמך/.test(c)) ? "qualified" : lead.classification.some((c) => /קר/.test(c)) ? "lost" : "new_lead";
  else stage = "new_lead";

  if (allDormant && stage !== "seller" && stage !== "lost") stage = "dormant";
  return stage;
}

export function detectTransitions(members: MemberSummary[], links: { leadToBuyer?: boolean; leadToSeller?: boolean }): StageTransition[] {
  const out: StageTransition[] = [];
  const buyers = has(members, "buyer"), sellers = has(members, "seller"), leads = has(members, "lead");
  const sortedAt = members.map((m) => m.updatedAt).filter((x): x is string => !!x).sort();
  const latestAt = sortedAt.length ? sortedAt[sortedAt.length - 1] : null;

  if (leads.length && buyers.length) out.push({ from: "new_lead", to: "buyer_viewing", at: latestAt, why: "ליד הפך לקונה", evidence: [`ליד ${leads[0].name}`, `קונה ${buyers[0].name}`, links.leadToBuyer ? "קישור המרה מפורש" : "אותו איש קשר"], confidence: links.leadToBuyer ? 92 : 72 });
  if (leads.length && sellers.length) out.push({ from: "new_lead", to: "seller", at: latestAt, why: "ליד הפך למוכר", evidence: [`ליד ${leads[0].name}`, `מוכר ${sellers[0].name}`, links.leadToSeller ? "קישור המרה מפורש" : "אותו איש קשר"], confidence: links.leadToSeller ? 92 : 72 });
  if (buyers.some((b) => b.dealSignal) && sellers.length) out.push({ from: "purchase", to: "seller", at: latestAt, why: "בעלים (רכש) הפך למוכר", evidence: ["קונה עם עסקה + מוכר לאותו אדם"], confidence: 68 });
  if (sellers.some((s) => s.dealSignal) && buyers.length >= 2) out.push({ from: "seller", to: "repeat_buyer", at: latestAt, why: "מוכר חזר לרכישה", evidence: ["מוכר חתום + רכישה נוספת"], confidence: 62 });
  if (members.some((m) => m.classification.some((c) => /משקיע/.test(c))) && buyers.length) out.push({ from: "buyer_viewing", to: "investor", at: latestAt, why: "דפוס רכישה של משקיע", evidence: ["סיווג משקיע"], confidence: 60 });

  return out;
}

const ORDER: LifecycleStage[] = ["new_lead", "qualified", "buyer_viewing", "negotiation", "purchase", "owner", "seller", "repeat_buyer", "investor", "referral_source", "dormant", "lost"];
export function buildStageHistory(transitions: StageTransition[], current: LifecycleStage): LifecycleStage[] {
  const set = new Set<LifecycleStage>();
  for (const t of transitions) { set.add(t.from); set.add(t.to); }
  set.add(current);
  return [...set].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}
