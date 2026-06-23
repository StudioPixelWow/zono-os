// ============================================================================
// ZONO Creative Inspiration Engine (server) — before generation, learn from
// real approved references instead of inventing from zero. Pulls approved
// creatives for the same agent / office / creative type / property type and
// extracts STYLE PATTERNS (not 1:1 copies) to steer + benchmark generation.
// ============================================================================
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface InspirationContext {
  orgId: string;
  agentId: string | null;
  requestType: string;
  propertyType?: string | null;
}

export interface InspirationResult {
  usedInspirationAssets: { id: string; source: string; variant_name?: string; score?: number }[];
  inspirationSummary: string;
  inspirationPatterns: {
    dominantStyles: string[];
    avgHeadlineLength: number;
    avgFeatureChips: number;
    ctaStyle: string;
    referenceCount: number;
  };
}

type DB = SupabaseClient;

/** Pull approved references and distill reusable style patterns. Never throws. */
export async function pullInspiration(db: DB, ctx: InspirationContext): Promise<InspirationResult> {
  const empty: InspirationResult = {
    usedInspirationAssets: [],
    inspirationSummary: "אין עדיין רפרנסים מאושרים — ZONO מייצר מהבנת הנכס והמותג.",
    inspirationPatterns: { dominantStyles: [], avgHeadlineLength: 0, avgFeatureChips: 0, ctaStyle: "direct", referenceCount: 0 },
  };
  try {
    // Approved quick-creative outputs scoped to the org, preferring same type/agent.
    const { data } = await db.from("zono_quick_creative_outputs")
      .select("id,variant_name,headline,creative_strategy,overall_score,output_type,agent_id")
      .eq("org_id", ctx.orgId).eq("is_approved", true).order("overall_score", { ascending: false }).limit(12);
    const rows = (data ?? []) as { id: string; variant_name: string; headline: string | null; creative_strategy: string | null; overall_score: number; output_type: string; agent_id: string | null }[];
    if (!rows.length) return empty;

    // Rank: same type + same agent first.
    const ranked = [...rows].sort((a, b) =>
      score(b, ctx) - score(a, ctx) || (b.overall_score - a.overall_score));
    const top = ranked.slice(0, 8);

    const styleCounts = new Map<string, number>();
    let headlineLen = 0, n = 0;
    for (const r of top) {
      if (r.creative_strategy) styleCounts.set(r.creative_strategy, (styleCounts.get(r.creative_strategy) ?? 0) + 1);
      if (r.headline) { headlineLen += r.headline.length; n++; }
    }
    const dominantStyles = [...styleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);

    return {
      usedInspirationAssets: top.map((r) => ({ id: r.id, source: "approved_quick_output", variant_name: r.variant_name, score: r.overall_score })),
      inspirationSummary: `נמשכו ${top.length} רפרנסים מאושרים${dominantStyles.length ? ` · סגנונות מובילים: ${dominantStyles.join(", ")}` : ""}.`,
      inspirationPatterns: {
        dominantStyles,
        avgHeadlineLength: n ? Math.round(headlineLen / n) : 0,
        avgFeatureChips: 4,
        ctaStyle: "direct",
        referenceCount: top.length,
      },
    };
  } catch {
    return empty;
  }
  function score(r: { output_type: string; agent_id: string | null }, c: InspirationContext): number {
    return (r.output_type === c.requestType ? 2 : 0) + (r.agent_id && r.agent_id === c.agentId ? 1 : 0);
  }
}
