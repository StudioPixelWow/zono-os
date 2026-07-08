// ============================================================================
// 🗺️ ZONO Website Design System™ — AreaGuide (shared, server-safe).
// One premium local market guide rendered by BOTH office (/ai-site .../neighborhood)
// and agent (/ai-agent .../area) routes — no duplication. Cinematic area hero with
// a market stat band, a local-match lead CTA, market overview, featured properties
// (shared luxury card) and Ask-about-this-area. Public-safe: consumes the already
// redacted NeighborhoodAI view model. Nothing fabricated (no schools/transport/deals
// unless present) — missing listings show a premium empty state.
// ============================================================================
import { SiteHero, SiteSection, SiteEmptyState, SiteLeadCta } from "@/components/site-ui";
import { Glass, PropertyCard } from "./ui";
import AskWidget from "./AskWidget";
import type { NeighborhoodAI } from "@/lib/brokerage-site/types";

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const DEMAND_HE = { high: "גבוה", medium: "בינוני", low: "נמוך" } as const;
const trendHe = (t: NeighborhoodAI["stats"]["trend"]) => (t === "up" ? "עולה ↑" : t === "down" ? "יורדת ↓" : "יציבה →");

export function AreaGuide({
  neighborhood: n, slug, base, contactName, whatsapp, phone, cover = null,
  attribution = null, askApiBase, askTitle, allAreasHref = null,
}: {
  neighborhood: NeighborhoodAI; slug: string; base: "ai-site" | "ai-agent";
  contactName: string; whatsapp: string | null; phone: string | null; cover?: string | null;
  attribution?: string | null; askApiBase?: "site-ai" | "agent-site"; askTitle?: string; allAreasHref?: string | null;
}) {
  const stats = [
    { label: "מלאי באזור", value: String(n.stats.inventory) },
    { label: "מחיר ממוצע", value: fmt(n.stats.avgPrice) },
    { label: "ביקוש", value: DEMAND_HE[n.stats.demand] },
    { label: "מגמת מחירים", value: trendHe(n.stats.trend) },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      <SiteHero
        logo={null}
        cover={cover}
        eyebrow={`מדריך נדל״ן מקומי${attribution ? ` · ${attribution}` : ""}`}
        headline={`המדריך החכם לנדל״ן ב${n.name}`}
        subtitle={`${n.city ? `${n.city} · ` : ""}נתוני שוק, נכסים והזדמנויות — הכל במקום אחד`}
        ctas={[
          { label: "נכסים באזור", href: "#featured", variant: "primary" as const },
          { label: "שאל על האזור", href: "#ask", variant: "secondary" as const },
          ...(allAreasHref ? [{ label: "כל האזורים", href: allAreasHref, variant: "secondary" as const }] : []),
        ]}
        stats={stats}
      />

      {/* Market overview */}
      <SiteSection eyebrow="סקירת שוק" title={`מה קורה ב${n.name}`}>
        <Glass className="p-5 sm:p-6"><p className="text-ink text-[14px] leading-relaxed">{n.overview}</p></Glass>
      </SiteSection>

      {/* Local match / lead — turn interest in this area into a conversation */}
      {(whatsapp || phone) && (
        <div className="pt-1">
          <SiteLeadCta name={contactName} whatsapp={whatsapp} phone={phone}
            headline={`מחפשים נכס ב${n.name}? נמצא לכם התאמה`}
            subtitle="כתבו בכמה מילים מה חשוב לכם (תקציב, חדרים, רחוב) ונחזור אליכם עם נכסים מתאימים באזור." />
        </div>
      )}

      {/* Featured properties in this area */}
      <SiteSection id="featured" eyebrow="נכסים באזור" title={`נכסים ב${n.name}`} subtitle="נכסים נבחרים באזור — מתעדכן אוטומטית">
        {n.recommendedListings.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {n.recommendedListings.map((x) => <PropertyCard key={x.id} slug={slug} id={x.id} title={x.title} price={x.price} image={x.image} base={base} />)}
          </div>
        ) : <SiteEmptyState icon="🏠" title={`אין כרגע נכסים ב${n.name}`} hint="המלאי מתעדכן אוטומטית — פנו אלינו ונעדכן אתכם ברגע שיהיה נכס מתאים באזור." />}
      </SiteSection>

      {/* Ask about this area */}
      <SiteSection id="ask" eyebrow="בינה מלאכותית" title={`שאל על ${n.name}`} subtitle="מחירים, ביקוש והזדמנויות באזור — תשובות מיידיות">
        <AskWidget slug={slug} office={contactName} apiBase={askApiBase} title={askTitle ?? `שאל על ${n.name}`}
          suggestions={[`מה המחירים ב${n.name}?`, `אילו נכסים יש ב${n.name}?`, "כדאי להשקיע כאן?", "מה מגמת השוק באזור?"]} />
      </SiteSection>
    </main>
  );
}
