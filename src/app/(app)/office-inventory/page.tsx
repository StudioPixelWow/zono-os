// ============================================================================
// 🏢 מלאי המשרד — Office Inventory workspace (office inventory ONLY).
// ----------------------------------------------------------------------------
// Independent workspace #2. Shows office-wide listings only (office-owned +
// office exclusives) — never personal-only CRM framing, never external market
// listings. Reuses PropertiesListView with the existing "office" filter.
// Presentation reorg only — no new logic, data or engines.
// ============================================================================
import { listProperties, listPropertyCovers, type PropertyRow } from "@/lib/properties/repository";
import { matchesInventoryTab } from "@/lib/properties/inventory";
import { getSessionContext } from "@/lib/auth/session";
import type { PropertyStatus, PropertyType } from "@/lib/supabase/types";
import { PropertiesListView } from "../properties/PropertiesListView";
import { WorkspaceHeader, WorkspaceLinks, type WorkspaceLink } from "@/components/workspace/WorkspaceHeader";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const num = (v: string | undefined): number | undefined => { if (!v) return undefined; const n = Number(v); return Number.isNaN(n) ? undefined : n; };

const OFFICE_LINKS: WorkspaceLink[] = [
  { href: "/matches", emoji: "✨", label: "הזדמנויות שיתוף פעולה", hint: "Cooperation" },
  { href: "/office-intelligence", emoji: "🏢", label: "מודיעין משרד", hint: "Office Intelligence" },
  { href: "/team", emoji: "🧑‍💼", label: "צוות המשרד", hint: "סוכנים משויכים" },
  { href: "/market-intelligence/map", emoji: "🗺️", label: "מפת המשרד", hint: "Office map" },
];

export default async function OfficeInventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => { const v = sp[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };

  const filters = {
    city: str("city"), type: str("type") as PropertyType | undefined, status: str("status") as PropertyStatus | undefined,
    minPrice: num(str("minPrice")), maxPrice: num(str("maxPrice")), minRooms: num(str("minRooms")), maxRooms: num(str("maxRooms")),
  };

  const { user } = await getSessionContext();
  const currentUserId = user?.id ?? null;

  let rows: PropertyRow[] = [];
  let error = false;
  try { rows = await listProperties(filters); } catch (e) { console.error("[office-inventory] list failed:", e); error = true; }
  // Office inventory only: office-owned + office exclusives, never external.
  rows = rows.filter((r) => matchesInventoryTab(r, "office", currentUserId) && r.source_type !== "external");

  let covers: Record<string, string> = {};
  try { covers = await listPropertyCovers(rows.map((r) => r.id)); } catch (e) { console.error("[office-inventory] covers failed:", e); }

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      <WorkspaceHeader
        emoji="🏢" scope="office" title="מלאי המשרד"
        subtitle="כל נכסי המשרד והבלעדיות במקום אחד — סוכן משויך, זמינות והזדמנויות שיתוף פעולה. ללא ערבוב עם נכסים חיצוניים."
      />
      <WorkspaceLinks links={OFFICE_LINKS} />
      <PropertiesListView
        properties={rows} filters={filters} error={error} currentUserId={currentUserId} covers={covers}
        eyebrow="🏢 מלאי המשרד" title="כל נכסי המשרד"
      />
    </div>
  );
}
