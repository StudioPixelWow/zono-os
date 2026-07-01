// ============================================================================
// ✅ Brand & Branch Identity self-tests (pure, offline). 26.4.19.
// Verifies: brand/branch resolution, branches stay independent, and duplicate
// detection fires ONLY on strong identity — never on brand/name. No DB/AI.
// ============================================================================
import { resolveBrandBranch, identityOf, sharedIdentitySignals } from "./resolver";

export interface BICheck { name: string; pass: boolean; detail: string }
export interface BISelfCheck { ok: boolean; total: number; passed: number; checks: BICheck[] }

const id = (o: Partial<{ phone: string; website: string; address: string; latitude: number; longitude: number }>) =>
  identityOf({ phone: o.phone ?? null, website: o.website ?? null, address: o.address ?? null, latitude: o.latitude ?? null, longitude: o.longitude ?? null });

export function runSelfCheck(): BISelfCheck {
  const checks: BICheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Brand + branch resolution.
  const smart = resolveBrandBranch("RE/MAX Smart");
  add("RE/MAX brand", smart.brand === "RE/MAX", `${smart.brand}`);
  add("Smart branch", (smart.branch ?? "").toLowerCase().includes("smart"), `${smart.branch}`);
  const anglo = resolveBrandBranch("אנגלו סכסון קריית ביאליק");
  add("Anglo brand", !!anglo.brand && /anglo|אנגלו/i.test(anglo.brand), `${anglo.brand}`);
  add("Anglo branch = city", (anglo.branch ?? "").includes("ביאליק"), `${anglo.branch}`);
  const indep = resolveBrandBranch("תיווך הצפון בע\"מ");
  add("independent brand null", indep.brand === null && indep.normalizedBrand === "independent", `${indep.brand}`);

  // Same brand, different branches → SAME brand key but they must remain separate
  // offices (no identity overlap).
  const vision = resolveBrandBranch("RE/MAX Vision");
  const family = resolveBrandBranch("RE/MAX Family");
  add("same brand key", smart.normalizedBrand === vision.normalizedBrand && vision.normalizedBrand === family.normalizedBrand, `${smart.normalizedBrand}`);
  add("different branches", smart.branch !== vision.branch && vision.branch !== family.branch, "");

  // Duplicate detection: two RE/MAX branches with NO shared identity → NOT duplicates.
  const noShared = sharedIdentitySignals(id({ phone: "04-8111111", website: "https://smart.co.il" }), id({ phone: "04-8222222", website: "https://vision.co.il" }));
  add("no false merge (brand only)", noShared.length === 0, `${noShared.length}`);

  // Duplicate detection: same phone → possible duplicate.
  const samePhone = sharedIdentitySignals(id({ phone: "04-8111111" }), id({ phone: "048111111" }));
  add("same phone → duplicate signal", samePhone.some((x) => /טלפון/.test(x)), `${samePhone.join(",")}`);
  // Same website domain → possible duplicate.
  const sameSite = sharedIdentitySignals(id({ website: "https://www.acme.co.il/x" }), id({ website: "http://acme.co.il" }));
  add("same website → duplicate signal", sameSite.some((x) => /אתר/.test(x)), `${sameSite.join(",")}`);
  // Same coordinates → possible duplicate.
  const sameGeo = sharedIdentitySignals(id({ latitude: 32.83, longitude: 35.08 }), id({ latitude: 32.83, longitude: 35.08 }));
  add("same coords → duplicate signal", sameGeo.some((x) => /קואורדינ/.test(x)), "");
  // Different everything → no signal.
  add("independents separate", sharedIdentitySignals(id({ phone: "04-8111111" }), id({ phone: "04-8333333" })).length === 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
