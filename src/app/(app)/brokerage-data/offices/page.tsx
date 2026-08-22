// ============================================================================
// 🏢 זירת המשרדים — Office Intelligence (/brokerage-data/offices). Rebuilt from
// the "מדריך המשרדים" phone book (which showed only 2 offices due to a territory +
// status="active" hard-cut) into an honest office-intelligence cockpit. ONE
// canonical selector (getOfficeCockpit) reads the shared detected office/agent
// graph + this org's observed listing links, aggregates per office server-side,
// and surfaces the unassigned pool honestly. No ingestion/step/confidence UI.
// ============================================================================
import { getOfficeCockpit } from "@/lib/office-intel/service";
import { OfficeCockpitView } from "./OfficeCockpitView";
import type { OfficeFilters } from "@/lib/office-intel/cockpit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

function parseFilters(sp: SP): OfficeFilters {
  const period = Number(one(sp.period)) === 90 ? 90 : 30;
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));
  return { city: one(sp.city), search: one(sp.q), period, page };
}
function buildBaseHref(f: OfficeFilters): string {
  const p = new URLSearchParams();
  if (f.city) p.set("city", f.city);
  if (f.search) p.set("q", f.search);
  const qs = p.toString();
  return `/brokerage-data/offices?${qs ? qs + "&" : ""}`;
}

export default async function BrokerageOfficesIndexPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = parseFilters(await searchParams);
  const bundle = await getOfficeCockpit(filters);
  return (
    <div dir="rtl" data-ui-version="office-intelligence-3" className="flex flex-col gap-4">
      <OfficeCockpitView bundle={bundle} baseHref={buildBaseHref(filters)} />
    </div>
  );
}
