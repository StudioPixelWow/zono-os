"use client";
// ============================================================================
// ZONO Brokerage Knowledge Layer — dashboard (RTL). Added BELOW the existing
// brokerage-data command center (additive, modular). Surfaces the data-quality
// foundation: data health, completeness, duplicate clusters, market share,
// coverage, relationship discoveries and an interactive graph explorer.
// Server-driven + explainable. Owner gets recompute + review actions.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  getKnowledgeDashboardAction, getGraphAroundAction, recomputeKnowledgeAction,
  reviewDiscoveryAction, resolveClusterAction,
} from "@/lib/brokerage-data/knowledge/actions";
import type { KnowledgeDashboard } from "@/lib/brokerage-data/knowledge/service";

type Tab = "health" | "completeness" | "clusters" | "market" | "coverage" | "discoveries" | "graph";

const REC_HE: Record<string, string> = { merge: "מומלץ למזג", review: "לבדיקה", keep_separate: "ישויות נפרדות" };
const DISC_HE: Record<string, string> = { office_change: "שינוי משרד", new_branch: "סניף חדש אפשרי", merge: "מיזוג אפשרי", partnership: "שותפות", duplicate_agent: "סוכן כפול", shared_office: "משרד משותף", brand_change: "שינוי מותג" };
const bar = (pct: number) => (pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400");

function Badge({ children, tone = "white" }: { children: React.ReactNode; tone?: "white" | "green" | "amber" | "red" | "violet" }) {
  const c = tone === "green" ? "bg-emerald-500/15 text-emerald-300" : tone === "amber" ? "bg-amber-500/15 text-amber-300" : tone === "red" ? "bg-rose-500/15 text-rose-300" : tone === "violet" ? "bg-violet-500/15 text-violet-200" : "bg-white/10 text-white/70";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`}>{children}</span>;
}
function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className={`text-2xl font-black ${tone ?? "text-white"}`}>{value}</div><div className="mt-1 text-xs font-bold text-white/55">{label}</div></div>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-white/50">{text}</div>; }

export function KnowledgeView() {
  const router = useRouter();
  const [data, setData] = useState<KnowledgeDashboard | null>(null);
  const [tab, setTab] = useState<Tab>("health");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ nodes: { id: string; nodeKey: string; nodeType: string; label: string; entityId: string | null }[]; edges: { srcNodeId: string; dstNodeId: string; edgeType: string; confidence: number }[]; centerLabel: string } | null>(null);

  useEffect(() => { getKnowledgeDashboardAction().then(setData).catch(() => setData(null)); }, []);

  const run = (fn: () => Promise<{ error?: string; message?: string }>, refreshData = false) => {
    setMsg(null); setErr(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
      else { if (r?.message) setMsg(r.message); if (refreshData) setData(await getKnowledgeDashboardAction()); router.refresh(); }
    });
  };

  const openGraph = (entityType: "office" | "agent", entityId: string, label: string) => {
    setTab("graph"); setGraph(null);
    start(async () => { const g = await getGraphAroundAction(entityType, entityId); setGraph({ ...g, centerLabel: label }); });
  };

  if (!data) {
    return <section dir="rtl" className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">טוען שכבת ידע…</section>;
  }
  const owner = data.access.isOwner;

  const tabs: { id: Tab; label: string; owner?: boolean }[] = [
    { id: "health", label: "בריאות דאטה", owner: true },
    { id: "completeness", label: "שלמות נתונים" },
    { id: "clusters", label: `כפילויות (${data.clusters.length})` },
    { id: "market", label: "נתח שוק" },
    { id: "coverage", label: "כיסוי" },
    { id: "discoveries", label: `גילויים (${data.discoveries.length})` },
    { id: "graph", label: "גרף ידע" },
  ];

  return (
    <section dir="rtl" className="flex flex-col gap-5">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#150c2e] via-[#1d1140] to-[#120829] p-6">
        <div className="pointer-events-none absolute -bottom-24 -end-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white sm:text-2xl">שכבת הידע — גרף וניהול איכות דאטה</h2>
            <p className="mt-1 max-w-2xl text-sm text-white/60">שכבת המודיעין הקבועה של ZONO: גרף ידע, שלמות נתונים, אשכולות כפילויות, נתח שוק, כיסוי וגילויי קשרים — מקור אמת יחיד לכל מנוע AI עתידי. הסבר לכל החלטה, ללא קופסה שחורה.</p>
          </div>
          {owner && <Button size="sm" onClick={() => run(recomputeKnowledgeAction, true)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>חשב ידע מחדש</Button>}
        </div>
        {(msg || err) && <p className={`relative mt-3 text-sm font-bold ${err ? "text-rose-300" : "text-emerald-300"}`}>{err ?? msg}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.filter((t) => !t.owner || owner).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-xl px-3 py-1.5 text-sm font-bold transition ${tab === t.id ? "bg-brand-strong text-white" : "border border-white/10 bg-white/5 text-white/60 hover:text-white"}`}>{t.label}</button>
        ))}
      </div>

      {/* ── Data health ── */}
      {tab === "health" && owner && (
        data.health ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="ציון בריאות" value={`${data.health.healthScore}%`} tone={data.health.healthScore >= 70 ? "text-emerald-300" : "text-amber-300"} />
            <Stat label="רשומות תקינות" value={data.health.healthy} tone="text-emerald-300" />
            <Stat label="לבדיקה" value={data.health.needsReview} tone="text-amber-300" />
            <Stat label="ביטחון נמוך" value={data.health.lowConfidence} tone="text-amber-300" />
            <Stat label="חסר טלפון" value={data.health.missingPhones} />
            <Stat label="חסר אימייל" value={data.health.missingEmails} />
            <Stat label="אשכולות כפילות" value={data.health.duplicateClusters} tone="text-rose-300" />
            <Stat label="כיסוי ממוצע" value={`${data.health.coveragePct}%`} tone="text-violet-300" />
          </div>
        ) : <Empty text="עדיין אין תמונת בריאות — לחץ 'חשב ידע מחדש'." />
      )}

      {/* ── Completeness ── */}
      {tab === "completeness" && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.completenessLow.length === 0 && <Empty text="אין נתוני שלמות עדיין — הרץ חישוב ידע." />}
          {data.completenessLow.map((c) => (
            <div key={`${c.entityType}_${c.entityId}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between text-xs text-white/55"><span>{c.entityType === "office" ? "משרד" : "סוכן"} · {c.city ?? "—"}</span><span className="font-black text-white">{c.pct}%</span></div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className={`h-full ${bar(c.pct)}`} style={{ width: `${c.pct}%` }} /></div>
              {c.missing.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{c.missing.slice(0, 5).map((m) => <Badge key={m.key} tone="amber">{m.label}</Badge>)}</div>}
              {c.suggestions.length > 0 && <p className="mt-2 text-[11px] text-violet-300">המלצה: {c.suggestions[0]}</p>}
              <button onClick={() => openGraph(c.entityType as "office" | "agent", c.entityId, c.city ?? "")} className="mt-2 text-[11px] font-bold text-white/55 hover:text-white">פתח בגרף ←</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Duplicate clusters ── */}
      {tab === "clusters" && (
        <div className="grid gap-3">
          {data.clusters.length === 0 && <Empty text="לא זוהו אשכולות כפילות." />}
          {data.clusters.map((c) => (
            <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-black text-white">{c.entityType === "office" ? "משרד" : "סוכן"} · {c.memberCount} רשומות · {c.city ?? "—"}</div>
                <Badge tone={c.confidence >= 90 ? "green" : c.confidence >= 70 ? "amber" : "red"}>{Math.round(c.confidence)}% · {REC_HE[c.recommendation ?? ""] ?? ""}</Badge>
              </div>
              {c.explanation && <p className="mt-1 text-xs text-violet-300">{c.explanation}</p>}
              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-white/55">
                {c.members.map((m) => <Badge key={m.entityId} tone={m.isMaster ? "violet" : "white"}>{m.isMaster ? "★ " : ""}{Math.round(m.similarity)}%</Badge>)}
              </div>
              {owner && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => run(() => resolveClusterAction(c.id, "merged"), true)} disabled={pending}>סמן כממוזג</Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => resolveClusterAction(c.id, "dismissed"), true)} disabled={pending}>דחה</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Market share ── */}
      {tab === "market" && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.marketShare.length === 0 && <Empty text="אין נתוני נתח שוק עדיין." />}
          {["office", "network", "city"].map((scope) => {
            const rows = data.marketShare.filter((r) => r.scopeType === scope).slice(0, 8);
            if (!rows.length) return null;
            return (
              <div key={scope} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-sm font-black text-white/80">{scope === "office" ? "משרדים מובילים" : scope === "network" ? "רשתות מובילות" : "מובילי ערים"}</h4>
                <div className="grid gap-1.5">
                  {rows.map((r, i) => (
                    <div key={`${r.scopeKey}_${i}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-white/80">{i + 1}. {r.scopeLabel ?? r.scopeKey}{r.city ? ` · ${r.city}` : ""}</span>
                      <span className="flex items-center gap-2 text-xs text-white/55"><span className="font-bold text-violet-300">{r.sharePct}%</span>{r.listings} מודעות</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Coverage ── */}
      {tab === "coverage" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.coverage.length === 0 && <Empty text="אין נתוני כיסוי עדיין." />}
          {data.coverage.map((c) => (
            <div key={c.city} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between"><span className="text-sm font-black text-white">{c.city}</span><Badge tone={c.coveragePct >= 70 ? "green" : "amber"}>{c.coveragePct}%</Badge></div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className={`h-full ${bar(c.coveragePct)}`} style={{ width: `${c.coveragePct}%` }} /></div>
              <p className="mt-2 text-[11px] text-white/55">ידועים: {c.knownOffices} משרדים · {c.knownAgents} סוכנים · חסרים ~{c.missingOffices} · ביטחון {c.confidence}%</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Relationship discoveries ── */}
      {tab === "discoveries" && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.discoveries.length === 0 && <Empty text="אין גילויים פתוחים." />}
          {data.discoveries.map((d) => (
            <div key={d.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-2"><div className="text-sm font-black text-white">{DISC_HE[d.discoveryType] ?? d.discoveryType}</div><Badge tone={d.confidence >= 80 ? "green" : "amber"}>{Math.round(d.confidence)}%</Badge></div>
              <p className="mt-1 text-xs text-white/55">{d.reasons.join(" · ") || "—"}{d.city ? ` · ${d.city}` : ""}</p>
              {d.aiExplanation && <p className="mt-1 text-[11px] text-violet-300">{d.aiExplanation}</p>}
              {owner && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => run(() => reviewDiscoveryAction(d.id, "accepted"), true)} disabled={pending}>אמץ</Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => reviewDiscoveryAction(d.id, "dismissed"), true)} disabled={pending}>דחה</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Graph explorer ── */}
      {tab === "graph" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          {!graph ? (
            <Empty text={pending ? "טוען גרף…" : "בחר ישות מלשונית 'שלמות' או 'כפילויות' ולחץ 'פתח בגרף' כדי לחקור את הקשרים."} />
          ) : <GraphMini graph={graph} onExpand={openGraph} />}
        </div>
      )}

      <p className="text-[11px] text-white/35">שכבת ידע — חישוב דטרמיניסטי, מקור אמת יחיד, הסבר לכל החלטה. מידע ציבורי/עסקי בלבד · אין מחיקה אוטומטית.</p>
    </section>
  );
}

// ── 1-hop radial graph (pure SVG) with expand on office/agent nodes ─────────
function GraphMini({ graph, onExpand }: {
  graph: { nodes: { id: string; nodeKey: string; nodeType: string; label: string; entityId: string | null }[]; edges: { srcNodeId: string; dstNodeId: string; edgeType: string; confidence: number }[]; centerLabel: string };
  onExpand: (entityType: "office" | "agent", entityId: string, label: string) => void;
}) {
  const center = graph.nodes.find((n) => n.label === graph.centerLabel) ?? graph.nodes[0];
  if (!center) return <Empty text="אין צמתים להצגה." />;
  const neighbors = graph.nodes.filter((n) => n.id !== center.id);
  const cx = 300, cy = 200, R = 150;
  const color = (t: string) => t === "office" ? "#a78bfa" : t === "agent" ? "#34d399" : t === "phone" ? "#f59e0b" : t === "city" ? "#60a5fa" : t === "listing" ? "#f472b6" : "#cbd5e1";
  const pos = neighbors.map((n, i) => { const a = (i / Math.max(1, neighbors.length)) * Math.PI * 2 - Math.PI / 2; return { n, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; });
  return (
    <div>
      <div className="mb-2 text-sm font-black text-white">קשרים סביב: {center.label} <span className="text-white/45">({neighbors.length} צמתים)</span></div>
      <svg viewBox="0 0 600 400" className="w-full" style={{ maxHeight: 420 }} aria-hidden="true">
        {pos.map((p, i) => <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(167,139,250,0.25)" strokeWidth="1" />)}
        {pos.map((p, i) => (
          <g key={i} style={{ cursor: (p.n.nodeType === "office" || p.n.nodeType === "agent") && p.n.entityId ? "pointer" : "default" }}
             onClick={() => { if ((p.n.nodeType === "office" || p.n.nodeType === "agent") && p.n.entityId) onExpand(p.n.nodeType as "office" | "agent", p.n.entityId, p.n.label); }}>
            <circle cx={p.x} cy={p.y} r="7" fill={color(p.n.nodeType)} opacity="0.85" />
            <text x={p.x} y={p.y - 11} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.7)">{p.n.label.length > 14 ? p.n.label.slice(0, 13) + "…" : p.n.label}</text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r="11" fill={color(center.nodeType)} />
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{center.label.length > 18 ? center.label.slice(0, 17) + "…" : center.label}</text>
      </svg>
      <p className="text-[11px] text-white/40">לחיצה על משרד/סוכן מרחיבה את הגרף סביבו.</p>
    </div>
  );
}
