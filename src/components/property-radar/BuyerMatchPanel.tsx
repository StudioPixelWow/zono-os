"use client";
// ============================================================================
// ZONO Property Radar™ — Buyer Match Panel (reusable, RTL).
// Given a shared market property, lists the TOP matching buyers (sorted highest
// score first) with reasons, budget and last activity, plus quick actions:
// open buyer · call · WhatsApp · mark contacted. Lazy-loads matches on mount.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { Phone, MessageCircle, ExternalLink, CheckCircle2, Loader2, Users } from "lucide-react";
import { buildWhatsappUrl, normalizePhoneForWhatsapp } from "@/lib/property-radar/utils";
import {
  getBuyerMatchesForSourceAction,
  updateBuyerMatchStatusAction,
} from "@/lib/property-radar/matching/actions";
import type { MatchLevel, StoredBuyerMatch } from "@/lib/property-radar/matching/types";

const LEVEL_LABEL: Record<MatchLevel, string> = {
  perfect: "התאמה מושלמת",
  excellent: "התאמה מצוינת",
  good: "התאמה טובה",
  possible: "התאמה אפשרית",
  rejected: "—",
};
const LEVEL_TONE: Record<MatchLevel, string> = {
  perfect: "bg-emerald-100 text-emerald-700",
  excellent: "bg-brand-soft text-brand-strong",
  good: "bg-amber-100 text-amber-700",
  possible: "bg-black/5 text-ink/70",
  rejected: "bg-black/5 text-ink/50",
};

function budgetLine(lo: number | null, hi: number | null): string | null {
  const f = (n: number) => `₪${n.toLocaleString("he-IL")}`;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) return `${f(lo)} – ${f(hi)}`;
  if (hi != null) return `עד ${f(hi)}`;
  return `מ‑${f(lo as number)}`;
}

function lastActivity(iso: string | null): string {
  if (!iso) return "טרם נוצר קשר";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "טרם נוצר קשר";
  const days = Math.round((Date.now() - ms) / 86400000);
  if (days <= 0) return "פעילות היום";
  if (days === 1) return "פעילות אתמול";
  if (days < 30) return `פעילות לפני ${days} ימים`;
  return `פעילות לפני ${Math.round(days / 30)} חודשים`;
}

export function BuyerMatchPanel({
  marketPropertySourceId,
  limit = 12,
}: {
  marketPropertySourceId: string;
  limit?: number;
}) {
  const [matches, setMatches] = useState<StoredBuyerMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contacted, setContacted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getBuyerMatchesForSourceAction(marketPropertySourceId, limit);
      if (!alive) return;
      if (res.ok) setMatches(res.data);
      else setError(res.error);
    })();
    return () => { alive = false; };
  }, [marketPropertySourceId, limit]);

  const markContacted = useCallback(async (id: string) => {
    setContacted((c) => ({ ...c, [id]: true }));
    await updateBuyerMatchStatusAction(id, "contacted");
  }, []);

  if (error) {
    return <p dir="rtl" className="rounded-xl bg-red-50 p-3 text-[13px] font-medium text-red-700">{error}</p>;
  }
  if (matches === null) {
    return (
      <div dir="rtl" className="flex items-center justify-center gap-2 rounded-xl bg-brand-soft/40 p-4 text-sm font-semibold text-brand-strong">
        <Loader2 size={16} className="animate-spin" /> טוען קונים מתאימים…
      </div>
    );
  }
  if (matches.length === 0) {
    return (
      <div dir="rtl" className="flex items-center justify-center gap-2 rounded-xl bg-black/5 p-4 text-sm font-medium text-ink/60">
        <Users size={16} /> לא נמצאו קונים מתאימים לנכס זה כרגע
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-black text-brand-strong">
        <Users size={14} /> {matches.length} קונים מתאימים — לפי ציון התאמה
      </p>
      {matches.map((m) => {
        const wa = m.phone ? buildWhatsappUrl(m.phone, `שלום ${m.buyerName}, מצאתי נכס שעשוי להתאים לך.`) : null;
        const tel = m.phone ? `tel:+${normalizePhoneForWhatsapp(m.phone)}` : null;
        const budget = budgetLine(m.budgetMin, m.budgetMax);
        const level = (m.matchLevel as MatchLevel) ?? "possible";
        const done = contacted[m.id] || m.status === "contacted";
        return (
          <div key={m.id} className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-ink">{m.buyerName || "קונה"}</p>
                <p className="mt-0.5 text-[12px] font-medium text-ink/60">
                  {budget ? `${budget} · ` : ""}{lastActivity(m.lastContactedAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-black text-white">{m.matchScore}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${LEVEL_TONE[level]}`}>{LEVEL_LABEL[level]}</span>
              </div>
            </div>

            {m.positives.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {m.positives.slice(0, 5).map((p, i) => (
                  <li key={i} className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{p}</li>
                ))}
              </ul>
            )}

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <a
                href={`/buyers/${m.buyerId}`}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[12px] font-bold text-brand-strong hover:bg-brand-soft/70"
              >
                <ExternalLink size={13} /> פתח קונה
              </a>
              {tel && (
                <a href={tel} className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2.5 py-1.5 text-[12px] font-bold text-ink/80 hover:bg-black/10">
                  <Phone size={13} /> חיוג
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100">
                  <MessageCircle size={13} /> וואטסאפ
                </a>
              )}
              <button
                type="button"
                onClick={() => markContacted(m.id)}
                disabled={done}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition disabled:opacity-60 enabled:hover:bg-black/10 bg-black/5 text-ink/80"
              >
                <CheckCircle2 size={13} /> {done ? "סומן כפנייה" : "סמן יצירת קשר"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
