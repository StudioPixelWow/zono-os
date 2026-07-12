"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { churnLevel, churnTone, scoreTone, type ScoreTone } from "@/lib/seller-intelligence/scoring";
import { PROPERTY_STATUS_LABELS } from "@/lib/properties/labels";
import { SellerCommandCenter } from "./SellerCommandCenter";
import type { SellerCommandCenter as SellerCC } from "@/lib/seller-intelligence/service";
import type { RecoItemView } from "@/components/activity/RecommendedMatches";
import type { Database } from "@/lib/supabase/types";

type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];

export interface LinkedProp {
  propertyId: string;
  title: string;
  relationshipType: string;
  ownershipPercentage: number | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  canSign: boolean;
  price: number | null;
  status: string | null;
  image: string | null;
}

const REL_LABELS: Record<string, string> = { owner: "בעלים", co_owner: "בעלים שותף", decision_maker: "מקבל החלטות", representative: "נציג", power_of_attorney: "מיופה כוח", lawyer: "עו״ד", family_member: "בן משפחה", investor: "משקיע", other: "אחר" };
const SCORE_TEXT: Record<ScoreTone, string> = { good: "text-success", medium: "text-brand-strong", risk: "text-danger" };
const statusLabel = (s: string | null) => (s ? PROPERTY_STATUS_LABELS[s as keyof typeof PROPERTY_STATUS_LABELS] ?? s : "—");
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
const waLink = (phone: string | null) => { const d = (phone ?? "").replace(/\D/g, ""); return d ? `https://wa.me/${d}` : null; };
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

type Tab = "command" | "risk" | "property" | "communication" | "memory" | "calendar" | "documents" | "graph";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "command", label: "מרכז ניהול", icon: "Sparkles" },
  { id: "risk", label: "מרכז סיכונים", icon: "AlertTriangle" },
  { id: "property", label: "נכס מקושר", icon: "Building2" },
  { id: "communication", label: "תקשורת", icon: "MessageCircle" },
  { id: "memory", label: "זיכרון מוכר", icon: "Database" },
  { id: "calendar", label: "יומן ופגישות", icon: "Calendar" },
  { id: "documents", label: "מסמכים", icon: "FileText" },
  { id: "graph", label: "גרף קשרים", icon: "Layers" },
];

function EmptyState({ icon, text, action }: { icon: string; text: string; action?: ReactNode }) {
  return (
    <div className="text-muted flex flex-col items-center gap-3 py-12 text-center text-sm">
      <span className="bg-surface text-muted grid h-14 w-14 place-items-center rounded-2xl"><Icon name={icon} size={24} /></span>
      <p className="max-w-xs leading-relaxed">{text}</p>
      {action}
    </div>
  );
}

export function SellerDetailView({
  seller: s,
  commandCenter,
  interestedBuyers,
  linkedProperties,
  memorySlot,
  communicationSlot,
  calendarSlot,
  documentsSlot,
  approvalSlot,
  recommendationsSlot,
  graphSlot,
  journeySlot,
}: {
  seller: SellerRow;
  commandCenter: SellerCC | null;
  interestedBuyers: RecoItemView[];
  linkedProperties: LinkedProp[];
  memorySlot?: ReactNode;
  communicationSlot?: ReactNode;
  calendarSlot?: ReactNode;
  documentsSlot?: ReactNode;
  approvalSlot?: ReactNode;
  recommendationsSlot?: ReactNode;
  graphSlot?: ReactNode;
  journeySlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("command");

  const prof = commandCenter?.profile ?? null;
  const trust = prof?.seller_trust_score ?? null;
  const churn = prof?.seller_churn_risk_score ?? null;
  const engagement = prof?.seller_engagement_score ?? null;
  const response = prof?.seller_response_score ?? null;
  const nextAction = prof?.next_best_action ?? null;
  const summary = prof?.intelligence_summary ?? prof?.ai_summary ?? null;
  const openRisks = commandCenter?.risks.filter((r) => r.status === "open") ?? [];
  const overdueCommitments = (commandCenter?.commitments ?? []).filter((c) => c.status === "broken" || (c.status === "open" && c.due_date && new Date(c.due_date) < new Date()));

  const primary = linkedProperties.find((p) => p.isPrimary) ?? linkedProperties[0] ?? null;
  const canSign = primary?.canSign || s.has_signed_agreement;
  const wa = waLink(s.phone);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/sellers" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
        <Icon name="ChevronRight" size={16} /> חזרה למוכרים
      </Link>

      {/* ── Seller command-center hero ──────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft flex flex-wrap items-start gap-4 p-5">
          <div className="bg-brand grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black text-white shadow-[var(--shadow-soft)]">{initials(s.full_name) || "?"}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-ink text-2xl font-black leading-tight">{s.full_name}</h1>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", canSign ? "bg-success-soft text-success" : "bg-surface text-muted")}>{canSign ? "מורשה חתימה" : "ללא הרשאת חתימה"}</span>
              {primary && <span className="bg-card text-brand inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"><Icon name="Building2" size={11} />{primary.title}</span>}
            </div>
            <p className="text-muted mt-1 text-sm">{s.phone ?? "—"}{s.email ? ` · ${s.email}` : ""}</p>
            {summary && <p className="text-ink mt-2 line-clamp-2 max-w-2xl text-[13px] leading-relaxed">{summary}</p>}
          </div>
          <div className="bg-card flex shrink-0 items-center gap-4 rounded-2xl px-4 py-3">
            <div className="text-center"><p className={cn("text-3xl font-black leading-none", churn != null ? SCORE_TEXT[churnTone(churn)] : "text-muted")}>{churn ?? "—"}</p><p className="text-muted mt-1 text-[10px] font-bold">סיכון נטישה{churn != null ? ` · ${churnLevel(churn)}` : ""}</p></div>
            <div className="text-center"><p className={cn("text-3xl font-black leading-none", trust != null ? SCORE_TEXT[scoreTone(trust)] : "text-muted")}>{trust ?? "—"}</p><p className="text-muted mt-1 text-[10px] font-bold">אמון מוכר</p></div>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* Next best action */}
          <button type="button" onClick={() => setTab("command")} className="bg-brand-soft flex items-start gap-3 rounded-2xl p-3.5 text-right transition hover:brightness-[0.98]">
            <span className="bg-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white"><Icon name="ArrowUpRight" size={16} /></span>
            <span className="min-w-0">
              <span className="text-brand block text-[11px] font-bold">הפעולה הבאה שלך</span>
              <span className="text-ink block text-[14px] font-black leading-snug">{nextAction ?? "הפעל את מודיעין המוכר כדי לקבל המלצת פעולה"}</span>
            </span>
          </button>

          {/* Signal chips */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" onClick={() => setTab("risk")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", engagement != null ? SCORE_TEXT[scoreTone(engagement)] : "text-muted")}>{engagement ?? "—"}</div><div className="text-muted text-[10px] font-bold">מעורבות</div>
            </button>
            <button type="button" onClick={() => setTab("risk")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", openRisks.length > 0 ? "text-danger" : "text-success")}>{openRisks.length}</div><div className="text-muted text-[10px] font-bold">סיכונים פעילים</div>
            </button>
            <button type="button" onClick={() => setTab("risk")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", overdueCommitments.length > 0 ? "text-warning" : "text-success")}>{overdueCommitments.length}</div><div className="text-muted text-[10px] font-bold">התחייבויות פתוחות</div>
            </button>
            <button type="button" onClick={() => setTab("property")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className="text-ink text-lg font-black">{linkedProperties.length}</div><div className="text-muted text-[10px] font-bold">נכסים מקושרים</div>
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button leadingIcon={<Icon name="MessageCircle" size={16} />}>וואטסאפ</Button></a>}
            {s.phone && <a href={`tel:${s.phone}`}><Button variant="secondary" leadingIcon={<Icon name="MessageCircle" size={16} />}>התקשר</Button></a>}
            <Button variant="secondary" leadingIcon={<Icon name="Briefcase" size={16} />}
              onClick={() => window.dispatchEvent(new CustomEvent("zono:new-deal", { detail: { prefill: { kind: "seller", id: s.id, label: s.full_name } } }))}>
              צור עסקה
            </Button>
            <Link href={`/sellers/${s.id}/edit`}><Button variant="ghost" leadingIcon={<Icon name="Settings" size={16} />}>עריכה</Button></Link>
          </div>
        </div>
      </div>

      {/* ── Cockpit tabs ────────────────────────────────────────────────────── */}
      <div className="border-line flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn("relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition", tab === t.id ? "text-brand-strong" : "text-muted hover:text-ink")}>
            <Icon name={t.icon} size={15} />{t.label}
            {tab === t.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
          </button>
        ))}
      </div>

      {/* ── Panels ──────────────────────────────────────────────────────────── */}
      <div>
        {/* Batch 5.5 (Part 8) — the CANONICAL seller journey, from the spine. The command
            center below it is INTELLIGENCE: churn / trust / engagement inform the broker,
            they do not move the lifecycle. `churn_risk` becomes a real stage only when a real
            persisted transition says so — never because a score crossed a threshold. */}
        {tab === "command" && journeySlot}

        {tab === "command" && (
          <div className="flex flex-col gap-5">
            <SellerCommandCenter sellerId={s.id} sellerName={s.full_name} data={commandCenter} interestedBuyers={interestedBuyers} />
            {approvalSlot}
          </div>
        )}

        {tab === "risk" && (
          <div className="flex flex-col gap-5">
            {!prof ? (
              <EmptyState icon="AlertTriangle" text="הפעל את מודיעין המוכר כדי לזהות סיכוני נטישה, אמון ותקשורת." action={<Button size="sm" onClick={() => setTab("command")}>למרכז הניהול</Button>} />
            ) : (
              <>
                {/* Risk signal tiles */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "סיכון נטישה", value: churn ?? 0, tone: churnTone(churn ?? 0) },
                    { label: "אמון", value: trust ?? 0, tone: scoreTone(trust ?? 0) },
                    { label: "מעורבות", value: engagement ?? 0, tone: scoreTone(engagement ?? 0) },
                    { label: "תגובתיות", value: response ?? 0, tone: scoreTone(response ?? 0) },
                  ].map((t) => (
                    <div key={t.label} className="bg-card border-line rounded-2xl border p-3 text-center">
                      <p className={cn("text-2xl font-black", SCORE_TEXT[t.tone])}>{t.value}</p>
                      <p className="text-muted mt-0.5 text-[11px] font-bold">{t.label}</p>
                    </div>
                  ))}
                </div>

                {/* Pricing resistance / main objection (from seller memory) */}
                {(s.price_sensitivity_score >= 60 || s.main_objection) && (
                  <div className="bg-card border-line rounded-[20px] border p-5">
                    <div className="mb-3 flex items-center gap-2"><span className="bg-warning-soft text-warning grid h-8 w-8 place-items-center rounded-xl"><Icon name="TrendingUp" size={16} /></span><h3 className="text-ink text-sm font-extrabold">התנגדות מחיר / מו״מ</h3></div>
                    {s.price_sensitivity_score >= 60 && <p className="text-muted text-sm">רגישות מחיר גבוהה ({s.price_sensitivity_score}/100) — צפו להתנגדות בתמחור. שקלו הצגת נתוני שוק תומכים.</p>}
                    {s.main_objection && <p className="text-ink mt-1 text-sm"><span className="text-muted">התנגדות עיקרית: </span>{s.main_objection}</p>}
                  </div>
                )}

                {/* Open risks (evidence + why) */}
                <div className="bg-card border-line rounded-[20px] border p-5">
                  <div className="mb-3 flex items-center gap-2"><span className="bg-danger-soft text-danger grid h-8 w-8 place-items-center rounded-xl"><Icon name="AlertTriangle" size={16} /></span><h3 className="text-ink text-sm font-extrabold">סיכונים פעילים</h3></div>
                  {openRisks.length === 0 ? (
                    <p className="text-muted text-sm">אין סיכונים פעילים ✓</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {openRisks.map((r) => (
                        <li key={r.id} className="border-line rounded-2xl border p-3">
                          <div className="flex items-center justify-between gap-2"><p className="text-ink text-sm font-bold">{r.title}</p><Badge tone={r.severity === "critical" || r.severity === "high" ? "danger" : r.severity === "medium" ? "warning" : "neutral"} size="sm">{r.severity}</Badge></div>
                          {r.recommended_action && <p className="text-brand-strong mt-1 text-xs font-semibold">המלצה: {r.recommended_action}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Overdue / broken commitments */}
                <div className="bg-card border-line rounded-[20px] border p-5">
                  <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Shield" size={16} /></span><h3 className="text-ink text-sm font-extrabold">התחייבויות שדורשות מעקב</h3></div>
                  {overdueCommitments.length === 0 ? (
                    <p className="text-muted text-sm">אין התחייבויות באיחור ✓</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {overdueCommitments.map((c) => (
                        <li key={c.id} className="border-line flex items-center justify-between gap-2 border-b py-2 last:border-0">
                          <div className="min-w-0"><p className={cn("text-sm font-semibold", c.status === "broken" ? "text-danger" : "text-ink")}>{c.title}</p><p className="text-muted text-[11px]">יעד: {fmtDate(c.due_date)}</p></div>
                          <Badge tone={c.status === "broken" ? "danger" : "warning"} size="sm">{c.status === "broken" ? "הופר" : "באיחור"}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "property" && (
          <div className="flex flex-col gap-4">
            {linkedProperties.length === 0 ? (
              <EmptyState icon="Building2" text="אין נכסים מקושרים למוכר זה." />
            ) : (
              linkedProperties.map((p) => (
                <div key={p.propertyId} className="bg-card border-line overflow-hidden rounded-[20px] border">
                  <div className="grid gap-0 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
                    <div className="relative min-h-[160px] overflow-hidden">
                      {p.image ? (
                        <Image src={p.image} alt={p.title} fill sizes="(max-width:640px) 100vw, 40vw" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-white/70" style={{ background: "linear-gradient(135deg,#6d28d9,#8b5cf6)" }}><Icon name="Building2" size={40} /></div>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-ink text-[15px] font-black">{p.title}</p>
                          <p className="text-muted mt-0.5 text-[12px] font-semibold">{REL_LABELS[p.relationshipType] ?? p.relationshipType}{p.ownershipPercentage != null ? ` · ${p.ownershipPercentage}%` : ""}</p>
                        </div>
                        <Badge tone="neutral" size="sm">{statusLabel(p.status)}</Badge>
                      </div>
                      <div className="flex items-baseline gap-2">
                        {p.price != null ? <span className="text-brand-strong text-xl font-black">{formatShekels(p.price)}</span> : <span className="text-muted text-sm font-semibold">מחיר לא הוגדר</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.isPrimary && <Badge tone="brand" size="sm">ראשי</Badge>}
                        {p.isDecisionMaker && <Badge tone="accent" size="sm">מקבל החלטות</Badge>}
                        {p.canSign && <Badge tone="success" size="sm">חתימה</Badge>}
                      </div>
                      <div className="mt-auto">
                        <Link href={`/properties/${p.propertyId}`}><Button variant="secondary" size="sm" leadingIcon={<Icon name="ArrowUpRight" size={14} />}>פתח מרכז שליטה לנכס</Button></Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "communication" && (communicationSlot ?? <EmptyState icon="MessageCircle" text="אין תקשורת מתועדת עדיין." />)}

        {tab === "memory" && (memorySlot ?? <EmptyState icon="Database" text="אין נתוני מוכר להצגה." />)}

        {tab === "calendar" && (calendarSlot ?? <EmptyState icon="Calendar" text="אין אירועים מתוזמנים למוכר זה." />)}

        {tab === "documents" && (
          <div className="flex flex-col gap-5">{documentsSlot ?? <EmptyState icon="FileText" text="אין מסמכים למוכר זה." />}{recommendationsSlot}</div>
        )}

        {tab === "graph" && (graphSlot ?? <EmptyState icon="Layers" text="אין קשרים מתועדים עדיין." />)}
      </div>
    </div>
  );
}
