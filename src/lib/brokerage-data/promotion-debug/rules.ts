// ============================================================================
// 🔬 Promotion decision rules (pure). 26.4.17.
// ----------------------------------------------------------------------------
// Explains a candidate's promotion using the EXISTING verification rule
// (proven = ≥1 strong public source OR ≥2 independent domains). Produces the
// checklist, failed rules, promotion score, status, top blocking reasons,
// simulations and pipeline position. No engine/AI/rule changes — read-only math.
// ============================================================================
import {
  PIPELINE_STAGES,
  type ChecklistItem, type FailedRule, type PromotionScore, type PromotionSimulation,
  type PromotionStatus, type PipelineStage, type OfficeCreationOutcome,
} from "./types";

export interface CandidateFacts {
  officeName: string; normalizedName: string; brandNetwork: string | null;
  city: string; cityMatched: boolean; cityRawInEvidence: string | null;
  dbStatus: string; suggestedBy: string; systemConfidence: number;
  phone: string | null;
  strongSources: number; independentDomains: number;
  evidenceFound: string[]; publicUrls: string[]; sourcesChecked: string[];
  researched: boolean; systemVerified: boolean; nameValid: boolean;
  officeExists: boolean; officeHasBrokers: boolean; officeHasListings: boolean; createdByThisPipeline: boolean;
  duplicateOffice: boolean; duplicateCandidate: boolean;
}

const BROKERAGE = /תיווך|נדל|מתווכ|נכס|real\s*estate|realty|realtor|re\/?max|remax|anglo|אנגלו|century\s*21|keller|sotheby/i;
const dom = (url: string): string => { const m = url.toLowerCase().match(/^https?:\/\/([^/]+)/); return m ? m[1].replace(/^www\./, "") : url.toLowerCase(); };
const isFacebook = (d: string) => /facebook\.com/.test(d);
const isInstagram = (d: string) => /instagram\.com/.test(d);
const isLinkedin = (d: string) => /linkedin\.com/.test(d);
const isDirectory = (d: string) => /b144|dun|yellow|zap\.co|d\.co\.il|easy\.co\.il|144\./.test(d);
const isPortal = (d: string) => /yad2|madlan|nadlan|homeless|onmap|komo/.test(d);

export interface CandidateSignals {
  domains: string[]; hasWebsite: boolean; hasFacebook: boolean; hasInstagram: boolean; hasLinkedin: boolean;
  hasDirectory: boolean; hasPortal: boolean; hasPhone: boolean; hasBrokerageKeyword: boolean; proven: boolean;
}

export function deriveSignals(f: CandidateFacts): CandidateSignals {
  const domains = f.publicUrls.map(dom).filter(Boolean);
  const hasFacebook = domains.some(isFacebook);
  const hasInstagram = domains.some(isInstagram);
  const hasLinkedin = domains.some(isLinkedin);
  const hasDirectory = domains.some(isDirectory);
  const hasPortal = domains.some(isPortal);
  const hasWebsite = domains.some((d) => !isFacebook(d) && !isInstagram(d) && !isLinkedin(d) && !isDirectory(d) && !isPortal(d));
  const hasPhone = !!f.phone;
  const hasBrokerageKeyword = f.strongSources > 0 || f.evidenceFound.some((e) => BROKERAGE.test(e));
  const proven = f.strongSources >= 1 || f.independentDomains >= 2;   // EXISTING rule — unchanged
  return { domains, hasWebsite, hasFacebook, hasInstagram, hasLinkedin, hasDirectory, hasPortal, hasPhone, hasBrokerageKeyword, proven };
}

function tri(cond: boolean, unknown = false): "pass" | "fail" | "unknown" { return unknown ? "unknown" : cond ? "pass" : "fail"; }

export function buildChecklist(f: CandidateFacts, s: CandidateSignals): ChecklistItem[] {
  return [
    { key: "name_valid", label: "שם משרד תקין", state: tri(f.nameValid), note: f.nameValid ? null : "נראה כשם אדם / ביטוי כללי" },
    { key: "city_matched", label: "עיר תואמת", state: tri(f.cityMatched), note: f.cityMatched ? null : `עיר במקור: ${f.cityRawInEvidence ?? "—"}` },
    { key: "brokerage_keywords", label: "מילות מפתח תיווך", state: tri(s.hasBrokerageKeyword, !f.researched), note: null },
    { key: "website", label: "אתר נמצא", state: tri(s.hasWebsite, !f.researched), note: null },
    { key: "phone", label: "טלפון נמצא", state: tri(s.hasPhone, !f.researched), note: f.phone },
    { key: "facebook", label: "פייסבוק", state: tri(s.hasFacebook, !f.researched), note: null },
    { key: "instagram", label: "אינסטגרם", state: tri(s.hasInstagram, !f.researched), note: null },
    { key: "linkedin", label: "לינקדאין", state: tri(s.hasLinkedin, !f.researched), note: null },
    { key: "directory", label: "מדריך ציבורי", state: tri(s.hasDirectory, !f.researched), note: null },
    { key: "portal", label: "פורטל מודעות", state: tri(s.hasPortal, !f.researched), note: null },
    { key: "multiple_domains", label: "מספר דומיינים", state: tri(f.independentDomains >= 2, !f.researched), note: `${f.independentDomains} דומיינים` },
    { key: "multiple_evidence", label: "ריבוי ראיות", state: tri(f.strongSources >= 1 || f.evidenceFound.length >= 2, !f.researched), note: `${f.strongSources} חזקים · ${f.evidenceFound.length} ראיות` },
    { key: "duplicate_office", label: "כפילות משרד", state: tri(!f.duplicateOffice), note: f.duplicateOffice ? "קיים משרד באותו שם מנורמל" : null },
    { key: "duplicate_candidate", label: "כפילות מועמד", state: tri(!f.duplicateCandidate), note: f.duplicateCandidate ? "קיים מועמד זהה" : null },
    { key: "office_exists", label: "משרד כבר קיים", state: f.officeExists ? "pass" : "unknown", note: f.officeExists ? "יש משרד פעיל" : null },
    { key: "confidence", label: "ביטחון מערכת", state: tri(f.systemConfidence >= 50, !f.researched), note: `${f.systemConfidence}%` },
  ];
}

export function computeScore(f: CandidateFacts, s: CandidateSignals): PromotionScore {
  const items = [
    { key: "name", label: "תקינות שם", max: 15, got: f.nameValid ? 15 : 0 },
    { key: "city", label: "עיר", max: 15, got: f.cityMatched ? 15 : 0 },
    { key: "evidence", label: "ראיות", max: 20, got: Math.min(20, f.strongSources * 12 + f.independentDomains * 6) },
    { key: "website", label: "אתר", max: 10, got: s.hasWebsite ? 10 : 0 },
    { key: "phone", label: "טלפון", max: 10, got: s.hasPhone ? 10 : 0 },
    { key: "directory", label: "מדריך", max: 10, got: s.hasDirectory ? 10 : 0 },
    { key: "keywords", label: "מילות תיווך", max: 10, got: s.hasBrokerageKeyword ? 10 : 0 },
    { key: "portal", label: "פורטל", max: 10, got: s.hasPortal ? 10 : 0 },
  ];
  return { total: items.reduce((n, i) => n + i.got, 0), items };
}

export function decideStatus(f: CandidateFacts, s: CandidateSignals): PromotionStatus {
  if (!f.nameValid) return "REJECTED";
  if (f.dbStatus === "verified" || f.systemVerified || f.officeExists) return "READY";
  if (s.proven) return "READY";
  if (!f.researched) return "WAITING";
  return "BLOCKED";
}

export function buildFailedRules(f: CandidateFacts, s: CandidateSignals): FailedRule[] {
  const out: FailedRule[] = [];
  if (!f.nameValid) out.push({ code: "NAME_INVALID", title: "שם לא תקין", reason: "אינו שם משרד תקין (שם אדם/ביטוי כללי)", detail: f.officeName });
  if (!f.cityMatched) out.push({ code: "CITY_MISMATCH", title: "אי-התאמת עיר", reason: "נרמול עיר נכשל", detail: `מועמד: ${f.city} · מקור: ${f.cityRawInEvidence ?? "—"}` });
  if (f.researched && !s.hasPhone) out.push({ code: "MISSING_PHONE", title: "חסר טלפון", reason: "לא נמצא טלפון ציבורי", detail: null });
  if (f.researched && !s.proven) out.push({ code: "WEAK_EVIDENCE", title: "ראיה חלשה", reason: `מקור יחיד — מינימום נדרש: מקור חזק אחד או 2 דומיינים בלתי תלויים`, detail: `${f.strongSources} חזקים · ${f.independentDomains} דומיינים` });
  if (f.researched && !s.hasBrokerageKeyword) out.push({ code: "NO_BROKERAGE_KEYWORD", title: "אין מילת מפתח תיווך", reason: "לא זוהתה מילת מפתח נדל״ן/תיווך במקורות", detail: null });
  return out;
}

export function topBlockingReasons(f: CandidateFacts, s: CandidateSignals, status: PromotionStatus): string[] {
  if (status === "READY" || status === "REJECTED") return [];
  const r: string[] = [];
  if (!f.researched) r.push("ממתין לאימות ציבורי (טרם נבדק)");
  if (!s.hasPhone) r.push("ממתין לטלפון ציבורי");
  if (f.independentDomains < 2 && f.strongSources < 1) r.push("ממתין למקור/דומיין שני בלתי תלוי");
  if (!s.hasBrokerageKeyword) r.push("ממתין למילת מפתח תיווך");
  if (!f.cityMatched) r.push("ממתין לאישור עיר");
  if (!s.hasWebsite) r.push("ממתין לאימות דומיין/אתר");
  return r.slice(0, 5);
}

export function buildSimulations(f: CandidateFacts, s: CandidateSignals, status: PromotionStatus): PromotionSimulation[] {
  if (status === "READY" || status === "REJECTED") return [];
  const sims: PromotionSimulation[] = [];
  if (!s.hasPhone) sims.push({ hypothesis: "אם היה טלפון ציבורי", wouldVerify: !s.proven && s.hasBrokerageKeyword && (s.hasWebsite || f.independentDomains >= 1), explanation: "טלפון + שם + מילת תיווך היו יוצרים מקור חזק אחד" });
  sims.push({ hypothesis: "אם היה מקור שני בלתי תלוי", wouldVerify: !s.proven, explanation: f.independentDomains >= 1 ? "דומיין שני היה משלים ל-2 דומיינים → אימות" : "מקור חזק שני היה עומד בכלל האימות" });
  if (!f.cityMatched) sims.push({ hypothesis: "אם העיר הותאמה", wouldVerify: !s.proven && s.hasBrokerageKeyword && (s.hasWebsite || s.hasPhone || f.independentDomains >= 1), explanation: "התאמת עיר הייתה הופכת תוצאה קרובה למקור חזק" });
  return sims;
}

export function buildPipeline(f: CandidateFacts, s: CandidateSignals): { reached: PipelineStage; stoppedAt: PipelineStage | null; stages: { stage: PipelineStage; done: boolean }[] } {
  const done: Record<PipelineStage, boolean> = {
    AI: /ai_candidate_seed|brokerage_research_agent/.test(f.suggestedBy),
    SAVED: true,
    VERIFIED: f.systemVerified || s.proven || f.dbStatus === "verified",
    PROMOTED: f.officeExists || f.systemVerified,
    OFFICE_CREATED: f.officeExists,
    BROKER_MATCHING: f.officeExists && f.officeHasBrokers,
    LISTING_RELINK: f.officeExists && f.officeHasListings,
  };
  const stages = PIPELINE_STAGES.map((stage) => ({ stage, done: done[stage] }));
  let reached: PipelineStage = "SAVED";
  for (const st of PIPELINE_STAGES) if (done[st]) reached = st;
  const stoppedAt = PIPELINE_STAGES.find((st) => !done[st]) ?? null;
  return { reached, stoppedAt, stages };
}

export function officeCreationOutcome(f: CandidateFacts, s: CandidateSignals): { outcome: OfficeCreationOutcome; explanation: string } {
  if (!f.nameValid) return { outcome: "Rejected", explanation: "שם לא תקין — לא נוצר משרד" };
  if (f.officeExists && f.createdByThisPipeline) return { outcome: "Created", explanation: "המשרד נוצר מהמועמד לאחר אימות ציבורי" };
  if (f.officeExists && f.duplicateOffice) return { outcome: "Merged", explanation: "מוזג למשרד קיים באותו שם מנורמל" };
  if (f.officeExists) return { outcome: "AlreadyExists", explanation: "משרד פעיל כבר קיים בשם זה" };
  if (f.researched && !s.proven) return { outcome: "Blocked", explanation: "ראיה ציבורית לא מספקת — לא נוצר משרד" };
  return { outcome: "Skipped", explanation: "ממתין לאימות — טרם נוצר משרד" };
}
