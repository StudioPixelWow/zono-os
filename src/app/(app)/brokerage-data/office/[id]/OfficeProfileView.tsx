// ============================================================================
// 🏢 Office profile presentation (RTL). Header + status + stats + active areas +
// agents (safe links — no 404) + properties (always visible, honest empty state).
// Pure presentational — all data is passed in from the server page.
// ============================================================================
import Link from "next/link";
import type { OfficeProfile } from "@/lib/brokerage-data/office-profile";
import type { OfficeInventory } from "@/lib/brokerage-data/office-inventory";
import type { BrokerRankCard } from "@/lib/brokerage-data/broker-intelligence";
import type { OfficeTerritoryIntelligence } from "@/lib/brokerage-data/territory-intelligence";
import { DOMINANCE_BAND_HE } from "@/lib/brokerage-data/territory-intelligence";
import type { OfficeCompetitiveProfile } from "@/lib/brokerage-data/competitive-intelligence";
import type { DecisionPackage } from "@/lib/decision-engine";
import { EXECUTION_HE } from "@/lib/decision-engine";
import { BackfillButton } from "./BackfillButton";

const THREAT_HE: Record<string, string> = { low: "נמוך", moderate: "בינוני", high: "גבוה" };
const MOM_HE: Record<string, string> = { growing: "בצמיחה", stable: "יציב", declining: "בירידה" };

const ATTR_HE: Record<string, string> = { direct: "קישור ישיר למשרד", office_phone: "התאמת טלפון", office_website: "התאמת אתר", derived_broker: "נגזר ממתווך" };
const fmt = (n: number) => n.toLocaleString("he-IL");
const fmtPrice = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL") : "—");

const STATUS_HE: Record<string, string> = { active: "פעיל", candidate: "מועמד (במחקר)", rejected: "נדחה", verified: "מאומת" };
const STATUS_EXPLAIN: Record<string, string> = {
  active: "המשרד אומת מראיות (≥2 מתווכים / קו טלפון משותף / מותג מזוהה).",
  candidate: "מועמד שטרם אומת — נדרשת ראיה נוספת לפני שיוך מלא.",
  rejected: "נדחה — לא עמד בתנאי הראיות (למשל שם של אדם פרטי).",
  verified: "אומת מראיות חזקות.",
};

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "amber" }) {
  const c = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-ink";
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2.5">
      <div className={`text-lg font-black tabular-nums ${c}`}>{typeof value === "number" ? fmt(value) : value}</div>
      <div className="text-muted mt-0.5 text-[11px]">{label}</div>
    </div>
  );
}

function CoverBox({ title, items }: { title: string; items: { key: string; count: number }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2">
      <div className="text-ink font-bold">{title}</div>
      <div className="text-muted mt-1 flex flex-wrap gap-1">
        {items.slice(0, 8).map((it) => <span key={it.key} className="bg-brand-soft/40 rounded-full px-2 py-0.5 font-bold">{it.key} · {fmt(it.count)}</span>)}
      </div>
    </div>
  );
}

export function OfficeProfileView({ profile, inventory, ranking, territory, competitive, decisions }: { profile: OfficeProfile; inventory?: OfficeInventory | null; ranking?: BrokerRankCard[]; territory?: OfficeTerritoryIntelligence | null; competitive?: OfficeCompetitiveProfile | null; decisions?: DecisionPackage | null }) {
  const p = profile;
  const inv = inventory ?? null;
  const rank = ranking ?? [];
  const terr = territory ?? null;
  const comp = competitive ?? null;
  const dec = decisions ?? null;
  const website = p.website ? (p.website.startsWith("http") ? p.website : `https://${p.website}`) : null;
  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <Link href="/brokerage-data" className="text-muted hover:text-ink w-fit text-[12px] font-bold">← חזרה למודיעין משרדי תיווך</Link>

      {/* Header */}
      <section className="border-brand/40 bg-brand-soft/40 rounded-2xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="bg-brand-soft text-brand-strong grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black">{(p.name || "?").trim().charAt(0)}</span>
            <div className="min-w-0">
              <h1 className="text-brand-strong text-2xl font-black">{p.name}</h1>
              <p className="text-muted mt-1 text-[12px]">{[p.brandNetwork, p.city].filter(Boolean).join(" · ") || "—"}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                {p.phone && <span dir="ltr" className="text-ink font-bold">📞 {p.phone}</span>}
                {website && <a href={website} target="_blank" rel="noreferrer" className="text-brand-strong font-bold" dir="ltr">🌐 {p.website}</a>}
                {p.email && <span className="text-muted" dir="ltr">✉ {p.email}</span>}
                {!p.phone && !website && !p.email && <span className="text-muted">אין פרטי קשר מאומתים עדיין</span>}
              </div>
            </div>
          </div>
          <span className="bg-surface rounded-full px-3 py-1 text-[12px] font-bold">{STATUS_HE[p.status] ?? p.status}</span>
        </div>
        <p className="text-muted mt-3 text-[11px] leading-relaxed">{STATUS_EXPLAIN[p.status] ?? ""} עודכן לאחרונה: {fmtDate(p.lastSeenAt)}{p.lastVerifiedAt ? ` · אומת: ${fmtDate(p.lastVerifiedAt)}` : ""}.</p>
      </section>

      {/* Decision Engine — prioritized, evidence-based actions (27.4) */}
      {dec && (dec.decisions.length > 0 || dec.notes.length > 0) && (
        <section className="border-brand/40 bg-brand-soft/20 rounded-2xl border p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-brand-strong text-sm font-black">🧭 החלטות ופעולות מומלצות</h2>
            <span className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-surface px-2 py-0.5 font-bold">ציון עסקי {dec.businessScore}</span>
              <span className="text-muted">ביטחון AI {dec.aiConfidence}%</span>
            </span>
          </div>
          {dec.notes.length > 0 && <p className="text-muted mb-2 text-[11px]">{dec.notes.join(" · ")}</p>}
          <div className="flex flex-col gap-1.5">
            {dec.decisions.map((d) => (
              <div key={d.id} className="border-line bg-surface rounded-xl border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink font-bold">{d.title}</span>
                  <span className="flex items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-surface px-2 py-0.5 font-bold">{d.category}</span>
                    <span className="bg-brand-soft/60 rounded-full px-2 py-0.5 font-bold tabular-nums">עדיפות {d.priorityScore}</span>
                    <span className="text-muted">{EXECUTION_HE[d.executionReadiness]}</span>
                  </span>
                </div>
                <div className="text-muted mt-0.5 text-[11px]">{d.why}</div>
                <div className="text-emerald-700 mt-0.5 text-[10px]">מדוע: {d.evidence.join(" · ")}</div>
                {d.actions.length > 0 && <div className="text-muted mt-0.5 text-[11px]"><b>פעולה:</b> {d.actions.map((a) => `${a.title} (השפעה ${a.expectedImpact}, מאמץ ${a.effort}${a.deadlineDays ? `, ${a.deadlineDays} ימים` : ""})`).join(" · ")}</div>}
              </div>
            ))}
          </div>
          {(dec.risks.length > 0 || dec.opportunities.length > 0) && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 text-[11px]">
              {dec.risks.length > 0 && <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-2"><b className="text-rose-700">סיכונים</b><ul className="text-muted mt-1 flex flex-col gap-0.5">{dec.risks.slice(0, 5).map((r) => <li key={r.id} title={r.evidence}>• {r.title} ({r.severity})</li>)}</ul></div>}
              {dec.opportunities.length > 0 && <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2"><b className="text-emerald-700">הזדמנויות</b><ul className="text-muted mt-1 flex flex-col gap-0.5">{dec.opportunities.slice(0, 5).map((o) => <li key={o.id} title={o.evidence}>• {o.title}</li>)}</ul></div>}
            </div>
          )}
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="סוכנים" value={p.stats.agentCount} tone="green" />
        <Stat label="נכסים" value={p.stats.listingCount} tone="green" />
        <Stat label="ערים" value={p.stats.cities.length} />
        <Stat label="שכונות" value={p.stats.neighborhoods.length} />
        <Stat label="ביטחון" value={`${Math.round(p.confidenceScore)}%`} />
        <Stat label="איכות דאטה" value={`${Math.round(p.dataQualityScore)}%`} />
      </div>

      {/* Office Inventory (direct + derived through brokers) — Phase 26.5 */}
      {inv && (
        <section className="border-line bg-card rounded-2xl border p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-ink text-sm font-black">📦 מלאי המשרד (ישיר + נגזר ממתווכים)</h2>
            <BackfillButton />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="סה״כ נכסים" value={inv.totals.total} tone="green" />
            <Stat label="פעילים" value={inv.totals.active} tone="green" />
            <Stat label="לא פעילים" value={inv.totals.inactive} />
            <Stat label="ישיר למשרד" value={inv.totals.direct} />
            <Stat label="נגזר ממתווכים" value={inv.totals.derivedThroughBrokers} tone="amber" />
            <Stat label="מתווכים פעילים" value={inv.totals.activeBrokers} />
            <Stat label="התנגשויות" value={inv.totals.conflicts} tone={inv.totals.conflicts ? "amber" : undefined} />
          </div>
          {inv.conflicts.length > 0 && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-800">
              <b>התנגשויות שיוך (לא נדרסו):</b> {inv.conflicts.slice(0, 6).map((c) => c.note).join(" · ")}
            </div>
          )}
          {/* Market coverage */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
            <CoverBox title="לפי עיר" items={inv.byCity} />
            <CoverBox title="לפי שכונה" items={inv.byNeighborhood} />
            <CoverBox title="לפי סוג נכס" items={inv.byType} />
            <CoverBox title="לפי טווח מחיר" items={inv.byPriceBand} />
          </div>
        </section>
      )}

      {/* Broker Intelligence — top brokers ranked, not a raw name list */}
      {rank.length > 0 && (
        <section className="border-line bg-card rounded-2xl border p-4">
          <h2 className="text-ink mb-2 text-sm font-black">🧠 מודיעין מתווכים — מובילים לפי פעילות</h2>
          <div className="flex flex-col gap-1.5">
            {rank.slice(0, 12).map((b, i) => (
              <Link key={b.id} href={`/brokerage-data?broker=${b.id}&name=${encodeURIComponent(b.name)}`} className="border-line bg-surface hover:border-brand/40 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors">
                <span className="text-ink truncate font-bold">{i + 1}. {b.name}{b.topAreas.length ? <span className="text-muted font-normal"> · {b.topAreas.join(", ")}</span> : ""}</span>
                <span className="flex shrink-0 items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 tabular-nums">{fmt(b.activeListings)} פעילים</span>
                  <span className="text-muted tabular-nums">{fmt(b.totalListings)} סה״כ · {fmt(b.neighborhoods)} שכונות</span>
                  {b.priceVolume > 0 && <span className="text-muted tabular-nums">₪{fmt(Math.round(b.priceVolume / 1_000_000))}M נפח</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Competitive Position — market rank, competitors, SWOT (26.7) */}
      {comp && (
        <section className="border-line bg-card rounded-2xl border p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-ink text-sm font-black">⚔️ עמדה תחרותית</h2>
            <span className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-brand-soft/60 px-2 py-0.5 font-bold">מדורג #{comp.marketRank} / {fmt(comp.totalOffices)}</span>
              <span className={`rounded-full px-2 py-0.5 font-bold ${comp.momentum === "growing" ? "bg-emerald-50 text-emerald-700" : comp.momentum === "declining" ? "bg-rose-50 text-rose-700" : "bg-surface text-muted"}`}>מומנטום: {MOM_HE[comp.momentum]}{comp.growthPct ? ` (${comp.growthPct > 0 ? "+" : ""}${comp.growthPct}%)` : ""}</span>
              <span className={`rounded-full px-2 py-0.5 font-bold ${comp.threatLevel === "high" ? "bg-rose-50 text-rose-700" : comp.threatLevel === "moderate" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>איום: {THREAT_HE[comp.threatLevel]}</span>
            </span>
          </div>
          <p className="text-muted mb-2 text-[11px]">{comp.rankExplanation}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="נתח מלאי" value={`${comp.listingSharePct}%`} tone="green" />
            <Stat label="נתח מתווכים" value={`${comp.brokerSharePct}%`} />
            <Stat label="נתח יוקרה" value={`${comp.luxurySharePct}%`} />
            <Stat label="נתח מסחרי" value={`${comp.commercialSharePct}%`} />
            <Stat label="שכונות" value={comp.neighborhoods} />
            <Stat label="₪/מ״ר ממוצע" value={comp.avgPricePerSqm ? fmtPrice(comp.avgPricePerSqm) : "—"} />
          </div>
          {comp.insights.length > 0 && <ul className="mt-2 flex flex-col gap-0.5 text-[12px]">{comp.insights.slice(0, 5).map((ins, i) => <li key={i} className="text-ink" title={ins.evidence}>• {ins.text}</li>)}</ul>}
          {/* Top competitors */}
          {comp.competitors.mainCompetitors.length > 0 && (
            <div className="mt-2 text-[11px]"><b>מתחרים עיקריים:</b> {comp.competitors.mainCompetitors.map((c) => `${c.officeName} (${c.note})`).join(" · ")}</div>
          )}
          {comp.competitors.fastestGrowing.length > 0 && (
            <div className="mt-1 text-[11px] text-amber-700"><b>הצומחים מהר:</b> {comp.competitors.fastestGrowing.map((c) => `${c.officeName} ${c.note}`).join(" · ")}</div>
          )}
          {/* SWOT */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
            {([["חוזקות", comp.swot.strengths, "emerald"], ["חולשות", comp.swot.weaknesses, "rose"], ["הזדמנויות", comp.swot.opportunities, "sky"], ["איומים", comp.swot.threats, "amber"]] as const).map(([title, items, tone]) => (
              <div key={title} className="border-line bg-surface rounded-xl border px-3 py-2">
                <div className={`font-bold ${tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : "text-sky-700"}`}>{title}</div>
                {items.length === 0 ? <div className="text-muted mt-1">—</div> : <ul className="text-muted mt-1 flex flex-col gap-0.5">{items.slice(0, 4).map((it, i) => <li key={i} title={it.evidence}>• {it.text}</li>)}</ul>}
              </div>
            ))}
          </div>
          {comp.opportunities.length > 0 && <div className="mt-2 text-[11px] text-emerald-700"><b>הזדמנויות שוק:</b> {comp.opportunities.map((o) => `${o.area ?? o.title} (${o.evidence})`).join(" · ")}</div>}
        </section>
      )}

      {/* Territory Intelligence — market share / dominance / expansion (26.6) */}
      {terr && (terr.topNeighborhoods.length > 0 || terr.insights.length > 0) && (
        <section className="border-line bg-card rounded-2xl border p-4">
          <h2 className="text-ink mb-2 text-sm font-black">🗺️ מודיעין טריטוריה — נתח שוק ודומיננטיות</h2>
          {terr.insights.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1 text-[12px]">
              {terr.insights.map((ins, i) => <li key={i} className="text-ink">• {ins}</li>)}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-muted mb-1 text-[11px] font-bold">שכונות מובילות</div>
              <div className="flex flex-col gap-1">
                {terr.topNeighborhoods.slice(0, 8).map((a) => (
                  <div key={a.name} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5 text-[12px]">
                    <span className="text-ink font-bold">{a.name}</span>
                    <span className="flex items-center gap-2 text-[11px]">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${a.band === "Leader" ? "bg-emerald-100 text-emerald-700" : a.band === "Strong" ? "bg-emerald-50 text-emerald-700" : a.band === "Weak" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{DOMINANCE_BAND_HE[a.band]}</span>
                      <span className="text-muted tabular-nums">{a.sharePct}% · {fmt(a.activeListings)} פעילים</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-muted mb-1 text-[11px] font-bold">רחובות מובילים</div>
              <div className="flex flex-col gap-1">
                {terr.topStreets.slice(0, 8).map((a) => (
                  <div key={a.name} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5 text-[12px]">
                    <span className="text-ink font-bold">{a.name}</span>
                    <span className="text-muted text-[11px] tabular-nums">{a.sharePct}% · {fmt(a.activeListings)} פעילים</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {terr.weakAreas.length > 0 && <div className="text-muted mt-2 text-[11px]"><b>אזורים חלשים:</b> {terr.weakAreas.map((a) => `${a.name} (${a.sharePct}%)`).join(" · ")}</div>}
          {terr.expansionOpportunities.length > 0 && <div className="mt-1 text-[11px] text-emerald-700"><b>הזדמנויות התרחבות:</b> {terr.expansionOpportunities.map((e) => e.name).join(" · ")}</div>}
        </section>
      )}

      {/* Active areas */}
      {(p.stats.cities.length > 0 || p.stats.neighborhoods.length > 0 || p.stats.sources.length > 0) && (
        <section className="border-line bg-card rounded-2xl border p-4">
          <h2 className="text-ink mb-2 text-sm font-black">אזורי פעילות ומקורות</h2>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {p.stats.cities.map((c) => <span key={`c-${c}`} className="bg-brand-soft/50 text-brand-strong rounded-full px-2 py-0.5 font-bold">{c}</span>)}
            {p.stats.neighborhoods.map((n) => <span key={`n-${n}`} className="bg-surface text-muted rounded-full px-2 py-0.5 font-bold">{n}</span>)}
            {p.stats.sources.map((src) => <span key={`s-${src}`} className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">מקור: {src}</span>)}
          </div>
        </section>
      )}

      {/* Agents — links go to the canonical brokerage DNA drawer (never 404). */}
      <section className="border-line bg-card rounded-2xl border p-4">
        <h2 className="text-ink mb-2 text-sm font-black">סוכני המשרד ({fmt(p.agents.length)})</h2>
        {p.agents.length === 0 ? <p className="text-muted text-xs">אין סוכנים משויכים עדיין.</p> : (
          <div className="flex flex-col gap-1.5">
            {p.agents.map((a) => (
              <Link key={a.id} href={`/brokerage-data?broker=${a.id}&name=${encodeURIComponent(a.fullName)}`}
                className="border-line bg-surface hover:border-brand/40 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors">
                <span className="text-ink truncate font-bold">
                  {a.fullName}
                  <span className="text-muted font-normal"> · {a.city ?? "—"}{a.phone ? ` · ${a.phone}` : ""}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px]">
                  <span className="text-muted">{fmt(a.listingCount)} נכסים</span>
                  <span className="bg-surface rounded-full px-2 py-0.5 font-bold tabular-nums">{Math.round(a.confidenceScore)}%</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Listings — with attribution (why each belongs to the office). Uses the
          full inventory (direct + broker-derived) when available. */}
      <section className="border-line bg-card rounded-2xl border p-4">
        <h2 className="text-ink mb-2 text-sm font-black">נכסי המשרד ({fmt(inv ? inv.totals.total : p.stats.listingCount)})</h2>
        {inv ? (
          inv.listings.length === 0 ? (
            <p className="text-muted rounded-xl border border-dashed border-line bg-surface px-3 py-4 text-center text-xs">עדיין לא שויכו נכסים למשרד הזה.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {inv.listings.map((l) => (
                <div key={l.listingId} className="border-line bg-surface rounded-xl border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-ink truncate font-bold">{l.title ?? "מודעה"}{!l.active && <span className="text-muted font-normal"> · לא פעיל</span>}</div>
                      <div className="text-muted truncate text-[11px]">{[l.neighborhood, l.city, l.source].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[11px]">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${l.attribution.derived ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{ATTR_HE[l.attribution.kind] ?? l.attribution.kind}</span>
                      <span className="text-ink font-bold tabular-nums">{fmtPrice(l.price)}</span>
                      {l.listingUrl && <a href={l.listingUrl} target="_blank" rel="noreferrer" className="text-brand-strong font-bold">↗</a>}
                    </div>
                  </div>
                  <div className="text-muted mt-0.5 text-[10px]">מדוע שייך: {l.attribution.reason}{l.attribution.conflictNote ? ` · ⚠ ${l.attribution.conflictNote}` : ""}</div>
                </div>
              ))}
              {inv.totals.total > inv.listings.length && <p className="text-muted mt-1 text-[11px]">מוצגים {fmt(inv.listings.length)} מתוך {fmt(inv.totals.total)} נכסים.</p>}
            </div>
          )
        ) : p.listings.length === 0 ? (
          <p className="text-muted rounded-xl border border-dashed border-line bg-surface px-3 py-4 text-center text-xs">עדיין לא שויכו נכסים למשרד הזה.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {p.listings.map((l) => (
              <div key={l.id} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                <div className="min-w-0"><div className="text-ink truncate font-bold">{l.title ?? "מודעה"}</div><div className="text-muted truncate text-[11px]">{[l.neighborhood, l.city, l.source].filter(Boolean).join(" · ") || "—"}</div></div>
                <div className="flex shrink-0 items-center gap-2 text-[11px]"><span className="text-ink font-bold tabular-nums">{fmtPrice(l.price)}</span>{l.listingUrl && <a href={l.listingUrl} target="_blank" rel="noreferrer" className="text-brand-strong font-bold">↗</a>}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
