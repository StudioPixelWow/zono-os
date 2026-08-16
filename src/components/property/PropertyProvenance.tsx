// ============================================================================
// ZONO — Property provenance (P10C §9). A SUBTLE, agent-private surface shown on
// the internal property detail when the property was found/imported by ZONO from
// an external source (e.g. claimed via "שלי" or promoted from an external
// listing). Shows only source + import date (+ optional source link). It NEVER
// exposes internal confidence, evidence, broker internals, or claim reasoning,
// and it is not part of the public agent website.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";

interface ProvenanceLike {
  property_origin?: string | null;
  source_type?: string | null;
  external_source?: string | null;
  source_listing_url?: string | null;
  source_last_synced_at?: string | null;
  created_at?: string | null;
}

const SOURCE_LABEL: Record<string, string> = { yad2: "יד2", madlan: "מדלן", manual: "ידני" };

export function PropertyProvenance({ property }: { property: ProvenanceLike }) {
  const isImported = property.property_origin === "external_imported" || property.source_type === "external";
  if (!isImported) return null;

  const source = property.external_source ? (SOURCE_LABEL[property.external_source] ?? property.external_source) : null;
  const dateIso = property.source_last_synced_at ?? property.created_at ?? null;
  const dateLabel = dateIso ? new Date(dateIso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

  return (
    <div dir="rtl" className="bg-brand-soft/60 border-line flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-[12px]">
      <span className="text-[var(--brand-strong,#6d28d9)] inline-flex items-center gap-1.5 font-black">
        <Icon name="Sparkles" size={13} /> נמצא על ידי ZONO
      </span>
      {source && <span className="text-muted">מקור: <span className="text-ink font-semibold">{source}</span></span>}
      {dateLabel && <span className="text-muted">יובא: <span className="text-ink font-semibold">{dateLabel}</span></span>}
      {property.source_listing_url && (
        <a href={property.source_listing_url} target="_blank" rel="noreferrer" className="text-[var(--brand-strong,#6d28d9)] inline-flex items-center gap-1 font-bold hover:underline">
          <Icon name="ExternalLink" size={12} /> למודעת המקור
        </a>
      )}
      <span className="text-muted/70 mr-auto text-[11px]">גלוי לך בלבד</span>
    </div>
  );
}
