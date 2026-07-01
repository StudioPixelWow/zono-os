// ============================================================================
// ✅ Office Intelligence extraction self-tests (pure, offline). 26.4.18.
// ============================================================================
import { buildProfileDraft, type Hit } from "./extract";

export interface OIICheck { name: string; pass: boolean; detail: string }
export interface OIISelfCheck { ok: boolean; total: number; passed: number; checks: OIICheck[] }

const hit = (title: string, url: string | null, snippet: string): Hit => ({ title, url, snippet });

export function runSelfCheck(): OIISelfCheck {
  const checks: OIICheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Rich office: website + facebook + city + brokerage + phone → proven, high completeness.
  const rich = buildProfileDraft("סימפל גרופ", null, null, "קריית ביאליק", [
    hit("סימפל גרופ תיווך קריית ביאליק", "https://simplegroup.co.il", "משרד תיווך ונדל\"ן בקריית ביאליק. טלפון 04-8123456"),
    hit("סימפל גרופ פייסבוק", "https://facebook.com/simplegroup", "סימפל גרופ נדל\"ן קריית ביאליק"),
  ]);
  add("proven when strong+domains", rich.signals.proven, `strong=${rich.signals.strongSources}`);
  add("website extracted", rich.profile.website === "simplegroup.co.il", `${rich.profile.website}`);
  add("facebook social found", rich.profile.socialLinks.some((u) => /facebook/.test(u)), "");
  add("phone extracted", rich.profile.phones.length > 0, `${rich.profile.phones[0]?.value}`);
  add("city confirmed", rich.profile.cityConfirmed, "");
  add("completeness high", rich.profile.completeness >= 50, `${rich.profile.completeness}`);
  add("no fake logo", rich.profile.logoUrl === null, "");

  // Facebook only (no brokerage keyword, one social domain) → not proven, missing listed.
  const fbOnly = buildProfileDraft("משרד לדוגמה", null, null, "קריית ביאליק", [
    hit("משרד לדוגמה", "https://facebook.com/example", "עמוד פייסבוק"),
  ]);
  add("facebook-only not proven", !fbOnly.signals.proven, "");
  add("missing phone listed", fbOnly.profile.missingFields.includes("טלפון"), "");
  add("missing brokerage keyword", fbOnly.profile.missingFields.includes("מילת מפתח תיווך"), "");

  // Website but no city → city not confirmed, contradiction when other city appears.
  const wrongCity = buildProfileDraft("אלפא נדלן", null, null, "קריית ביאליק", [
    hit("אלפא נדלן תל אביב", "https://alpha.co.il", "אלפא נדל\"ן תיווך תל אביב, רחוב דיזנגוף 10"),
  ]);
  add("city not confirmed", !wrongCity.profile.cityConfirmed, "");
  add("contradiction detected", wrongCity.profile.contradictions.length > 0, `${wrongCity.profile.contradictions[0] ?? ""}`);

  // AI-name only (no hits) → nothing proven, everything missing.
  const nameOnly = buildProfileDraft("מועמד ריק", null, null, "קריית ביאליק", []);
  add("empty → not proven", !nameOnly.signals.proven, "");
  add("empty → completeness 0", nameOnly.profile.completeness === 0, `${nameOnly.profile.completeness}`);
  add("empty → missing website+phone", nameOnly.profile.missingFields.includes("אתר/דומיין") && nameOnly.profile.missingFields.includes("טלפון"), "");

  // Two independent domains (no explicit brokerage word) → proven by domains≥2.
  const twoDomains = buildProfileDraft("בית נדלן", null, null, "קריית ביאליק", [
    hit("בית נדלן קריית ביאליק", "https://beit.co.il", "בית נדל\"ן קריית ביאליק"),
    hit("בית נדלן דפי זהב", "https://b144.co.il/beit", "בית נדל\"ן קריית ביאליק"),
  ]);
  add("two domains → proven", twoDomains.signals.proven && twoDomains.signals.independentDomains >= 2, `${twoDomains.signals.independentDomains}`);
  add("directory link captured", twoDomains.profile.directoryLinks.length > 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
