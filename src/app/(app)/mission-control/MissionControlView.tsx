"use client";
// ============================================================================
// 🧠 AI Mission Control™ — the operating system for AI inside ZONO (RTL).
// Phase 27.1 · presentation only. This is NOT a chatbot — it is the shell that
// will orchestrate every future AI capability. It surfaces what the system
// already knows (session context + the existing Action Center feed). There are
// NO AI responses, NO prompts, NO OpenAI, and NO new calculations here — the
// AI Workspace, AI Memory and Suggested Questions are intentional placeholders.
// ============================================================================
import Link from "next/link";
import { TerminalSection, Metric, MetricGrid, Pill, TerminalEmpty } from "@/components/intelligence/terminal";
import { MorningBrief } from "@/components/intelligence/MorningBrief";
import { bucketRecommendations } from "@/lib/intelligence-explorer/action-center-shared";
import { AiReasoningPanel } from "./AiReasoningPanel";
import { MissionPlannerPanel } from "./MissionPlannerPanel";
import { DailyBrief } from "./DailyBrief";
import type { MissionControlDTO } from "@/lib/mission-control/types";

const ils = (n: number | null) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);

function recHref(t: string, id: string | null): string | null {
  if (!id) return null;
  if (t === "property") return `/properties/${encodeURIComponent(id)}`;
  if (t === "buyer") return `/buyers/${encodeURIComponent(id)}`;
  if (t === "seller") return `/sellers/${encodeURIComponent(id)}`;
  if (t === "broker") return `/broker-intelligence/${encodeURIComponent(id)}`;
  if (t === "agency" || t === "office") return `/office-intelligence/${encodeURIComponent(id)}`;
  return null;
}

export function MissionControlView({ data }: { data: MissionControlDTO }) {
  const { session, scope, actionCenter } = data;
  const buckets = bucketRecommendations(actionCenter.recommendations);
  const today = buckets.today;
  const ex = actionCenter.dashboard.explorer;
  const opportunities = ex.opportunitySignals.slice(0, 6);

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* Header */}
      <header className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-brand-soft text-brand-strong grid h-11 w-11 place-items-center rounded-2xl text-2xl">🧠</span>
            <div>
              <p className="text-brand text-[11px] font-black tracking-wide">AI MISSION CONTROL™</p>
              <h1 className="text-ink text-xl font-black sm:text-2xl">מרכז הבקרה של ZONO AI</h1>
            </div>
          </div>
          <Pill tone="neutral">מערכת ההפעלה של ה-AI · לא צ׳אט</Pill>
        </div>
        <p className="text-muted mt-3 text-sm">
          המקום שממנו ינוהל כל יכולת AI עתידית ב-ZONO. כרגע מוצג המודיעין הקיים בלבד — מה המערכת כבר יודעת ומה לעשות היום.
        </p>
      </header>

      {/* Daily Brief — the first screen (Phase 27.6). Existing intelligence only. */}
      <DailyBrief data={data} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Main column ── */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Morning Mission */}
          <MorningBrief
            listings={ex.listings.map((l) => ({ firstSeenAt: l.firstSeenAt, hasAgent: l.hasAgent, opportunityScore: l.opportunityScore }))}
            priceDrops={actionCenter.dashboard.marketStats.priceDrops}
            activeSignals={ex.opportunitySignals.length}
          />

          {/* Mission Queue — existing Action Center feed (no new logic) */}
          <TerminalSection title="תור המשימות" subtitle="היום · מהפיד הקיים של מרכז הפעולות" action={<Link href="/action-center" className="text-brand text-xs font-bold">פתח מרכז פעולות ←</Link>}>
            <p className="text-ink mb-1.5 flex items-center gap-2 text-xs font-black">פעולות מומלצות להיום <Pill tone="rising">{today.length}</Pill></p>
            {today.length ? (
              <div className="mb-4 flex flex-col">
                {today.slice(0, 6).map((r) => {
                  const href = recHref(r.source_entity_type, r.source_entity_id);
                  const row = (
                    <div className="border-line/60 flex items-start justify-between gap-3 border-b py-2 last:border-0">
                      <div className="min-w-0">
                        <p className="text-ink truncate text-sm font-bold">{r.title_hebrew}</p>
                        {r.reason_hebrew && <p className="text-muted truncate text-xs">{r.reason_hebrew}</p>}
                      </div>
                      <Pill tone={r.urgency_score >= 70 ? "rising" : "contender"}>{Math.round(r.urgency_score)}</Pill>
                    </div>
                  );
                  return href ? <Link key={r.id} href={href} prefetch={false} className="hover:bg-surface rounded-lg transition">{row}</Link> : <div key={r.id}>{row}</div>;
                })}
              </div>
            ) : <TerminalEmpty text="אין פעולות בעדיפות גבוהה להיום." />}

            <p className="text-ink mb-1.5 flex items-center gap-2 text-xs font-black">הזדמנויות שוק <Pill tone="rising">{ex.opportunitySignals.length}</Pill></p>
            {opportunities.length ? (
              <div className="flex flex-col">
                {opportunities.map((o, i) => (
                  <div key={i} className="border-line/60 flex items-center justify-between gap-3 border-b py-2 text-xs last:border-0">
                    <span className="text-ink min-w-0 truncate font-bold">{o.label}<span className="text-muted font-normal"> · {[o.neighborhood, o.city].filter(Boolean).join(", ") || "—"}</span></span>
                    <span className="text-muted shrink-0">{o.reason}</span>
                  </div>
                ))}
              </div>
            ) : <TerminalEmpty text="אין אותות שוק פעילים." />}
          </TerminalSection>

          {/* AI Workspace — one-shot reasoning (Phase 27.3). Context-only, no memory/actions. */}
          <div id="ai-workspace" className="scroll-mt-4">
            <TerminalSection title="סביבת עבודת AI" subtitle="שאלה חד-פעמית · תשובה מבוססת הקשר בלבד">
              <AiReasoningPanel />
            </TerminalSection>
          </div>

          {/* Mission Planner — reviewable draft missions (Phase 27.4). No execution. */}
          <TerminalSection title="מתכנן המשימות" subtitle="טיוטות מבוססות ראיות · אישור/דחייה · ללא ביצוע">
            <MissionPlannerPanel />
          </TerminalSection>
        </div>

        {/* ── Side column ── */}
        <div className="flex flex-col gap-6">
          {/* Session Context — always visible: what the AI currently "knows" */}
          <TerminalSection title="הקשר הסשן" subtitle="מה ה-AI יודע כרגע">
            <MetricGrid>
              <Metric label="משרד" value={session.orgName ?? "—"} accent />
              <Metric label="סוכן" value={session.agentName ?? "—"} />
              <Metric label="תפקיד" value={session.title ?? "—"} />
              <Metric label="עיר ראשית" value={session.primaryCity ?? "—"} />
            </MetricGrid>
            {session.neighborhoods.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {session.neighborhoods.slice(0, 8).map((n) => (
                  <span key={n} className="border-line bg-surface text-ink rounded-lg border px-2 py-0.5 text-[11px] font-bold">{n}</span>
                ))}
              </div>
            )}
          </TerminalSection>

          {/* Context Panel — current entities in scope (existing values only) */}
          <TerminalSection title="לוח הקשר" subtitle="הישויות בטווח כרגע">
            <MetricGrid>
              <Metric label="מתווכים" value={String(scope.brokers)} />
              <Metric label="משרדים" value={String(scope.offices)} />
              <Metric label="שכונות" value={String(scope.neighborhoods)} />
              <Metric label="מודעות" value={String(scope.listings)} />
              <Metric label="הזדמנויות" value={String(scope.opportunities)} accent />
            </MetricGrid>
            <p className="text-muted mt-2 text-[11px]">נכס / ליד / מסע פעיל — ייטענו אוטומטית כשתיכנס לישות מתוך ZONO.</p>
          </TerminalSection>

          {/* AI Memory — placeholder timeline */}
          <TerminalSection title="זיכרון AI" subtitle="ציר הזמן של הזיכרון — בקרוב">
            <div className="border-line bg-surface flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-6 text-center">
              <span className="text-2xl">🗂️</span>
              <p className="text-ink text-sm font-bold">ציר הזמן של זיכרון ה-AI יוצג כאן</p>
              <p className="text-muted text-xs">החלטות, תובנות והקשר מצטבר — בפיתוח.</p>
            </div>
          </TerminalSection>

          {/* Pipeline snapshot from existing recommendations (no recompute) */}
          {actionCenter.recommendations && (
            <TerminalSection title="צבר ההמלצות" subtitle="מתוך ה-AI Coach הקיים">
              <MetricGrid>
                <Metric label="סה״כ" value={String(actionCenter.recommendations.total)} />
                <Metric label="עדיפות גבוהה" value={String(actionCenter.recommendations.highPriority)} accent />
                <Metric label="הכנסה צפויה" value={ils(actionCenter.recommendations.expectedRevenue)} />
                <Metric label="הומרו" value={String(actionCenter.recommendations.converted)} />
              </MetricGrid>
            </TerminalSection>
          )}
        </div>
      </div>
    </div>
  );
}
