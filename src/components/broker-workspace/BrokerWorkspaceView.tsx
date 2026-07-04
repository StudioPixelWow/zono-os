"use client";
// ============================================================================
// 👤 ZONO Broker Personal Workspace™ — mobile-first RTL client UI. 35.0.
// The broker's daily operating center: Today, Calendar, Comms, Inbox,
// Performance, Ask ZONO — scoped to the signed-in broker. Approvals reuse the
// Agent Framework gate; comms are draft-only (deep-link, no send); calendar is
// suggestion-only (no auto-book). Premium, fast, one-hand friendly.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import type { BrokerWorkspace, ScoredEntity, WsMission, WsInboxItem } from "@/lib/broker-workspace/types";
import { askBrokerZonoAction, approveBrokerInboxAction, rejectBrokerInboxAction } from "@/lib/broker-workspace/actions";

type Tab = "today" | "calendar" | "comms" | "inbox" | "performance" | "ask";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "היום", icon: "☀️" },
  { id: "calendar", label: "יומן", icon: "📅" },
  { id: "comms", label: "הודעות", icon: "💬" },
  { id: "inbox", label: "תיבה", icon: "📥" },
  { id: "performance", label: "ביצועים", icon: "📊" },
  { id: "ask", label: "שאל", icon: "✨" },
];
const impCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };

function Health({ v }: { v: number | null }) {
  if (v == null) return null;
  const cls = v >= 70 ? "bg-success-soft text-success" : v >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${cls}`}>{v}</span>;
}

function EntityRow({ e }: { e: ScoredEntity }) {
  return (
    <Link href={e.href} className="bg-surface flex items-center gap-3 rounded-2xl p-3 active:scale-[0.99] transition">
      <Health v={e.healthScore} />
      <div className="min-w-0 flex-1">
        <div className="text-ink line-clamp-1 text-[14px] font-bold">{e.name}</div>
        {e.reason && <div className="text-muted line-clamp-1 text-[11px]">{e.reason}</div>}
      </div>
      {e.riskLabel && <span className="bg-danger-soft text-danger shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">{e.riskLabel}</span>}
    </Link>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-ink flex items-center gap-2 text-[15px] font-black">{title}{count != null && <span className="text-muted text-xs font-bold">({count})</span>}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="bg-card border-line text-muted rounded-2xl border p-4 text-center text-[13px]">{text}</div>;
}

export function BrokerWorkspaceView({ data }: { data: BrokerWorkspace }) {
  const [tab, setTab] = useState<Tab>("today");
  const d = data.dashboard;

  return (
    <div dir="rtl" className="mx-auto flex min-h-screen max-w-xl flex-col pb-24">
      {/* Header */}
      <div className="bg-brand-soft sticky top-0 z-10 px-4 pt-5 pb-4">
        <p className="text-brand text-xs font-bold">ZONO · מרחב העבודה שלי</p>
        <h1 className="text-ink mt-0.5 text-2xl font-black">שלום, {data.brokerName} 👋</h1>
        <p className="text-muted mt-0.5 text-[12px]">{new Date(data.generatedAt).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[["קונים", d.hotBuyers.length], ["מוכרים", d.sellersAtRisk.length], ["לידים", d.leadFollowUps.length], ["אישורים", d.pendingApprovals.length]].map(([l, v]) => (
            <div key={String(l)} className="bg-card rounded-xl px-2 py-2 text-center"><div className="text-brand text-lg font-black">{v as number}</div><div className="text-muted text-[10px] font-bold">{l as string}</div></div>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-5 px-4 pt-4">
        {tab === "today" && <TodayTab data={data} />}
        {tab === "calendar" && <CalendarTab data={data} />}
        {tab === "comms" && <CommsTab data={data} />}
        {tab === "inbox" && <InboxTab items={data.inbox} approvals={d.pendingApprovals} />}
        {tab === "performance" && <PerformanceTab data={data} />}
        {tab === "ask" && <AskTab brokerName={data.brokerName} />}
        {data.notes.length > 0 && tab === "today" && (
          <div className="text-muted space-y-1 pt-2 text-[11px]">{data.notes.map((n, i) => <p key={i}>• {n}</p>)}</div>
        )}
      </div>

      {/* Bottom tab bar (mobile-first) */}
      <nav className="bg-card/95 border-line fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl justify-between border-t px-2 py-1.5 backdrop-blur">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold transition ${tab === t.id ? "text-brand bg-brand-soft" : "text-muted"}`}>
            <span className="text-base leading-none">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function TodayTab({ data }: { data: BrokerWorkspace }) {
  const d = data.dashboard;
  return (
    <>
      <Section title="🧠 מה לעשות היום">
        {data.briefing.items.length === 0 ? <Empty text="אין תובנות להיום — נתחיל כשיהיו רשומות בטיפולך." /> :
          data.briefing.items.map((b, i) => (
            <div key={i} className="bg-card border-line rounded-2xl border p-3">
              <div className="text-ink text-[13px] font-black">{b.question}</div>
              <div className="text-muted mt-1 text-[12px]">{b.answer}</div>
              {b.targets.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{b.targets.map((t, j) => <Link key={j} href={t.href} className="bg-brand-soft text-brand rounded-lg px-2 py-1 text-[11px] font-bold">{t.label}</Link>)}</div>}
            </div>
          ))}
      </Section>

      {(data.whatsapp.waiting > 0 || data.whatsapp.unread > 0) && (
        <Section title="💬 WhatsApp">
          <Link href="/whatsapp/inbox" className="bg-card border-line block rounded-2xl border p-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["לא נקרא", data.whatsapp.unread], ["ממתין", data.whatsapp.waiting], ["דחוף", data.whatsapp.urgent], ["היום", data.whatsapp.today]].map(([l, v]) => (
                <div key={String(l)}><div className="text-brand text-lg font-black">{v as number}</div><div className="text-muted text-[10px] font-bold">{l as string}</div></div>
              ))}
            </div>
            {data.whatsapp.waitingConversations.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.whatsapp.waitingConversations.slice(0, 3).map((c) => (
                  <div key={c.id} className="bg-surface flex items-center justify-between rounded-lg px-2.5 py-1.5"><span className="text-ink text-[12px] font-bold">{c.contactName}</span><span className="text-muted text-[10px]">{c.reason}</span></div>
                ))}
              </div>
            )}
            <div className="text-brand mt-2 text-center text-[12px] font-bold">פתח תיבה מאוחדת ←</div>
          </Link>
        </Section>
      )}

      <Section title="🎯 עדיפויות היום" count={d.todaysPriorities.length}>
        {d.todaysPriorities.length === 0 ? <Empty text="אין משימות פתוחות." /> : d.todaysPriorities.slice(0, 6).map((m) => <MissionRow key={m.id} m={m} />)}
      </Section>

      <Section title="🔥 קונים חמים" count={d.hotBuyers.length}>
        {d.hotBuyers.length === 0 ? <Empty text="אין קונים בטיפולך." /> : d.hotBuyers.slice(0, 5).map((e) => <EntityRow key={e.id} e={e} />)}
      </Section>

      <Section title="⚠️ מוכרים בסיכון" count={d.sellersAtRisk.length}>
        {d.sellersAtRisk.length === 0 ? <Empty text="אין מוכרים בסיכון." /> : d.sellersAtRisk.slice(0, 5).map((e) => <EntityRow key={e.id} e={e} />)}
      </Section>

      <Section title="🏠 נכסים קריטיים" count={d.criticalListings.length}>
        {d.criticalListings.length === 0 ? <Empty text="אין נכסים בטיפולך." /> : d.criticalListings.slice(0, 5).map((e) => <EntityRow key={e.id} e={e} />)}
      </Section>

      <Section title="📞 מעקב לידים" count={d.leadFollowUps.length}>
        {d.leadFollowUps.length === 0 ? <Empty text="אין לידים למעקב." /> : d.leadFollowUps.slice(0, 5).map((e) => <EntityRow key={e.id} e={e} />)}
      </Section>

      <Section title="⚙️ תהליכים פעילים" count={d.activeWorkflows.length}>
        {d.activeWorkflows.length === 0 ? <Empty text="אין תהליכים פעילים." /> : d.activeWorkflows.slice(0, 5).map((w) => (
          <div key={w.id} className="bg-surface flex items-center justify-between rounded-2xl p-3">
            <span className="text-ink line-clamp-1 text-[13px] font-bold">{w.name}</span>
            <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{w.status}</span>
          </div>
        ))}
      </Section>
    </>
  );
}

function MissionRow({ m }: { m: WsMission }) {
  const href = m.entityId ? (m.entityType === "buyer" ? `/buyers/${m.entityId}` : m.entityType === "seller" ? `/sellers/${m.entityId}` : m.entityType === "lead" ? `/leads/${m.entityId}` : m.entityType === "property" ? `/properties/${m.entityId}` : "/my") : "/my";
  return (
    <Link href={href} className="bg-surface flex items-center gap-3 rounded-2xl p-3">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${impCls[m.priority]}`}>{m.priority === "high" ? "דחוף" : m.priority === "medium" ? "בינוני" : "רגיל"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-ink line-clamp-1 text-[13px] font-bold">{m.title}</div>
        {m.entityName && <div className="text-muted text-[11px]">{m.entityName}</div>}
      </div>
    </Link>
  );
}

function CalendarTab({ data }: { data: BrokerWorkspace }) {
  const c = data.calendar;
  return (
    <>
      <div className="bg-warning-soft text-warning rounded-2xl p-3 text-[12px] font-bold">📌 {c.note}</div>
      <Section title="📅 פגישות קרובות" count={c.upcoming.length}>
        {c.upcoming.length === 0 ? <Empty text="אין פגישות קרובות ביומן." /> : c.upcoming.map((m) => (
          <div key={m.id} className="bg-surface rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink line-clamp-1 text-[13px] font-bold">{m.title}</span>
              {m.entityLabel && <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{m.entityLabel}</span>}
            </div>
            <div className="text-muted mt-0.5 text-[11px]">{m.startAt ? new Date(m.startAt).toLocaleString("he-IL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
          </div>
        ))}
      </Section>
      <Section title="💡 אירועים מוצעים (דורש אישור)" count={c.suggested.length}>
        {c.suggested.length === 0 ? <Empty text="אין אירועים מוצעים." /> : c.suggested.map((s) => (
          <div key={s.id} className="bg-card border-line flex items-center justify-between rounded-2xl border p-3">
            <div className="min-w-0">
              <div className="text-ink line-clamp-1 text-[13px] font-bold">{s.title}</div>
              <div className="text-muted text-[11px]">{s.planType ?? ""}{s.suggestedDate ? ` · ${s.suggestedDate.slice(0, 10)}` : ""}</div>
            </div>
            {s.propertyId && <Link href={`/properties/${s.propertyId}`} className="bg-brand-soft text-brand rounded-lg px-3 py-1.5 text-[11px] font-bold">פתח</Link>}
          </div>
        ))}
      </Section>
    </>
  );
}

function CommsTab({ data }: { data: BrokerWorkspace }) {
  return (
    <>
      <div className="bg-warning-soft text-warning rounded-2xl p-3 text-[12px] font-bold">🔒 {data.comms.note}</div>
      <Section title="💬 הודעות למעקב" count={data.comms.items.length}>
        {data.comms.items.length === 0 ? <Empty text="אין הודעות ממתינות. כל הכבוד!" /> : data.comms.items.map((c, i) => (
          <div key={i} className="bg-surface flex items-center gap-3 rounded-2xl p-3">
            <span className="text-lg">{c.channelHint === "whatsapp" ? "🟢" : "✉️"}</span>
            <div className="min-w-0 flex-1">
              <div className="text-ink line-clamp-1 text-[13px] font-bold">{c.entityName}</div>
              <div className="text-muted line-clamp-1 text-[11px]">{c.why}</div>
            </div>
            <Link href={c.href} className="bg-brand shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold text-white">נסח טיוטה</Link>
          </div>
        ))}
      </Section>
    </>
  );
}

function InboxTab({ items, approvals }: { items: WsInboxItem[]; approvals: WsInboxItem[] }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Record<string, string>>({});
  const act = (id: string, kind: "approve" | "reject") => startTransition(async () => {
    const r = kind === "approve" ? await approveBrokerInboxAction(id) : await rejectBrokerInboxAction(id, "נדחה מהמרחב האישי");
    setDone((p) => ({ ...p, [id]: r.ok ? (kind === "approve" ? "אושר ✓" : "נדחה") : "שגיאה" }));
  });
  return (
    <>
      <Section title="✅ ממתין לאישורך" count={approvals.length}>
        {approvals.length === 0 ? <Empty text="אין אישורים ממתינים." /> : approvals.map((i) => (
          <div key={i.id} className="bg-card border-line rounded-2xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-ink text-[13px] font-black">{i.recommendation}</div>
                <div className="text-muted mt-0.5 text-[11px]">{i.entityName ?? ""}{i.reason ? ` · ${i.reason}` : ""}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${impCls[i.impact]}`}>{i.agentName ?? "AI"}</span>
            </div>
            {done[i.id] ? <div className="text-success mt-2 text-[12px] font-bold">{done[i.id]}</div> : (
              <div className="mt-2 flex gap-2">
                <button disabled={pending} onClick={() => act(i.id, "approve")} className="bg-brand flex-1 rounded-lg py-2 text-[12px] font-bold text-white disabled:opacity-50">אשר</button>
                <button disabled={pending} onClick={() => act(i.id, "reject")} className="bg-surface text-muted flex-1 rounded-lg py-2 text-[12px] font-bold disabled:opacity-50">דחה</button>
              </div>
            )}
          </div>
        ))}
      </Section>
      <Section title="📥 המלצות סוכני AI" count={items.length}>
        {items.length === 0 ? <Empty text="אין המלצות כרגע." /> : items.slice(0, 12).map((i) => (
          <div key={i.id} className="bg-surface rounded-2xl p-3">
            <div className="text-ink line-clamp-2 text-[13px] font-bold">{i.recommendation}</div>
            <div className="text-muted mt-0.5 text-[11px]">{i.agentName ?? "AI"}{i.entityName ? ` · ${i.entityName}` : ""} · {i.status}</div>
          </div>
        ))}
      </Section>
    </>
  );
}

function PerformanceTab({ data }: { data: BrokerWorkspace }) {
  const p = data.performance;
  const tiles: [string, number | string][] = [
    ["נכסים פעילים", p.activeListings], ["קונים פעילים", p.activeBuyers], ["מוכרים פעילים", p.activeSellers],
    ["לידים בטיפול", p.leadsHandled], ["שיעור מעקב", `${p.followUpRatePct}%`], ["הזדמנויות סגירה", p.conversionOpportunities],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(([l, v]) => <div key={l} className="bg-card border-line rounded-2xl border px-3 py-3 text-center"><div className="text-brand text-2xl font-black">{v}</div><div className="text-muted text-[11px] font-bold">{l}</div></div>)}
      </div>
      <Section title="🔎 נקודות לחיזוק" count={p.weakSpots.length}>
        {p.weakSpots.length === 0 ? <Empty text="אין נקודות תורפה בולטות. עבודה מצוינת!" /> : p.weakSpots.map((w, i) => (
          <div key={i} className="bg-surface rounded-2xl p-3">
            <div className="flex items-center justify-between"><span className="text-ink text-[13px] font-black">{w.title}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${impCls[w.impact]}`}>{w.impact === "high" ? "גבוה" : w.impact === "medium" ? "בינוני" : "נמוך"}</span></div>
            <div className="text-muted mt-0.5 text-[12px]">{w.detail}</div>
          </div>
        ))}
      </Section>
    </>
  );
}

function AskTab({ brokerName }: { brokerName: string }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<{ answer: string; limitations: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const suggestions = ["מה עליי לעשות היום?", "למי כדאי להתקשר?", "איזה נכס דורש תשומת לב?", "איזה קונה קרוב לסגירה?"];
  const ask = (query: string) => { if (!query.trim()) return; setQ(query); startTransition(async () => { const r = await askBrokerZonoAction(query); setAns(r.ok && r.result ? { answer: r.result.answer, limitations: r.result.limitations } : { answer: "לא ניתן לענות כרגע.", limitations: null }); }); };
  return (
    <div className="space-y-3">
      <div className="bg-brand-soft rounded-2xl p-3"><div className="text-brand text-[13px] font-black">✨ שאל את ZONO</div><div className="text-muted text-[11px]">ממוקד ברשומות שבטיפולך, {brokerName}.</div></div>
      <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-ink rounded-full px-3 py-1.5 text-[11px] font-bold">{s}</button>)}</div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(q); }} placeholder="הקלד שאלה…" className="bg-card border-line text-ink flex-1 rounded-xl border px-3 py-2.5 text-[13px] outline-none" />
        <button disabled={pending} onClick={() => ask(q)} className="bg-brand rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "…" : "שאל"}</button>
      </div>
      {ans && (
        <div className="bg-card border-line rounded-2xl border p-3">
          <div className="text-ink whitespace-pre-wrap text-[13px] leading-relaxed">{ans.answer}</div>
          {ans.limitations && <div className="text-muted mt-2 border-t border-line pt-2 text-[11px]">מגבלות: {ans.limitations}</div>}
        </div>
      )}
    </div>
  );
}
