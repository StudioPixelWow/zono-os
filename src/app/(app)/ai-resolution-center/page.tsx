// ZONO — PHASE 26.12: AI Resolution Center™ (Human-in-the-Loop). Server entry:
// loads the review queue + learning stats + decision history (real data only)
// and hands them to the client review center. Honest empty states throughout.
import { getResolutionCenterBundle } from "@/lib/agencies/resolution-center/resolutionCenterService";
import { AIResolutionCenter } from "@/components/agencies/resolution-center/AIResolutionCenter";

export const dynamic = "force-dynamic";

export default async function AIResolutionCenterPage() {
  let bundle;
  try {
    bundle = await getResolutionCenterBundle();
  } catch (e) {
    console.error("[ai-resolution-center] load failed:", e);
    bundle = {
      candidates: [],
      learning: { totalDecisions: 0, approvals: 0, rejections: 0, merges: 0, splits: 0, edits: 0, ignores: 0, topApprovedAgencies: [], topRejectedNames: [], topCorrectedAliases: [], aiAccuracy: null, avgConfidenceBefore: null, improvementPct: null },
      history: [],
    };
  }
  return <AIResolutionCenter candidates={bundle.candidates} learning={bundle.learning} history={bundle.history} />;
}
