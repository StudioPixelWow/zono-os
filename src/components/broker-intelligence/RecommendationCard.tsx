// ============================================================================
// 🧠 ZONO — Broker Intelligence · RecommendationCard (presentational).
// Renders ONE evidence-based recommendation exactly as the contract mandates:
// title · WHY · evidence (each with its source) · confidence · expected impact ·
// suggested action · honest "insufficient evidence" state. Area-agnostic — every
// intelligence area (acquisition/buyer/seller/deal/daily/office) reuses this.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { Recommendation, Urgency, DataSource } from "@/lib/broker-intelligence/types";

const URGENCY: Record<Urgency, { label: string; cls: string }> = {
  critical: { label: "קריטי", cls: "bg-danger-soft text-danger" },
  high: { label: "גבוה", cls: "bg-warning-soft text-warning" },
  medium: { label: "בינוני", cls: "bg-brand-soft text-brand" },
  low: { label: "נמוך", cls: "bg-surface text-muted" },
};

const SOURCE_HE: Record<DataSource, string> = {
  external_listings: "מודעות חיצוניות", crm: "CRM", matching: "מנוע התאמות",
  market: "נתוני שוק", timeline: "ציר זמן", marketing: "שיווק", activity: "פעילות",
  deals: "עסקאות", documents: "מסמכים", meetings: "פגישות", journeys: "מסע לקוח",
};

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const u = URGENCY[rec.urgency];
  return (
    <div className="bg-card border-line rounded-[18px] border p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-ink text-sm font-extrabold leading-snug">{rec.title}</p>
        {rec.insufficientEvidence ? (
          <span className="bg-surface text-muted shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold">ראיות חלקיות</span>
        ) : (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${u.cls}`}>{u.label} · {rec.confidence}%</span>
        )}
      </div>

      {/* WHY */}
      <p className="text-ink mb-2 text-[13px] leading-relaxed"><span className="text-muted font-bold">למה: </span>{rec.why}</p>

      {/* Evidence — each line names its real source */}
      {rec.evidence.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {rec.evidence.map((e, i) => (
            <li key={i} className="text-muted flex items-center gap-1.5 text-[12px]">
              <Icon name="Check" size={12} />
              <span className="text-ink">{e.label}</span>
              <span className="text-muted">· {SOURCE_HE[e.source]}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Impact + action */}
      {!rec.insufficientEvidence && (
        <p className="text-brand-strong mb-2 text-[12px] font-bold">השפעה צפויה: {rec.expectedImpact}</p>
      )}
      <div className="border-line flex items-center justify-between gap-2 border-t pt-2.5">
        <p className="text-ink text-[12px] font-semibold">→ {rec.suggestedAction}</p>
        {rec.href && (
          <Link href={rec.href} className="text-brand-strong shrink-0 text-[12px] font-bold">פתח ↗</Link>
        )}
      </div>
    </div>
  );
}
