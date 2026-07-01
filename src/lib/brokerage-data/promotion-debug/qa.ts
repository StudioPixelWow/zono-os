// ============================================================================
// ✅ Promotion Debug self-tests (pure, offline). 26.4.17.
// Validates the decision math against the EXISTING verification rule: status,
// promotion score, failed rules, simulations and pipeline position. No DB/AI.
// ============================================================================
import {
  deriveSignals, computeScore, decideStatus, buildFailedRules, buildSimulations, buildPipeline,
  officeCreationOutcome, topBlockingReasons, type CandidateFacts,
} from "./rules";

export interface PDCheck { name: string; pass: boolean; detail: string }
export interface PDSelfCheck { ok: boolean; total: number; passed: number; checks: PDCheck[] }

function facts(over: Partial<CandidateFacts>): CandidateFacts {
  return {
    officeName: "רי/מקס קריית ביאליק", normalizedName: "רימקס קרית ביאליק", brandNetwork: "RE/MAX",
    city: "קריית ביאליק", cityMatched: true, cityRawInEvidence: "קריית ביאליק",
    dbStatus: "researching", suggestedBy: "brokerage_research_agent", systemConfidence: 20,
    phone: null, strongSources: 0, independentDomains: 0, evidenceFound: [], publicUrls: [], sourcesChecked: [],
    researched: false, systemVerified: false, nameValid: true,
    officeExists: false, officeHasBrokers: false, officeHasListings: false, createdByThisPipeline: false,
    duplicateOffice: false, duplicateCandidate: false, ...over,
  };
}

export function runSelfCheck(): PDSelfCheck {
  const checks: PDCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // WAITING — saved but not researched.
  const wF = facts({}); const wS = deriveSignals(wF);
  add("waiting when unresearched", decideStatus(wF, wS) === "WAITING", `${decideStatus(wF, wS)}`);

  // BLOCKED — researched, one weak source, no phone.
  const bF = facts({ researched: true, sourcesChecked: ["q1"], strongSources: 0, independentDomains: 1 }); const bS = deriveSignals(bF);
  add("blocked when weak", decideStatus(bF, bS) === "BLOCKED", `${decideStatus(bF, bS)}`);
  add("weak evidence rule shown", buildFailedRules(bF, bS).some((r) => r.code === "WEAK_EVIDENCE"), "");
  add("top reasons ≤5 + phone", (() => { const t = topBlockingReasons(bF, bS, "BLOCKED"); return t.length <= 5 && t.some((x) => /טלפון/.test(x)); })(), "");

  // READY — proven by 2 domains.
  const rF = facts({ researched: true, independentDomains: 2, publicUrls: ["https://remax.co.il/x", "https://facebook.com/y"], evidenceFound: ["מקור ציבורי חזק: RE/MAX תיווך"] });
  const rS = deriveSignals(rF);
  add("proven → READY", decideStatus(rF, rS) === "READY", `${decideStatus(rF, rS)}`);
  add("proven detected", rS.proven, "");

  // READY — strong source alone.
  const r2 = facts({ researched: true, strongSources: 1 }); const r2s = deriveSignals(r2);
  add("one strong → READY", decideStatus(r2, r2s) === "READY", "");

  // REJECTED — invalid name.
  const jF = facts({ nameValid: false, officeName: "יוסי כהן" }); const jS = deriveSignals(jF);
  add("invalid name → REJECTED", decideStatus(jF, jS) === "REJECTED", "");
  add("rejected office-creation", officeCreationOutcome(jF, jS).outcome === "Rejected", "");

  // Score: max when everything present.
  const full = facts({ researched: true, cityMatched: true, strongSources: 2, independentDomains: 2, phone: "050-1234567", publicUrls: ["https://remax.co.il", "https://b144.co.il/x", "https://yad2.co.il/y"] });
  const fullS = deriveSignals(full);
  add("full score = 100", computeScore(full, fullS).total === 100, `${computeScore(full, fullS).total}`);
  add("empty score < 40", computeScore(wF, wS).total < 40, `${computeScore(wF, wS).total}`);

  // Simulation: second source would verify a weak candidate.
  const sims = buildSimulations(bF, bS, "BLOCKED");
  add("sim: second source verifies", sims.some((x) => /מקור שני/.test(x.hypothesis) && x.wouldVerify), "");

  // Pipeline: unresearched stops at VERIFIED.
  add("pipeline stops at VERIFIED", buildPipeline(wF, wS).stoppedAt === "VERIFIED", `${buildPipeline(wF, wS).stoppedAt}`);
  // Pipeline: existing office reached OFFICE_CREATED+.
  const oF = facts({ officeExists: true, createdByThisPipeline: true, researched: true, strongSources: 1, officeHasBrokers: true });
  const oS = deriveSignals(oF);
  add("office → created stage done", buildPipeline(oF, oS).stages.find((x) => x.stage === "OFFICE_CREATED")?.done === true, "");
  add("office created outcome", officeCreationOutcome(oF, oS).outcome === "Created", "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
