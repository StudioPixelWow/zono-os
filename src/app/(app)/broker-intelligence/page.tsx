// ============================================================================
// 🛰️ זירת המתווכים — Broker Intelligence (/broker-intelligence). Rebuilt from a
// broker phone-book into a market-intelligence cockpit. ONE canonical selector
// (getBrokerCockpit) reads the OBSERVED evidence (external listings + broker
// detection) once, bounded, org-scoped (RLS), and derives the whole model. The
// raw directory is the last, bounded, paginated layer. No private CRM data.
// ============================================================================
import { getBrokerCockpit } from "@/lib/broker-intel/service";
import { BrokerCockpitView } from "./BrokerCockpitView";
import type { BrokerFilters } from "@/lib/broker-intel/cockpit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

function parseFilters(sp: SP): BrokerFilters {
  const period = Number(one(sp.period)) === 90 ? 90 : 30;
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));
  return { city: one(sp.city), search: one(sp.q), period, page };
}
function buildBaseHref(f: BrokerFilters): string {
  const p = new URLSearchParams();
  if (f.city) p.set("city", f.city);
  if (f.search) p.set("q", f.search);
  if (f.period !== 30) p.set("period", String(f.period));
  const qs = p.toString();
  return `/broker-intelligence?${qs ? qs + "&" : ""}`;
}

export default async function BrokerIntelligencePage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = parseFilters(await searchParams);
  const bundle = await getBrokerCockpit(filters);
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <BrokerCockpitView bundle={bundle} baseHref={buildBaseHref(filters)} />
    </div>
  );
}
