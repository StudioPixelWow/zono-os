"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import StartWorkflowButton from "@/components/workflow-builder/StartWorkflowButton";
import type { LeadTwin } from "@/lib/digital-twin/leads/types";

export interface LeadLite {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: string;
  score: number | null;
  message: string | null;
  propertyId: string | null;
}

const STAGE_HE: Record<string, string> = { new: "חדש", contacted: "נוצר קשר", qualified: "מוסמך", nurturing: "בטיפוח", converted: "הומר", lost: "אבוד", disqualified: "נפסל" };
const SOURCE_HE: Record<string, string> = { facebook: "פייסבוק", facebook_group_comment: "תגובת קבוצת פייסבוק", facebook_comment: "תגובת פייסבוק", yad2: "יד2", madlan: "מדלן", website: "אתר", landing_page: "דף נחיתה", referral: "הפניה", whatsapp: "וואטסאפ", manual: "ידני", import: "ייבוא", property_page: "עמוד נכס" };
const SOURCE_ICON: Record<string, string> = { facebook: "Users", facebook_group_comment: "Users", facebook_comment: "Users", whatsapp: "MessageCircle", website: "Globe", landing_page: "Target", property_page: "Building2", manual: "UserPlus", referral: "Handshake" };

const sourceLabel = (s: string | null) => (s ? SOURCE_HE[s] ?? s : "לא ידוע");
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
const waLink = (phone: string | null) => { const d = (phone ?? "").replace(/\D/g, ""); return d ? `https://wa.me/${d}` : null; };
const READINESS_HE: Record<string, string> = { ready: "מוכן", needs_info: "חסר מידע", wait: "המתן" };
const READINESS_TONE: Record<string, string> = { ready: "bg-success-soft text-success", needs_info: "bg-warning-soft text-warning", wait: "bg-surface text-muted" };

function temp(conversion: number): { label: string; tone: string; dot: string } {
  if (conversion >= 65) return { label: "חם", tone: "bg-danger-soft text-danger", dot: "bg-danger" };
  if (conversion >= 35) return { label: "פושר", tone: "bg-warning-soft text-warning", dot: "bg-warning" };
  return { label: "קר", tone: "bg-surface text-muted", dot: "bg-slate-400" };
}
const scoreText = (n: number) => (n >= 65 ? "text-success" : n >= 35 ? "text-brand-strong" : "text-danger");

type Tab = "qualification" | "source" | "matching" | "communication" | "journey" | "calendar" | "graph";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "qualification", label: "הסמכה", icon: "Target" },
  { id: "source", label: "מקור", icon: "Globe" },
  { id: "matching", label: "התאמה וניתוב", icon: "Building2" },
  { id: "communication", label: "תקשורת", icon: "MessageCircle" },
  { id: "journey", label: "מסע", icon: "Route" },
  { id: "calendar", label: "יומן", icon: "Calendar" },
  { id: "graph", label: "גרף קשרים", icon: "Layers" },
];

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-muted flex flex-col items-center gap-3 py-12 text-center text-sm">
      <span className="bg-surface text-muted grid h-14 w-14 place-items-center rounded-2xl"><Icon name={icon} size={24} /></span>
      <p className="max-w-xs leading-relaxed">{text}</p>
    </div>
  );
}
function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3 text-center">
      <p className={cn("text-2xl font-black", tone ?? "text-ink")}>{value}</p>
      <p className="text-muted mt-0.5 text-[11px] font-bold">{label}</p>
    </div>
  );
}

export function LeadDetailView({
  lead,
  twin,
  communicationSlot,
  calendarSlot,
  approvalSlot,
  graphSlot,
  timelineSlot,
}: {
  lead: LeadLite;
  twin: LeadTwin | null;
  communicationSlot?: ReactNode;
  calendarSlot?: ReactNode;
  approvalSlot?: ReactNode;
  graphSlot?: ReactNode;
  timelineSlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("qualification");
  const p = twin?.profile ?? null;
  const conversion = p?.conversionProbability ?? null;
  const t = temp(conversion ?? 0);
  const nextAction = p?.nextBestAction ?? null;
  const decisions = twin?.decisions ?? [];
  const learnings = twin?.learnings ?? [];
  const missions = twin?.missions ?? [];
  const wa = waLink(lead.phone);

  const missingInfo: string[] = [];
  if (p) {
    if (!lead.phone && !lead.email) missingInfo.push("חסרים פרטי קשר (טלפון/אימייל)");
    if (p.intent === "unknown") missingInfo.push("כוונה לא ידועה — נדרשת הסמכה");
    if (p.completeness < 60) missingInfo.push(`פרופיל חלקי (${p.completeness}% שלמות נתונים)`);
    for (const d of decisions) if (d.readiness === "needs_info") missingInfo.push(d.action);
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <Link href="/my" className="text-muted hover:text-brand inline-flex items-center gap-1 text-sm font-bold">← חזרה לשולחן העבודה</Link>

      {/* ── Lead command-center hero ────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft flex flex-wrap items-start gap-4 p-5">
          <div className="bg-brand grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black text-white shadow-[var(--shadow-soft)]">{initials(lead.name) || "?"}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-ink text-2xl font-black leading-tight">{lead.name}</h1>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", t.tone)}><span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />{t.label}</span>
              <span className="bg-card text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{STAGE_HE[lead.stage] ?? lead.stage}</span>
              <span className="bg-card text-brand inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"><Icon name={SOURCE_ICON[lead.source ?? ""] ?? "Globe"} size={11} />{sourceLabel(lead.source)}</span>
            </div>
            <p className="text-muted mt-1 text-sm">{lead.phone ?? "—"}{lead.email ? ` · ${lead.email}` : ""}</p>
            {p && <p className="text-ink mt-2 text-[13px] font-semibold">כוונה: {p.buyerSellerFit}{p.intentConfidence ? ` · ביטחון ${p.intentConfidence}%` : ""}</p>}
            {lead.message && <p className="text-muted mt-1 line-clamp-2 max-w-2xl text-[13px] leading-relaxed">“{lead.message}”</p>}
            {lead.propertyId && <Link href={`/properties/${lead.propertyId}`} className="text-brand-strong mt-2 inline-flex items-center gap-1 text-[12px] font-bold"><Icon name="Building2" size={12} /> נכס מקושר</Link>}
          </div>
          <div className="bg-card flex shrink-0 items-center gap-4 rounded-2xl px-4 py-3">
            <div className="text-center"><p className={cn("text-3xl font-black leading-none", conversion != null ? scoreText(conversion) : "text-muted")}>{conversion != null ? `${conversion}%` : "—"}</p><p className="text-muted mt-1 text-[10px] font-bold">סיכוי המרה</p></div>
            <div className="text-center"><p className={cn("text-3xl font-black leading-none", p ? scoreText(p.urgency) : "text-muted")}>{p?.urgency ?? "—"}</p><p className="text-muted mt-1 text-[10px] font-bold">דחיפות</p></div>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* Next best action */}
          <button type="button" onClick={() => setTab("journey")} className="bg-brand-soft flex items-start gap-3 rounded-2xl p-3.5 text-right transition hover:brightness-[0.98]">
            <span className="bg-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white"><Icon name="ArrowUpRight" size={16} /></span>
            <span className="min-w-0">
              <span className="text-brand block text-[11px] font-bold">הפעולה הבאה שלך</span>
              <span className="text-ink block text-[14px] font-black leading-snug">{nextAction ?? "צור קשר ראשוני עם הליד"}</span>
            </span>
          </button>

          {/* Signal chips */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" onClick={() => setTab("qualification")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", p ? scoreText(p.leadQuality) : "text-muted")}>{p?.leadQuality ?? "—"}</div><div className="text-muted text-[10px] font-bold">איכות ליד</div>
            </button>
            <button type="button" onClick={() => setTab("source")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", p ? scoreText(p.sourceQuality) : "text-muted")}>{p?.sourceQuality ?? "—"}</div><div className="text-muted text-[10px] font-bold">איכות מקור</div>
            </button>
            <button type="button" onClick={() => setTab("qualification")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", missingInfo.length > 0 ? "text-warning" : "text-success")}>{missingInfo.length}</div><div className="text-muted text-[10px] font-bold">חוסרי מידע</div>
            </button>
            <button type="button" onClick={() => setTab("matching")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className="text-ink text-lg font-black">{missions.length}</div><div className="text-muted text-[10px] font-bold">מסעות מוצעים</div>
            </button>
          </div>

          {/* Toolbar — no lead edit page, so Edit is hidden; workflow is approval-gated */}
          <div className="flex flex-wrap items-center gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button leadingIcon={<Icon name="MessageCircle" size={16} />}>וואטסאפ</Button></a>}
            {lead.phone && <a href={`tel:${lead.phone}`}><Button variant="secondary" leadingIcon={<Icon name="MessageCircle" size={16} />}>התקשר</Button></a>}
            <StartWorkflowButton entityType="lead" entityId={lead.id} entityName={lead.name} suggestedTemplate="lead_qualification" />
          </div>
        </div>
      </div>

      {/* ── Cockpit tabs ────────────────────────────────────────────────────── */}
      <div className="border-line flex gap-1 overflow-x-auto border-b">
        {TABS.map((tb) => (
          <button key={tb.id} type="button" onClick={() => setTab(tb.id)}
            className={cn("relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition", tab === tb.id ? "text-brand-strong" : "text-muted hover:text-ink")}>
            <Icon name={tb.icon} size={15} />{tb.label}
            {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
          </button>
        ))}
      </div>

      {/* ── Panels ──────────────────────────────────────────────────────────── */}
      <div>
        {tab === "qualification" && (
          !p ? <EmptyState icon="Target" text="אין עדיין נתוני הסמכה לליד זה." /> : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="טמפרטורה" value={t.label} tone={scoreText(conversion ?? 0)} />
                <Tile label="סיכוי המרה" value={`${conversion}%`} tone={scoreText(conversion ?? 0)} />
                <Tile label="איכות ליד" value={p.leadQuality} tone={scoreText(p.leadQuality)} />
                <Tile label="שלמות נתונים" value={`${p.completeness}%`} tone={scoreText(p.completeness)} />
              </div>

              {/* Intent + tags */}
              <div className="bg-card border-line rounded-[20px] border p-5">
                <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Target" size={16} /></span><h3 className="text-ink text-sm font-extrabold">כוונה ואיכות</h3></div>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-[12px] font-bold">{p.buyerSellerFit} · {p.intentConfidence}%</span>
                  {(twin?.classification ?? []).map((c, i) => <span key={i} className="bg-surface text-ink rounded-full px-3 py-1 text-[12px] font-bold">{c}</span>)}
                </div>
              </div>

              {/* Missing info */}
              <div className="bg-card border-line rounded-[20px] border p-5">
                <div className="mb-3 flex items-center gap-2"><span className="bg-warning-soft text-warning grid h-8 w-8 place-items-center rounded-xl"><Icon name="AlertTriangle" size={16} /></span><h3 className="text-ink text-sm font-extrabold">מידע חסר להסמכה</h3></div>
                {missingInfo.length === 0 ? <p className="text-muted text-sm">הליד מוסמך — אין מידע חסר קריטי ✓</p> : (
                  <ul className="flex flex-col gap-1.5">{missingInfo.map((m, i) => <li key={i} className="text-ink flex items-center gap-2 text-sm"><span className="bg-warning h-1.5 w-1.5 rounded-full" />{m}</li>)}</ul>
                )}
              </div>

              {/* Evidence / WHY */}
              {learnings.length > 0 && (
                <div className="bg-card border-line rounded-[20px] border p-5">
                  <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Sparkles" size={16} /></span><h3 className="text-ink text-sm font-extrabold">ראיות ומדוע</h3></div>
                  <ul className="flex flex-col gap-2.5">
                    {learnings.map((l) => (
                      <li key={l.id} className="border-line rounded-2xl border p-3">
                        <p className="text-ink text-sm font-bold">{l.note} <span className="text-muted font-normal">· ביטחון {l.confidence}%</span></p>
                        {l.evidence.length > 0 && <p className="text-muted mt-1 text-[11px]">📌 {l.evidence.join(" · ")}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        )}

        {tab === "source" && (
          <div className="bg-card border-line rounded-[20px] border p-5">
            <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={SOURCE_ICON[lead.source ?? ""] ?? "Globe"} size={16} /></span><h3 className="text-ink text-sm font-extrabold">מאיפה הגיע הליד</h3></div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-[13px] font-bold">{sourceLabel(lead.source)}</span>
              {p && <span className="bg-surface text-ink rounded-full px-3 py-1 text-[12px] font-bold">איכות מקור {p.sourceQuality}</span>}
            </div>
            {lead.message ? (
              <div className="bg-surface mt-4 rounded-2xl p-4">
                <p className="text-muted text-[11px] font-bold">{(lead.source ?? "").includes("facebook") ? "תוכן התגובה / ההודעה" : "ההודעה הראשונית"}</p>
                <p className="text-ink mt-1 whitespace-pre-wrap text-sm leading-relaxed">{lead.message}</p>
              </div>
            ) : <p className="text-muted mt-4 text-sm">אין תוכן הודעה מקורי שמור לליד זה.</p>}
            <p className="text-muted mt-3 text-[11px]">הקשר קמפיין/פוסט/קבוצה יוצג כאן כשיהיה זמין ממודול הפייסבוק.</p>
          </div>
        )}

        {tab === "matching" && (
          <div className="flex flex-col gap-5">
            <div className="bg-card border-line rounded-[20px] border p-5">
              <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Building2" size={16} /></span><h3 className="text-ink text-sm font-extrabold">נכס וקשר</h3></div>
              {lead.propertyId ? (
                <Link href={`/properties/${lead.propertyId}`}><Button variant="secondary" size="sm" leadingIcon={<Icon name="ArrowUpRight" size={14} />}>פתח מרכז שליטה לנכס המקושר</Button></Link>
              ) : <p className="text-muted text-sm">אין נכס מקושר עדיין.</p>}
              {p && p.relationshipPath.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                  {p.relationshipPath.map((node, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="bg-surface text-ink rounded-full px-2.5 py-1 font-bold">{node}</span>
                      {i < p.relationshipPath.length - 1 && <Icon name="ChevronLeft" size={12} />}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card border-line rounded-[20px] border p-5">
              <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Route" size={16} /></span><h3 className="text-ink text-sm font-extrabold">מסע מומלץ ותהליך הבא</h3></div>
              {missions.length === 0 ? <p className="text-muted text-sm">אין מסע מומלץ כרגע.</p> : (
                <ul className="flex flex-col gap-2.5">
                  {missions.map((m) => (
                    <li key={m.id} className="border-line flex items-center justify-between gap-2 rounded-2xl border p-3">
                      <div className="min-w-0"><p className="text-ink text-sm font-bold">{m.title}</p><p className="text-muted text-[11px]">{m.reason}</p></div>
                      <span className="bg-brand-soft text-brand shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">עדיפות {m.priority}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4"><StartWorkflowButton entityType="lead" entityId={lead.id} entityName={lead.name} suggestedTemplate="lead_qualification" /></div>
            </div>
          </div>
        )}

        {tab === "communication" && (communicationSlot ?? <EmptyState icon="MessageCircle" text="אין תקשורת מתועדת עדיין." />)}

        {tab === "journey" && (
          <div className="flex flex-col gap-5">
            <div className="bg-card border-line rounded-[20px] border p-5">
              <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Route" size={16} /></span><h3 className="text-ink text-sm font-extrabold">מסע הליד</h3></div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-ink font-bold">שלב נוכחי: <span className="text-brand-strong">{STAGE_HE[lead.stage] ?? lead.stage}</span></span>
                {nextAction && <span className="text-ink font-bold">הצעד הבא: <span className="text-brand-strong">{nextAction}</span></span>}
              </div>
              {decisions.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2.5">
                  {decisions.map((d) => (
                    <li key={d.id} className="border-line rounded-2xl border p-3">
                      <div className="flex items-center justify-between gap-2"><p className="text-ink text-sm font-bold">{d.action}</p><span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", READINESS_TONE[d.readiness])}>{READINESS_HE[d.readiness]}</span></div>
                      <p className="text-muted mt-0.5 text-xs">{d.reason}</p>
                      {d.evidence.length > 0 && <p className="text-muted mt-1 text-[11px]">📌 {d.evidence.join(" · ")}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4"><StartWorkflowButton entityType="lead" entityId={lead.id} entityName={lead.name} suggestedTemplate="lead_qualification" /></div>
            </div>
            {/* Canonical kernel timeline for this lead (activity_events). */}
            {timelineSlot && <div className="bg-card border-line rounded-[20px] border p-5">{timelineSlot}</div>}
            {approvalSlot}
          </div>
        )}

        {tab === "calendar" && (calendarSlot ?? <EmptyState icon="Calendar" text="אין אירועים מתוזמנים לליד זה." />)}

        {tab === "graph" && (graphSlot ?? <EmptyState icon="Layers" text="אין קשרים מתועדים עדיין." />)}
      </div>
    </div>
  );
}
