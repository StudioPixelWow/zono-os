"use client";
// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — entity relationships panel (RTL). PHASE 51.0.
// Embeddable on ANY entity page (buyer/seller/lead/property/office/…). Shows the
// entity's evidence-backed connections with confidence + freshness + verification.
// Read-only. Honest empty / loading / error states. Never fabricates a link.
// ============================================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getEntityRelationshipsAction } from "@/lib/universal-graph/actions";
import type { RelationshipSummary, SummaryConnection } from "@/lib/universal-graph/types";

const FRESH_HE: Record<string, string> = { fresh: "עדכני", recent: "אחרון", stale: "ישן", expired: "מיושן", unknown: "—" };
const VERIF_HE: Record<string, string> = { verified: "מאומת", corroborated: "מגובה", single_source: "מקור יחיד", unverified: "לא מאומת" };
const confCls = (v: number) => (v >= 70 ? "bg-success-soft text-success" : v >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger");

export function EntityRelationshipsPanel({ entityType, entityId, entityName, embedded = true }: { entityType: string; entityId: string; entityName?: string; embedded?: boolean }) {
  const [summary, setSummary] = useState<RelationshipSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEntityRelationshipsAction({ entityType, entityId, entityName })
      .then((r) => {
        if (cancelled) return;
        if (r.error) { setErr(r.error); setState("error"); }
        else { setSummary(r.summary ?? null); setState("ready"); }
      })
      .catch(() => { if (!cancelled) { setErr("טעינת הקשרים נכשלה"); setState("error"); } });
    return () => { cancelled = true; };
  }, [entityType, entityId, entityName]);

  const wrap = (child: React.ReactNode) =>
    embedded ? <div className="bg-card border-line rounded-[20px] border p-4" dir="rtl">{child}</div> : <div dir="rtl">{child}</div>;

  return wrap(
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="text-brand"><Icon name="Route" size={16} /></span><h3 className="text-ink text-sm font-extrabold">גרף קשרים</h3></div>
        {summary && summary.hasData && <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[11px] font-bold">{summary.totalConnections} קשרים</span>}
      </div>

      {state === "loading" && <p className="text-muted flex items-center gap-2 py-6 text-sm"><Icon name="Loader" size={15} /> טוען קשרים…</p>}
      {state === "error" && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{err}</p>}

      {state === "ready" && summary && (
        summary.hasData ? (
          <div className="space-y-3">
            {summary.byType.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {summary.byType.map((g) => <span key={g.type} className="bg-surface text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">{g.typeHe} · {g.count}</span>)}
              </div>
            )}
            <div className="space-y-2">
              {summary.connections.slice(0, 12).map((c, i) => <ConnectionRow key={`${c.id}-${i}`} c={c} />)}
            </div>
            {summary.notes.map((n, i) => <p key={i} className="text-muted text-[11px]">🔒 {n}</p>)}
          </div>
        ) : (
          <div className="text-muted flex flex-col items-center gap-2 py-8 text-center">
            <span className="bg-surface grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Route" size={22} /></span>
            <p className="text-ink text-sm font-bold">אין עדיין קשרים מתועדים</p>
            <p className="max-w-xs text-[12px]">קשרים נוצרים אוטומטית ככל שנרשמת פעילות — שיחות, התאמות, פגישות, קמפיינים ופרסום.</p>
          </div>
        )
      )}
    </>,
  );
}

function ConnectionRow({ c }: { c: SummaryConnection }) {
  const body = (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-[13px] font-bold">{c.name} <span className="text-muted font-normal">· {c.kindHe}</span></p>
          <p className="text-muted text-[11px]">{c.direction === "out" ? "→" : "←"} {c.relationHe}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", confCls(c.confidence))}>ביטחון {c.confidence}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="bg-card text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">{FRESH_HE[c.freshnessLevel] ?? "—"}</span>
        <span className="bg-card text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">{VERIF_HE[c.verification] ?? c.verification}</span>
        {c.evidence.length > 0 && <span className="text-muted truncate text-[10px]">📎 {c.evidence[0]}</span>}
      </div>
    </div>
  );
  return c.href && c.href !== "#" ? <Link href={c.href} className="block">{body}</Link> : body;
}
