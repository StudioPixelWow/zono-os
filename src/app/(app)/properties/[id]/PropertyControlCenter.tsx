// ============================================================================
// ZONO — Property Lifecycle CONTROL CENTER (server component). ONE operational
// view of a property: hero + the single next action, then MAIN (marketing,
// matching funnel, customer responses, viewings) and a compact RAIL (seller,
// deal, media, timeline). Desktop uses real width (2-col); mobile stacks in the
// spec order. RTL, design tokens, real facts only, working CTAs. All data comes
// from getPropertyLifecycleControlCenter — no fetching logic here.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/dashboard/Icon";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPropertyLifecycleControlCenter } from "@/lib/properties/control-center";
import { MarketingAutopilotBlock } from "./MarketingAutopilotBlock";

const ils = (n: number | null) => (n == null ? "" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : `₪${Math.round(n).toLocaleString("he-IL")}`);
const dt = (iso: string | null) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }); } catch { return ""; } };
const dtime = (iso: string | null) => { if (!iso) return ""; try { return new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

function Card({ title, cta, children }: { title?: string; cta?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      {(title || cta) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <p className="text-ink text-sm font-extrabold">{title}</p>}
          {cta && <Link href={cta.href} className="text-brand shrink-0 text-xs font-bold hover:underline">{cta.label}</Link>}
        </div>
      )}
      {children}
    </div>
  );
}
function Chip({ tone, children }: { tone: "brand" | "success" | "warning" | "muted"; children: React.ReactNode }) {
  const cls = tone === "success" ? "bg-success-soft text-success" : tone === "warning" ? "bg-warning-soft text-warning" : tone === "muted" ? "bg-surface text-muted" : "bg-brand-soft text-brand";
  return <span className={`${cls} rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap`}>{children}</span>;
}
function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" | "warning" }) {
  return (
    <div className="border-line flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted shrink-0 text-xs">{label}</span>
      <span className={`text-end text-sm font-bold ${tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink"}`}>{value}</span>
    </div>
  );
}
function Empty({ text }: { text: string }) { return <p className="text-muted py-1 text-sm">{text}</p>; }

export async function PropertyControlCenter({ propertyId }: { propertyId: string }) {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return null;
  let isManager = false;
  try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }

  const cc = await getPropertyLifecycleControlCenter(orgId, propertyId, { isManager });
  if (!cc) return <Card title="מרכז שליטה"><Empty text="לא נמצאו נתונים לנכס זה." /></Card>;

  const id = cc.property.id;
  const naTone = cc.nextAction.priority === "P0" ? "danger" : cc.nextAction.priority === "P1" ? "brand" : "muted";
  const naCls = naTone === "danger" ? "bg-danger-soft border-danger/30" : naTone === "brand" ? "bg-brand-soft border-brand/30" : "bg-surface border-line";

  return (
    <div className="flex flex-col gap-5">
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border">
        <div className="flex flex-col gap-0 sm:flex-row">
          {cc.property.imageUrl ? (
            <div className="relative h-44 w-full shrink-0 sm:h-auto sm:w-64">
              <Image src={cc.property.imageUrl} alt="" fill className="object-cover" sizes="256px" />
            </div>
          ) : null}
          <div className="flex flex-1 flex-col gap-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="brand">{cc.stateLabel}</Chip>
              {cc.marketing.activeCampaign ? <Chip tone="success">משווק</Chip> : <Chip tone="muted">לא משווק</Chip>}
              {cc.property.agentName && <Chip tone="muted">{cc.property.agentName}</Chip>}
            </div>
            <h1 className="text-ink text-xl font-black">{cc.property.title ?? "נכס"}</h1>
            <p className="text-muted text-sm">{[cc.property.city, ils(cc.property.price)].filter(Boolean).join(" · ")}</p>
            {/* compact operational summary */}
            <div className="mt-1 flex flex-wrap gap-4">
              <Mini label="קונים מתאימים" value={cc.matching.total} />
              <Mini label="נשלח" value={cc.funnel.sent} />
              <Mini label="מעוניינים" value={cc.funnel.interested} />
              <Mini label="ביקורים" value={cc.viewings.completedCount + cc.viewings.scheduled} />
              <Mini label="עסקה" value={cc.deal ? "פעילה" : "—"} />
            </div>
          </div>
        </div>
      </div>

      {/* ── NEXT ACTION ──────────────────────────────────────────────────────── */}
      <div className={`${naCls} flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-5`}>
        <div className="min-w-0">
          <p className="text-muted mb-1 text-xs font-bold">הפעולה הבאה {cc.nextAction.priority !== "none" ? `· ${cc.nextAction.priority}` : ""}</p>
          <p className="text-ink text-base font-extrabold">{cc.nextAction.label}</p>
        </div>
        {cc.nextAction.cta ? (
          <Link href={cc.nextAction.href} className="bg-brand shrink-0 rounded-xl px-5 py-2.5 text-sm font-extrabold text-white">{cc.nextAction.cta}</Link>
        ) : null}
      </div>

      {/* ── MAIN + RAIL ──────────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* MAIN */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Marketing */}
          <Card title="שיווק" cta={{ label: "ניהול שיווק", href: "/distribution" }}>
            <div className="flex flex-col">
              <Row label="קמפיין פעיל" value={cc.marketing.activeCampaign ? "כן" : "לא"} tone={cc.marketing.activeCampaign ? "success" : undefined} />
              <Row label="פרסומים" value={cc.marketing.publications} />
              <Row label="פרסום הבא" value={cc.marketing.nextScheduledAt ? dtime(cc.marketing.nextScheduledAt) : "לא מתוזמן"} />
              {cc.marketing.failedPublications > 0 && <Row label="פרסומים שנכשלו" value={cc.marketing.failedPublications} tone="warning" />}
            </div>
            {!cc.marketing.activeCampaign && cc.marketing.publications === 0 && (
              <Link href={`/distribution/campaign-wizard?property=${id}`} className="bg-brand-soft text-brand mt-3 inline-block rounded-xl px-4 py-2 text-sm font-bold">הנכס עדיין לא משווק — צור קמפיין</Link>
            )}
          </Card>

          {/* Marketing Autopilot — state + one recommended action + prepared plan */}
          <MarketingAutopilotBlock propertyId={id} />

          {/* Matching */}
          <Card title={`קונים מתאימים · ${cc.matching.total}`} cta={{ label: "כל ההתאמות", href: `/properties/${id}` }}>
            {cc.matching.top.length === 0 ? (
              <Empty text="אין עדיין התאמות. ניתן לעדכן דרישות קונים כדי לשפר התאמה." />
            ) : (
              <ul className="flex flex-col gap-2">
                {cc.matching.top.map((m) => (
                  <li key={m.buyerId} className="border-line flex items-center justify-between gap-2 rounded-2xl border p-3">
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-bold">{m.name}</p>
                      {m.reason && <p className="text-muted truncate text-xs">{m.reason}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {m.compatibility != null && <span className="text-brand text-sm font-black">{m.compatibility}%</span>}
                      <Chip tone={m.status === "interested" || m.status === "viewing_requested" ? "success" : m.status === "rejected" ? "muted" : "brand"}>{m.statusLabel}</Chip>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {/* Funnel */}
            <div className="text-muted mt-3 flex flex-wrap items-center gap-1 text-xs">
              <FunnelStep label="התאמות" v={cc.funnel.matched} />→<FunnelStep label="נשלחו" v={cc.funnel.sent} />→<FunnelStep label="הגיבו" v={cc.funnel.responded} />→<FunnelStep label="מעוניינים" v={cc.funnel.interested} />→<FunnelStep label="ביקשו ביקור" v={cc.funnel.viewingRequested} />
            </div>
          </Card>

          {/* Customer responses */}
          <Card title="תגובות לקוחות">
            {cc.responses.length === 0 ? <Empty text="טרם התקבלו תגובות." /> : (
              <ul className="flex flex-col gap-2">
                {cc.responses.map((r, i) => (
                  <li key={`${r.contactId}:${i}`} className="border-line flex items-center justify-between gap-2 rounded-2xl border p-3">
                    <div className="min-w-0"><p className="text-ink truncate text-sm font-bold">{r.name}</p><p className="text-muted text-xs">{dt(r.at)}</p></div>
                    <Chip tone={r.status === "interested" || r.status === "viewing_requested" ? "success" : "muted"}>{r.statusLabel}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Viewings */}
          <Card title="ביקורים" cta={{ label: "כל הביקורים", href: `/properties/${id}` }}>
            {cc.viewings.upcoming.length === 0 && cc.viewings.completed.length === 0 ? (
              <Empty text="אין ביקורים מתוזמנים." />
            ) : (
              <div className="flex flex-col gap-3">
                {cc.viewings.upcoming.length > 0 && (
                  <div>
                    <p className="text-muted mb-1 text-xs font-bold">קרובים</p>
                    <ul className="flex flex-col gap-1">
                      {cc.viewings.upcoming.map((v) => (
                        <li key={v.id} className="text-ink flex items-center justify-between text-sm"><span>{v.buyerName ?? "מתעניין"}</span><span className="text-muted">{dtime(v.at)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {cc.viewings.completed.length > 0 && (
                  <div>
                    <p className="text-muted mb-1 text-xs font-bold">התקיימו</p>
                    <ul className="flex flex-col gap-1">
                      {cc.viewings.completed.map((v) => (
                        <li key={v.id} className="text-ink flex items-center justify-between text-sm"><span>{v.buyerName ?? "מתעניין"}</span><span className="text-muted">{dt(v.at)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Follow-up exceptions */}
          {cc.followups.length > 0 && (
            <Card title="פולואפ שדורש טיפול">
              <ul className="flex flex-col gap-2">
                {cc.followups.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink truncate text-sm">{f.title}</span>
                    {f.overdue ? <Chip tone="warning">באיחור</Chip> : f.priority === "urgent" ? <Chip tone="warning">דחוף</Chip> : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* RAIL */}
        <div className="flex flex-col gap-5">
          {/* Seller */}
          <Card title="בעל הנכס" cta={cc.seller.sellerId ? { label: "לבעל הנכס", href: `/sellers/${cc.seller.sellerId}` } : undefined}>
            {!cc.seller.sellerId ? (
              <Link href={`/properties/${id}`} className="text-warning text-sm font-bold">לא מקושר בעל נכס — יש לקשר</Link>
            ) : (
              <div className="flex flex-col">
                <Row label="בעל הנכס" value={cc.seller.sellerName ?? "—"} />
                <Row label="עדכון אחרון" value={cc.seller.lastUpdate ? `${cc.seller.lastUpdate.kind} · ${dt(cc.seller.lastUpdate.at)}` : "טרם עודכן"} />
                <Row label="דוחות שנשלחו" value={cc.seller.reportsSent} />
                <Row label="דיווח במייל" value={cc.seller.receivesReports ? "מנוי" : "כבוי"} />
                {cc.seller.attentionReasons[0] && <div className="bg-warning-soft text-warning mt-2 rounded-xl px-3 py-2 text-xs font-bold">{cc.seller.attentionReasons[0]}</div>}
              </div>
            )}
          </Card>

          {/* Deal */}
          {cc.deal ? (
            <Card title="עסקה" cta={{ label: "פתח עסקה", href: `/deals/${cc.deal.id}` }}>
              <div className="flex flex-col">
                <Row label="שלב" value={cc.deal.stage} />
                {cc.deal.buyerName && <Row label="קונה" value={cc.deal.buyerName} />}
                {cc.deal.value != null && <Row label="שווי" value={ils(cc.deal.value)} />}
                <Row label="ימים בשלב" value={cc.deal.daysInStage} />
                {cc.deal.offers.length > 0 && <Row label="הצעות פעילות" value={cc.deal.offers.length} />}
              </div>
            </Card>
          ) : cc.dealReadyBuyer ? (
            <Card title="עסקה">
              <p className="text-ink mb-3 text-sm font-bold">לקוח מוכן להתקדם</p>
              <Link href={`/properties/${id}`} className="bg-brand inline-block rounded-xl px-4 py-2 text-sm font-extrabold text-white">פתיחת עסקה</Link>
            </Card>
          ) : null}

          {/* Price / strategy */}
          {(cc.marketing.priceUpdatesSent > 0 || cc.seller.attentionReasons.length > 0) && (
            <Card title="מחיר ואסטרטגיה">
              <div className="flex flex-col">
                <Row label="מחיר נוכחי" value={ils(cc.property.price) || "—"} />
                {cc.marketing.priceUpdatesSent > 0 && <Row label="עדכוני מחיר שנשלחו" value={cc.marketing.priceUpdatesSent} />}
              </div>
            </Card>
          )}

          {/* Media */}
          <Card title="מדיה" cta={{ label: "Creative Studio", href: `/creative-studio/property/${id}` }}>
            <div className="flex items-center gap-3">
              {cc.property.imageUrl ? (
                <div className="relative h-14 w-14 overflow-hidden rounded-xl"><Image src={cc.property.imageUrl} alt="" fill className="object-cover" sizes="56px" /></div>
              ) : <div className="bg-surface text-muted grid h-14 w-14 place-items-center rounded-xl"><Icon name="Image" size={20} /></div>}
              <p className="text-muted text-sm">{cc.property.imageUrl ? "תמונה ראשית מוגדרת" : "אין תמונה ראשית"}</p>
            </div>
          </Card>

          {/* Timeline (compact) */}
          <Card title="ציר זמן">
            {cc.timeline.length === 0 ? <Empty text="אין אירועים אחרונים." /> : (
              <ul className="flex flex-col gap-2">
                {cc.timeline.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="bg-brand mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <div className="min-w-0"><p className="text-ink truncate text-xs font-semibold">{t.title ?? t.eventType}</p><p className="text-muted text-[11px]">{dt(t.at)}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-ink text-lg font-black leading-none">{value}</div><div className="text-muted text-xs">{label}</div></div>;
}
function FunnelStep({ label, v }: { label: string; v: number }) {
  return <span className="whitespace-nowrap"><span className="text-ink font-bold">{v}</span> {label}</span>;
}
