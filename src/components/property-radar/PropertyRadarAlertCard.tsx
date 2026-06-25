"use client";
// ============================================================================
// ZONO Property Radar™ — alert card (presentational). RTL, premium, command-
// center feel. Resilient to missing image / price / reasons.
// ============================================================================
import { Building2, MapPin, Sparkles, BedDouble, Ruler, Layers, Clock } from "lucide-react";
import type { PropertyRadarAlertDTO } from "@/lib/property-radar/alerts/types";

function formatPrice(price?: number | null): string | null {
  if (price == null || !Number.isFinite(price)) return null;
  return `${price.toLocaleString("he-IL")} ₪`;
}

function timeAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "ממש עכשיו";
  if (mins < 60) return `לפני ${mins} ד׳`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  const days = Math.round(hrs / 24);
  return `לפני ${days} ימים`;
}

const PROVIDER_LABEL: Record<string, string> = { mock: "בדיקה", yad2: "יד2", madlan: "מדלן" };

export function PropertyRadarAlertCard({ alert }: { alert: PropertyRadarAlertDTO }) {
  const m = alert.metadata ?? {};
  const price = formatPrice(m.price);
  const published = timeAgo(m.publishedAt);
  const score = alert.opportunityScore ?? m.opportunityScore ?? null;
  const reasons = (m.reasons ?? []).filter(Boolean);
  const addr =
    m.addressText ??
    ([m.street, m.neighborhood, m.city].filter(Boolean).join(", ") || m.city || "");
  const providerLabel = m.provider ? PROVIDER_LABEL[m.provider] ?? m.provider : null;

  return (
    <div dir="rtl" className="flex flex-col">
      {/* Header band */}
      <div className="zono-gradient relative overflow-hidden px-5 pt-5 pb-4 text-white">
        <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold">
            <Sparkles size={13} /> ZONO Property Radar
          </span>
          {providerLabel && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">{providerLabel}</span>
          )}
          {score != null && (
            <span className="mr-auto rounded-full bg-white px-2.5 py-1 text-[12px] font-black text-brand-strong">
              ציון {Math.round(score)}
            </span>
          )}
        </div>
        <h2 className="relative mt-3 text-2xl font-black leading-tight">{alert.title}</h2>
        {alert.message && <p className="relative mt-1 text-sm font-semibold text-white/90">{alert.message}</p>}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 px-5 py-4">
        {/* Image */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-brand-soft/40">
          {m.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.imageUrl} alt={addr || "נכס"} className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 w-full items-center justify-center text-brand-strong/40">
              <Building2 size={48} />
            </div>
          )}
        </div>

        {/* Address + price */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {addr && (
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <MapPin size={15} className="shrink-0 text-brand-strong" />
                <span className="truncate">{addr}</span>
              </p>
            )}
            {m.propertyType && <p className="mt-0.5 text-xs font-medium text-ink/60">{m.propertyType}</p>}
          </div>
          {price && <p className="shrink-0 text-lg font-black text-brand-strong">{price}</p>}
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-ink/80">
          {m.rooms != null && <Stat icon={<BedDouble size={14} />} label={`${m.rooms} חד׳`} />}
          {m.sizeSqm != null && <Stat icon={<Ruler size={14} />} label={`${m.sizeSqm} מ״ר`} />}
          {m.floor != null && m.floor !== "" && <Stat icon={<Layers size={14} />} label={`קומה ${m.floor}`} />}
          {published && <Stat icon={<Clock size={14} />} label={published} />}
        </div>

        {/* Reasons */}
        {reasons.length > 0 && (
          <div className="rounded-2xl bg-brand-soft/50 p-3">
            <p className="mb-2 text-xs font-black text-brand-strong">למה ZONO ממליץ?</p>
            <ul className="flex flex-col gap-1.5">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] font-medium text-ink/85">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {r}
                </li>
              ))}
            </ul>
            {m.recommendation && (
              <p className="mt-2 border-t border-black/5 pt-2 text-[13px] font-bold text-brand-strong">
                {m.recommendation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1">
      {icon}
      {label}
    </span>
  );
}
