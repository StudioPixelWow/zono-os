"use client";
// ============================================================================
// 💬 ZONO WhatsApp — Unified Inbox UI (mobile-first RTL). 36.0.
// Renders the grouped inbox + per-conversation intelligence card + merged
// timeline over the EXISTING WhatsApp OS. Drafting a reply REUSES the existing
// approval-gated createDraftAction (draft-only — NEVER auto-sends). Read-first.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import type { UnifiedInbox as UnifiedInboxData, InboxConversation, ConvKind } from "@/lib/whatsapp/inbox";
import type { ConversationDetail } from "@/lib/whatsapp/inbox-service";
import { getConversationDetailAction, askWhatsappAction } from "@/lib/whatsapp/inbox-actions";
import { createDraftAction } from "@/lib/whatsapp/actions";

const impCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const healthCls = (v: number) => (v >= 70 ? "bg-success-soft text-success" : v >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger");

function Card({ c, onOpen }: { c: InboxConversation; onOpen: () => void }) {
  const card = c.card;
  return (
    <button onClick={onOpen} className="bg-surface w-full rounded-2xl p-3 text-right active:scale-[0.99] transition">
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[12px] font-black ${healthCls(card.health)}`}>{card.health}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink line-clamp-1 text-[14px] font-bold">{c.contactName ?? "ללא שם"}</span>
            {c.unread && <span className="bg-brand h-2 w-2 shrink-0 rounded-full" />}
          </div>
          <div className="text-muted line-clamp-1 text-[11px]">{c.lastMessage ?? card.recommendedReply}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{card.intentLabel}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${impCls[card.urgencyLabel]}`}>דחיפות {card.urgency}</span>
        {card.opportunity && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-bold">{card.opportunity}</span>}
        {card.risk && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">{card.risk}</span>}
        <span className="bg-card text-ink rounded-full px-2 py-0.5 text-[10px] font-bold">➡️ {card.recommendedAction}</span>
      </div>
    </button>
  );
}

function DetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, startLoad] = useTransition();
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [loaded, setLoaded] = useState(false);

  if (!loaded) { setLoaded(true); startLoad(async () => { const r = await getConversationDetailAction(id); setDetail(r.ok && r.result ? r.result : null); }); }

  const draftReply = () => { if (!detail?.card) return; startDraft(async () => { const r = await createDraftAction({ conversationId: id, body: detail.card!.recommendedReply }); setDraftMsg(("message" in r && r.message) ? r.message : ("error" in r && r.error) ? r.error : "טיוטה נוצרה"); }); };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/40" onClick={onClose}>
      <div dir="rtl" className="bg-card mt-auto max-h-[88vh] overflow-y-auto rounded-t-3xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="bg-line mx-auto mb-3 h-1 w-10 rounded-full" />
        {loading || !detail ? <div className="text-muted py-10 text-center text-sm">טוען…</div> : detail.conversation == null ? <div className="text-muted py-10 text-center text-sm">השיחה לא נמצאה.</div> : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-ink text-xl font-black">{detail.conversation.contactName ?? "ללא שם"}</h2>
              {detail.entityHref && <Link href={detail.entityHref} className="bg-brand-soft text-brand rounded-lg px-3 py-1.5 text-[12px] font-bold">כרטיס CRM</Link>}
            </div>

            {detail.card && (
              <div className="bg-brand-soft mt-3 rounded-2xl p-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["בריאות", detail.card.health], ["דחיפות", detail.card.urgency], ["ביטחון", detail.card.confidence]].map(([l, v]) => (
                    <div key={String(l)}><div className="text-brand text-xl font-black">{v as number}</div><div className="text-muted text-[10px] font-bold">{l as string}</div></div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="bg-card text-ink rounded-full px-2 py-0.5 text-[10px] font-bold">כוונה: {detail.card.intentLabel}</span>
                  <span className="bg-card text-ink rounded-full px-2 py-0.5 text-[10px] font-bold">רגש: {detail.card.sentiment}</span>
                  {detail.card.opportunity && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-bold">{detail.card.opportunity}</span>}
                  {detail.card.risk && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">{detail.card.risk}</span>}
                </div>
                <div className="text-ink mt-2 text-[13px] font-bold">💡 {detail.card.recommendedAction}: {detail.card.recommendedReply}</div>
                {detail.card.why.length > 0 && <div className="text-muted mt-1 text-[11px]">למה: {detail.card.why.join(" · ")}</div>}
                <button disabled={drafting} onClick={draftReply} className="bg-brand mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{drafting ? "…" : "נסח תשובה (טיוטה)"}</button>
                {draftMsg && <div className="text-success mt-2 text-center text-[12px] font-bold">{draftMsg}</div>}
                <div className="text-muted mt-1 text-center text-[10px]">טיוטה בלבד — לא נשלח אוטומטית.</div>
              </div>
            )}

            <h3 className="text-ink mt-4 mb-2 text-[15px] font-black">ציר זמן מאוחד</h3>
            {detail.timeline.length === 0 ? <div className="text-muted text-[13px]">{detail.notes[0] ?? "אין אירועים."}</div> : (
              <div className="space-y-2">
                {detail.timeline.map((e, i) => (
                  <div key={i} className="bg-surface flex items-start gap-2 rounded-xl p-2.5">
                    <span className="text-base leading-none">{e.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><span className="text-ink line-clamp-1 text-[12px] font-bold">{e.title}</span><span className="text-muted shrink-0 text-[10px]">{new Date(e.at).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                      {e.detail && <div className="text-muted line-clamp-2 text-[11px]">{e.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onClose} className="bg-surface text-muted mt-4 w-full rounded-xl py-2.5 text-[13px] font-bold">סגור</button>
          </>
        )}
      </div>
    </div>
  );
}

function AskBox() {
  const [res, setRes] = useState<{ answer: string; conversations: { id: string; name: string; why: string; href: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const suggestions = ["מי מחכה לתשובה?", "מי עומד לנטוש?", "מי הכי חם?", "על מי לא חזרתי?"];
  const ask = (query: string) => { if (!query.trim()) return; start(async () => { const r = await askWhatsappAction(query); setRes(r.ok && r.result ? { answer: r.result.answer, conversations: r.result.conversations } : { answer: "לא ניתן לענות כרגע.", conversations: [] }); }); };
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <div className="text-brand text-[13px] font-black">✨ שאל את ZONO על השיחות</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{s}</button>)}</div>
      {pending && <div className="text-muted mt-2 text-[12px]">חושב…</div>}
      {res && (
        <div className="mt-2">
          <div className="text-ink text-[13px] font-bold">{res.answer}</div>
          <div className="mt-1.5 space-y-1">{res.conversations.map((c) => <Link key={c.id} href={c.href} className="bg-surface flex items-center justify-between rounded-lg px-2.5 py-1.5"><span className="text-ink text-[12px] font-bold">{c.name}</span><span className="text-muted text-[10px]">{c.why}</span></Link>)}</div>
        </div>
      )}
    </div>
  );
}

const KIND_ICON: Record<ConvKind, string> = { lead: "🌱", buyer: "🔑", seller: "🏷️", property: "🏠", customer: "👤", unknown: "❓" };

export function UnifiedInbox({ data, initialConversation }: { data: UnifiedInboxData; initialConversation?: string }) {
  const [open, setOpen] = useState<string | null>(initialConversation ?? null);
  const t = data.totals;
  return (
    <div dir="rtl" className="mx-auto max-w-xl px-4 pb-16 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-4">
        <p className="text-brand text-xs font-bold">ZONO WhatsApp</p>
        <h1 className="text-ink mt-0.5 text-2xl font-black">💬 תיבה מאוחדת</h1>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {[["לא נקרא", t.unread], ["ממתין", t.waiting], ["דחוף", t.urgent], ["שיחות", t.conversations], ["הזדמנות", t.opportunities]].map(([l, v]) => (
            <div key={String(l)} className="bg-card rounded-xl px-1 py-2 text-center"><div className="text-brand text-lg font-black">{v as number}</div><div className="text-muted text-[9px] font-bold">{l as string}</div></div>
          ))}
        </div>
      </div>

      <div className="mt-4"><AskBox /></div>

      {data.groups.length === 0 ? (
        <div className="bg-card border-line mt-4 rounded-2xl border p-8 text-center">
          <p className="text-ink text-lg font-black">אין עדיין שיחות</p>
          <p className="text-muted mt-1 text-sm">שיחות WhatsApp יופיעו כאן לאחר חיבור וקליטת הודעות.</p>
          <Link href="/whatsapp" className="bg-brand mt-3 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">מרכז הפיקוד</Link>
        </div>
      ) : data.groups.map((g) => (
        <section key={g.kind} className="mt-5">
          <h2 className="text-ink mb-2 flex items-center gap-2 text-[15px] font-black">{KIND_ICON[g.kind]} {g.label} <span className="text-muted text-xs font-bold">({g.conversations.length})</span></h2>
          <div className="space-y-2">{g.conversations.map((c) => <Card key={c.id} c={c} onOpen={() => setOpen(c.id)} />)}</div>
        </section>
      ))}

      {open && <DetailPanel id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
