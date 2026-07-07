// ============================================================================
// 🛒 ZONO — Marketplace Intelligence — source registry (pure). PHASE 58.0.
// Documents each marketplace source and its COMPLIANCE posture. ZONO never
// scrapes; sources marked planning_only are for market understanding only.
// Unknown sources are treated as not-allowed until reviewed.
// ============================================================================
import type { SourceInfo, SourceCompliance } from "./types";

const R = (key: string, label: string, compliance: SourceCompliance, allowed: boolean, note: string): SourceInfo =>
  ({ key, label, compliance, allowed, scrapeForbidden: true, note });

export const SOURCE_REGISTRY: SourceInfo[] = [
  R("yad2", "יד2", "manual_assisted", true, "ייבוא דרך הזרימה הקיימת בלבד — ללא גרידה."),
  R("madlan", "מדלן", "manual_assisted", true, "ייבוא דרך הזרימה הקיימת בלבד — ללא גרידה."),
  R("homeless", "הומלס", "manual_assisted", true, "מקור משלים — היכן שמותר, ללא גרידה."),
  R("komo", "קומו", "manual_assisted", true, "מקור משלים — היכן שמותר, ללא גרידה."),
  R("facebook_marketplace", "Facebook Marketplace", "planning_only", false, "תכנון והבנת שוק בלבד — אין ייבוא/גרידה, בכפוף למדיניות Meta."),
  R("developer", "אתרי יזמים/פרויקטים", "manual_assisted", true, "היכן שמותר חוקית בלבד."),
  R("broker_site", "אתרי מתווכים", "manual_assisted", true, "היכן שזמין ומותר בלבד."),
];

const BY_KEY = new Map(SOURCE_REGISTRY.map((s) => [s.key, s]));

const norm = (s: string | null | undefined): string => {
  const k = (s ?? "").trim().toLowerCase();
  if (k.includes("yad2") || k === "yad 2") return "yad2";
  if (k.includes("madlan")) return "madlan";
  if (k.includes("homeless")) return "homeless";
  if (k.includes("komo")) return "komo";
  if (k.includes("facebook") || k.includes("marketplace")) return "facebook_marketplace";
  if (k.includes("developer") || k.includes("project") || k.includes("yzm")) return "developer";
  if (k.includes("broker") || k.includes("agent")) return "broker_site";
  return k;
};

/** Resolve a source's compliance info. Unknown → not allowed until reviewed. */
export function sourceInfo(source: string | null | undefined): SourceInfo {
  const key = norm(source);
  return BY_KEY.get(key) ?? { key: key || "unknown", label: source || "מקור לא ידוע", compliance: "unknown", allowed: false, scrapeForbidden: true, note: "מקור לא מוכר — לא מוצג עד לבדיקת תאימות." };
}

export function sourceLabel(source: string | null | undefined): string { return sourceInfo(source).label; }
