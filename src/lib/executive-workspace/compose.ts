// ============================================================================
// 🏛️ ZONO OS 2.0 — STAGE 6 · Batch 6.0 · EXECUTIVE WORKSPACE — compose (PURE).
//
// "Executive Compose": the ONLY logic the workspace adds — and it is not
// business logic. It STITCHES already-computed facts into the Morning Brief.
//   · No AI generation. No new sentences. Every `text` is a verbatim string
//     from an existing provider (a decision headline, the memory summary, the
//     coach headline).
//   · No new numbers, no new priorities, no re-ranking. Order follows the
//     provider's own order (decisions are already 1..3; memory summary is one
//     line; journey is one headline).
//   · Deterministic and side-effect free — safe to unit test offline.
// ============================================================================
import type { ExecutiveDecisions } from "@/lib/executive-decision/types";
import type { ExecutiveMemoryReport } from "@/lib/executive-memory/types";
import type { CoachOverview } from "@/lib/journey-coach/engine";
import type { MorningBrief, MorningBriefPoint } from "./types";

/**
 * Build the Morning Brief from facts the workspace has ALREADY fetched for its
 * other cards. Passing the shared objects in (rather than re-fetching) is what
 * keeps this "no duplicate request": Morning Brief adds ZERO provider calls.
 */
export function buildMorningBrief(
  decisions: ExecutiveDecisions | null,
  memory: ExecutiveMemoryReport | null,
  coach: CoachOverview | null,
): MorningBrief {
  const points: MorningBriefPoint[] = [];

  // 1) What changed since the last review — the Executive Memory summary line,
  //    verbatim. This is Memory's own sentence; the workspace never re-diffs.
  if (memory) {
    points.push({ source: "memory", label: "מאז הביקורת האחרונה", text: memory.summary, href: null });
  }

  // 2) The decisions that deserve attention — the EXISTING decision headlines,
  //    verbatim, in the order the Decision Engine already ranked them (1..3).
  if (decisions) {
    if (decisions.noActionRequired) {
      const only = decisions.decisions[0];
      if (only) points.push({ source: "decisions", label: "החלטות", text: only.headline, href: only.links[0] ?? null });
    } else {
      for (const d of decisions.decisions) {
        points.push({ source: "decisions", label: `החלטה ${d.priority}`, text: d.headline, href: d.links[0] ?? null });
      }
    }
  }

  // 3) The org journey posture — the Coach's OWN manager headline (member gets
  //    the projection headline, which is member-safe). Verbatim; no counting.
  if (coach) {
    const journeyText = coach.headline ?? coach.projection?.headline ?? null;
    if (journeyText) points.push({ source: "journey", label: "מסעות", text: journeyText, href: "/journeys" });
  }

  const audience = decisions?.audience ?? memory?.audience ?? coach?.audience ?? "member";
  return { points, empty: points.length === 0, audience };
}
