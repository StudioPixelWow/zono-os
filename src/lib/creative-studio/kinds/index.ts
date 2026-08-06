// ============================================================================
// ZONO creative-studio — new-kind wiring (agent_brand / office_brand /
// market_stat) into the EXISTING pipeline, additively. Each kind produces:
//   validated input → Hebrew brief → AdSpec-compatible spec
// consumed by the existing creative director / composition / QA. No parallel
// path around quick-creative-service; this is the additive brief/spec builder
// the pipeline dispatches to. Property behavior is untouched.
// ============================================================================
import type { ResolvedBrand } from "../brand-asset-resolver";
import { validateMarketStat } from "../creative-kinds";
import type { MarketStat, CreativeKind } from "../creative-kinds";

export class KindValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) { super(message); this.name = "KindValidationError"; this.field = field; }
}

/** Israeli phone: digits only, 9–10 length, local 0-prefixed or +972. Pure. */
export function isValidIsraeliPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) return d.length === 12;      // +972 5X XXXXXXX
  return (d.length === 9 || d.length === 10) && d.startsWith("0");
}

export interface KindSpec {
  kind: CreativeKind;
  brief: string;                 // Hebrew creative brief
  headline: string;
  subheadline: string | null;
  cta: string;
  features: string[];
  agentName: string | null;
  agentPhone: string | null;
  logoUrl: string | null;
  agentPhoto: string | null;
  palette: { bg: string; bg2: string; accent: string };
  footer: string | null;
  immutableFacts: Record<string, string>;   // deterministic facts the model must not alter
}

function paletteFrom(brand: ResolvedBrand): { bg: string; bg2: string; accent: string } {
  return {
    bg: brand.primaryColor ?? "#0B0B0C",
    bg2: brand.secondaryColor ?? brand.primaryColor ?? "#151517",
    accent: brand.accentColor ?? "#C9A24B",
  };
}

// ── agent_brand ───────────────────────────────────────────────────────────────
export interface AgentBrandInput {
  orgId: string; agentOrgId: string;
  name?: string | null; role?: string | null; specialization?: string | null;
  geoFocus?: string | null; cta?: string | null; officeCobrand?: boolean;
}
export function buildAgentBrand(input: AgentBrandInput, brand: ResolvedBrand): KindSpec {
  if (input.agentOrgId !== input.orgId) throw new KindValidationError("org", "agent belongs to another organization");
  if (!brand.primaryColor && !brand.logoTransparent && !brand.logo) throw new KindValidationError("brand", "no usable approved Brand Profile");
  if (!brand.profileImage) throw new KindValidationError("agent_photo", "approved agent profile image required");
  if (brand.sources.profileImage === "legacy.user.avatar_url") throw new KindValidationError("agent_photo", "profile image is not from an approved Brand Profile");
  const name = input.name ?? brand.agentName;
  if (!name) throw new KindValidationError("name", "approved agent name required");
  if (!brand.logoTransparent && !brand.logo) throw new KindValidationError("logo", "approved logo required");
  if (!isValidIsraeliPhone(brand.phone)) throw new KindValidationError("phone", "valid phone required");
  const role = input.role ?? "יועץ נדל\"ן";
  const geo = input.geoFocus ?? "";
  return {
    kind: "agent_brand",
    brief: `כרטיס מיתוג אישי לסוכן ${name}${geo ? ` — מומחה ${geo}` : ""}. הדגש מקצועיות ואמון. הלוגו, שם הסוכן, הטלפון וה-CTA נשלטים דטרמיניסטית ואינם נוצרים ע"י מודל התמונה.`,
    headline: name,
    subheadline: [role, input.specialization, geo].filter(Boolean).join(" · ") || null,
    cta: input.cta ?? "דברו איתי",
    features: [input.specialization, geo].filter(Boolean) as string[],
    agentName: name, agentPhone: brand.phone, logoUrl: brand.logoTransparent ?? brand.logo,
    agentPhoto: brand.profileImage, palette: paletteFrom(brand), footer: brand.footerText,
    immutableFacts: { name, phone: brand.phone!, ...(input.officeCobrand && brand.officeName ? { office: brand.officeName } : {}) },
  };
}

// ── office_brand ──────────────────────────────────────────────────────────────
export interface OfficeBrandInput {
  orgId: string; officeName?: string | null; branch?: string | null; geo?: string | null;
  cta?: string | null; teamVisualUrl?: string | null;
}
export function buildOfficeBrand(input: OfficeBrandInput, brand: ResolvedBrand): KindSpec {
  if (!brand.logoTransparent && !brand.logo) throw new KindValidationError("logo", "approved office logo required");
  if (!brand.primaryColor) throw new KindValidationError("colors", "approved office colors required");
  const office = input.officeName ?? brand.officeName;
  if (!office) throw new KindValidationError("office_name", "office name required");
  if (!brand.phone && !brand.email) throw new KindValidationError("contact", "office contact information required");
  const geo = [input.branch, input.geo].filter(Boolean).join(", ");
  return {
    kind: "office_brand",
    brief: `כרטיס מיתוג משרד "${office}"${geo ? ` — ${geo}` : ""}. הדגש נוכחות מקומית ואמינות. לוגו המשרד ופרטי הקשר נשלטים דטרמיניסטית.`,
    headline: office,
    subheadline: geo || null,
    cta: input.cta ?? "צרו קשר",
    features: [input.branch, input.geo].filter(Boolean) as string[],
    agentName: null, agentPhone: brand.phone, logoUrl: brand.logoTransparent ?? brand.logo,
    agentPhoto: input.teamVisualUrl ?? null, palette: paletteFrom(brand), footer: brand.footerText,
    immutableFacts: { office, ...(brand.phone ? { phone: brand.phone } : {}), ...(brand.email ? { email: brand.email } : {}) },
  };
}

// ── market_stat ───────────────────────────────────────────────────────────────
export interface MarketStatInput {
  orgId: string; stat: Partial<MarketStat> & { sourceReference?: string; metricName?: string; comparisonValue?: number | string };
  maxAgeDays?: number; cta?: string | null;
}
export function buildMarketStat(input: MarketStatInput, brand: ResolvedBrand, nowMs: number): KindSpec {
  const v = validateMarketStat(input.stat);
  if (!v.ok) throw new KindValidationError("evidence", `market evidence incomplete: missing ${v.missing.join(", ")}`);
  if (!input.stat.sourceReference) throw new KindValidationError("source_reference", "source reference required");
  // freshness policy
  const ageMs = nowMs - Date.parse(String(input.stat.freshnessTimestamp));
  const maxMs = (input.maxAgeDays ?? 45) * 86400000;
  if (Number.isFinite(ageMs) && ageMs > maxMs) throw new KindValidationError("stale", "market data is stale beyond policy");
  const s = input.stat as MarketStat & { metricName?: string; comparisonValue?: string | number; sourceReference?: string };
  const metric = (s.metricName ?? String(s.subtype)).toString();
  const value = String(s.value) + (s.unit ? ` ${s.unit}` : "");
  return {
    kind: "market_stat",
    brief: `עדכון שוק ל${s.geography} (${s.period}). המדד: ${metric} = ${value}. ${s.comparisonBasis}. ` +
      `מקור: ${s.source} (${s.sourceReference}). סיווג: ${s.classification === "factual" ? "עובדתי" : "מוערך"}. ` +
      `הנתון הוא נתון מקור קבוע ואסור לשנותו, לעגלו או להמציא נתונים נוספים.`,
    headline: `${metric}: ${value}`,
    subheadline: `${s.geography} · ${s.period}`,
    cta: input.cta ?? "לפרטים",
    features: [s.comparisonBasis, `מקור: ${s.source}`].filter(Boolean) as string[],
    agentName: brand.agentName, agentPhone: brand.phone, logoUrl: brand.logoTransparent ?? brand.logo,
    agentPhoto: null, palette: paletteFrom(brand), footer: `${s.source} · ${s.period} · ${s.classification}`,
    immutableFacts: { metric, value, geography: s.geography, period: s.period, source: s.source, source_reference: String(s.sourceReference), classification: s.classification },
  };
}

export type KindInput =
  | { kind: "agent_brand"; input: AgentBrandInput }
  | { kind: "office_brand"; input: OfficeBrandInput }
  | { kind: "market_stat"; input: MarketStatInput };

/** Dispatch to the correct kind builder. `now` injected for deterministic freshness. */
export function buildKindCreative(req: KindInput, brand: ResolvedBrand, now: () => number): KindSpec {
  switch (req.kind) {
    case "agent_brand": return buildAgentBrand(req.input, brand);
    case "office_brand": return buildOfficeBrand(req.input, brand);
    case "market_stat": return buildMarketStat(req.input, brand, now());
  }
}
