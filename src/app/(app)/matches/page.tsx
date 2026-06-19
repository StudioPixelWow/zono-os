import { createClient } from "@/lib/supabase/server";
import { listMatchBoard, type MatchBoard } from "@/lib/matching-intelligence/service";
import { matchIntelligenceRepository } from "@/lib/matching-intelligence/repository";
import { MatchesView, type MatchRow } from "./MatchesView";

export const dynamic = "force-dynamic";

const EMPTY: MatchBoard = { bestOpportunities: [], dealsAtRisk: [], highestClosing: [], stalled: [], revenuePipeline: 0, total: 0 };

export default async function MatchesPage() {
  let rows: MatchRow[] = [];
  let board: MatchBoard = EMPTY;
  try {
    const supabase = await createClient();
    const [matches, b, buyersRes, propsRes] = await Promise.all([
      matchIntelligenceRepository.listForOrg(),
      listMatchBoard(),
      supabase.from("buyers").select("id,full_name"),
      supabase.from("properties").select("id,title"),
    ]);
    board = b;
    const bn = new Map((buyersRes.data ?? []).map((x) => [x.id, x.full_name]));
    const pn = new Map((propsRes.data ?? []).map((x) => [x.id, x.title]));
    rows = matches.slice(0, 50).map((m) => ({
      id: m.id,
      label: `${bn.get(m.buyer_id) ?? "קונה"} ← ${pn.get(m.property_id) ?? "נכס"}`,
      compatibility: m.compatibility_score,
      closing: m.closing_probability,
      opportunity: m.opportunity_score,
      risk: m.risk_score,
      stage: m.match_stage,
      commission: m.estimated_commission,
    }));
  } catch (e) {
    console.error("[matches] load failed:", e);
  }

  return (
    <div className="flex flex-col gap-6">
      <MatchesView rows={rows} board={board} />
    </div>
  );
}
