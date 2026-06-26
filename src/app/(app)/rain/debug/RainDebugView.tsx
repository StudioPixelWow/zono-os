"use client";
// Internal RAIN diagnostic view (Phase 26.9). Shows graph build status + counts.
// Not the War Room — a small read-only diagnostic surface for verification.
import { useActionRunner } from "@/components/ui/useActionRunner";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { buildRainGraphAction } from "@/lib/rain/rainActions";
import type { RainStats, RainConfidenceSummary } from "@/lib/rain/rainTypes";
import type { RainNode, RainEdge } from "@/lib/rain/rainTypes";

export function RainDebugView({
  stats, confidence, latestNodes, latestEdges,
}: { stats: RainStats; confidence: RainConfidenceSummary; latestNodes: RainNode[]; latestEdges: RainEdge[] }) {
  const runner = useActionRunner();
  const build = () => runner.run(() => buildRainGraphAction().then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), {
    pendingMessage: "בונה את גרף ה‑RAIN…",
    success: (d) => `נבנה: ${d.nodes_created} צמתים חדשים · ${d.edges_created} קשתות · ${d.orphan_entities_skipped} ישויות יתום דולגו · ${d.errors} שגיאות`,
  });

  const kpis: { label: string; value: number }[] = [
    { label: "צמתים", value: stats.totalNodes }, { label: "קשתות", value: stats.totalEdges },
    { label: "משרדים", value: stats.agencies }, { label: "מתווכים", value: stats.agents },
    { label: "נכסים", value: stats.properties }, { label: "אזורים", value: stats.territories },
    { label: "אותות פעילים", value: stats.activeSignals }, { label: "איום גבוה", value: stats.highThreatCompetitors },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-extrabold">RAIN — אבחון רשת מודיעין</h1>
          <p className="text-muted mt-1 text-sm">Real Estate AI Intelligence Network · שכבת גרף אסטרטגית (יסוד). נתונים אמיתיים בלבד.</p>
        </div>
        <Button variant="primary" onClick={build} loading={runner.pending}>בנה גרף מחדש</Button>
      </div>

      {(runner.note || runner.error) && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${runner.error ? "border-danger/40 bg-danger-soft/40 text-danger" : "border-success/40 bg-success-soft/40 text-success"}`}>
          {runner.error ?? runner.note}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {kpis.map((k) => (
          <Card key={k.label} padding="sm">
            <div className="text-muted text-xs font-semibold">{k.label}</div>
            <div className="text-ink mt-1 text-2xl font-extrabold">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted font-semibold">ביטחון נתונים:</span>
          <Badge tone="success" size="sm">גבוה {confidence.high}</Badge>
          <Badge tone="warning" size="sm">בינוני {confidence.medium}</Badge>
          <Badge tone="neutral" size="sm">נמוך {confidence.low}</Badge>
          <span className="text-muted">· מדורגים {confidence.scoredNodes} · ללא ציון {confidence.unscoredNodes}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>צמתים אחרונים</CardTitle>
          <div className="mt-3 space-y-1.5">
            {latestNodes.length === 0 ? <div className="text-muted text-sm">אין צמתים עדיין. הרץ &quot;בנה גרף מחדש&quot;.</div> : latestNodes.map((n) => (
              <div key={n.id} className="border-line/70 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm">
                <div className="min-w-0"><span className="text-ink truncate font-semibold">{n.label}</span> <span className="text-muted text-xs">{n.nodeType}</span></div>
                <Badge tone={n.confidence === "high" ? "success" : n.confidence === "medium" ? "warning" : "neutral"} size="sm">
                  {n.importanceScore == null ? "—" : Math.round(n.importanceScore)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>קשתות אחרונות</CardTitle>
          <div className="mt-3 space-y-1.5">
            {latestEdges.length === 0 ? <div className="text-muted text-sm">אין קשתות עדיין.</div> : latestEdges.map((e) => (
              <div key={e.id} className="border-line/70 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm">
                <span className="text-ink font-semibold">{e.edgeType}</span>
                <Badge tone="neutral" size="sm">{e.strength == null ? "—" : Math.round(e.strength)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
