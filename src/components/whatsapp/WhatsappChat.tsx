"use client";
// ============================================================================
// 📘 ZONO — WhatsApp CONVERSATION CENTER (client).
// ----------------------------------------------------------------------------
// A two-pane conversation center over the connected personal WhatsApp:
//   • Left — the agent's ZONO conversations PLUS a clearly-labeled section of the
//     account's EXISTING WhatsApp chats (read live from the transport).
//   • Right — the selected thread + an approval-gated reply composer.
//   • New chat — a searchable CONTACTS picker (read from the account) above a
//     manual phone fallback; starting a chat sends the first approved message.
// Fully defensive: if the remote reads return nothing, only the ZONO list shows
// (today's behavior). In-memory state only — no localStorage.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import {
  waChatListAction, waChatThreadAction, waChatSendReplyAction, waChatStartAction,
  waContactsAction, waRemoteChatsAction, waRemoteThreadAction,
  type WaChatConv, type WaContact, type WaRemoteChat,
} from "@/lib/whatsapp/chat-actions";

type Msg = { id: string; direction: string; body: string; at: string | null };
type Selection =
  | { kind: "zono"; id: string; name: string | null }
  | { kind: "remote"; phone: string; name: string | null };

const WA = "linear-gradient(135deg,#25D366,#128C7E)";

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  try { return new Date(t).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export function WhatsappChat({ initial }: { initial: WaChatConv[] }) {
  const [convs, setConvs] = useState<WaChatConv[]>(initial);
  const [remote, setRemote] = useState<WaRemoteChat[]>([]);
  const [sel, setSel] = useState<Selection | null>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [threadBusy, setThreadBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Prefill (name + phone) for the new-chat modal, set by a remote row's
  // "add as lead" affordance so the modal opens ready to send.
  const [prefillSeed, setPrefillSeed] = useState<{ phone: string; name: string | null } | null>(null);

  // Merge the ZONO list with the account's existing WhatsApp chats. ZONO convs
  // have no phone, so remote chats live in their own labeled section (defensive:
  // an empty/failed remote read simply leaves today's ZONO-only list).
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const r = await waRemoteChatsAction(); if (alive) setRemote(r); } catch { /* keep ZONO-only */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  const refreshLists = useCallback(async () => {
    try { setConvs(await waChatListAction()); } catch { /* keep */ }
    try { setRemote(await waRemoteChatsAction()); } catch { /* keep */ }
  }, []);

  const openZono = useCallback(async (c: WaChatConv) => {
    setSel({ kind: "zono", id: c.id, name: c.name });
    setErr(null); setThread([]); setThreadBusy(true);
    try { setThread(await waChatThreadAction(c.id)); } catch { setThread([]); }
    finally { setThreadBusy(false); }
  }, []);

  const openRemote = useCallback(async (c: WaRemoteChat) => {
    setSel({ kind: "remote", phone: c.phone, name: c.name });
    setErr(null); setThread([]); setThreadBusy(true);
    try { setThread(await waRemoteThreadAction(c.phone)); } catch { setThread([]); }
    finally { setThreadBusy(false); }
  }, []);

  const reloadThread = useCallback(async (s: Selection) => {
    try { setThread(s.kind === "zono" ? await waChatThreadAction(s.id) : await waRemoteThreadAction(s.phone)); }
    catch { /* keep */ }
  }, []);

  const send = useCallback(async () => {
    if (!sel || !reply.trim() || sending) return;
    const text = reply.trim();
    setSending(true); setErr(null);
    try {
      const r = sel.kind === "zono"
        ? await waChatSendReplyAction(sel.id, text)
        : await waChatStartAction(sel.phone, text);
      if (!r.ok) { setErr(r.error ?? "שליחה נכשלה."); return; }
      setReply("");
      await reloadThread(sel);
      await refreshLists();
    } catch { setErr("שליחה נכשלה."); }
    finally { setSending(false); }
  }, [sel, reply, sending, reloadThread, refreshLists]);

  const onStarted = useCallback(async (phone: string, name: string | null) => {
    setModalOpen(false);
    await refreshLists();
    setSel({ kind: "remote", phone, name });
    setThreadBusy(true);
    try { setThread(await waRemoteThreadAction(phone)); } catch { setThread([]); }
    finally { setThreadBusy(false); }
  }, [refreshLists]);

  const selKey = sel ? (sel.kind === "zono" ? `z:${sel.id}` : `r:${sel.phone}`) : null;

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="bg-card border-line grid min-h-[560px] grid-cols-1 overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)] md:grid-cols-[320px_1fr]">
        {/* ── List pane ─────────────────────────────────────────────────── */}
        <aside className="border-line flex flex-col md:border-l">
          <header className="border-line flex items-center justify-between gap-2 border-b p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl text-white" style={{ background: WA }}><Icon name="MessageCircle" size={16} /></span>
              <span className="text-ink text-sm font-black">שיחות</span>
            </div>
            <button onClick={() => { setPrefillSeed(null); setModalOpen(true); }} className="btn-zono-primary zono-focus-ring inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-black text-white">
              <Icon name="Plus" size={14} /> שיחה חדשה
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* ZONO conversations */}
            <ListLabel>שיחות ZONO</ListLabel>
            {convs.length === 0 ? (
              <Empty>אין עדיין שיחות</Empty>
            ) : convs.map((c) => (
              <ConvRow key={`z:${c.id}`} active={selKey === `z:${c.id}`} title={c.name || "לקוח"} sub={c.lastMessage} at={c.at} onClick={() => openZono(c)} />
            ))}

            {/* Existing WhatsApp chats (read from the connected account) */}
            {remote.length > 0 && (
              <>
                <ListLabel>שיחות מ‑WhatsApp</ListLabel>
                {remote.map((c) => (
                  <ConvRow
                    key={`r:${c.phone}`}
                    active={selKey === `r:${c.phone}`}
                    title={c.name || c.phone}
                    sub={c.lastMessage}
                    at={c.at}
                    onClick={() => openRemote(c)}
                    action={
                      <button
                        onClick={(e) => { e.stopPropagation(); setPrefillSeed({ phone: c.phone, name: c.name }); setModalOpen(true); }}
                        title="הוסף כליד"
                        className="text-muted hover:text-brand shrink-0 rounded-lg p-1"
                      >
                        <Icon name="UserPlus" size={15} />
                      </button>
                    }
                  />
                ))}
              </>
            )}
          </div>
        </aside>

        {/* ── Thread pane ───────────────────────────────────────────────── */}
        <section className="flex min-h-0 flex-col">
          {!sel ? (
            <div className="text-muted flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="MessageCircle" size={26} /></span>
              <p className="text-sm font-bold">בחר שיחה כדי לצפות בהודעות</p>
            </div>
          ) : (
            <>
              <header className="border-line flex items-center justify-between gap-2 border-b p-3">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-black">{sel.name || (sel.kind === "remote" ? sel.phone : "לקוח")}</p>
                  <p className="text-muted text-[11px] font-semibold">{sel.kind === "remote" ? "שיחת WhatsApp קיימת" : "שיחת ZONO"}</p>
                </div>
                {sel.kind === "remote" && <span className="text-muted inline-flex items-center gap-1 text-[11px] font-bold"><Icon name="Phone" size={12} /> {sel.phone}</span>}
              </header>

              <div ref={scrollRef} className="bg-line/20 min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {threadBusy ? (
                  <div className="text-muted flex items-center justify-center gap-2 py-10 text-[12px] font-bold"><Spinner size={16} /> טוען הודעות…</div>
                ) : thread.length === 0 ? (
                  <div className="text-muted py-10 text-center text-[12px] font-bold">אין הודעות בשיחה זו</div>
                ) : thread.map((m) => (
                  <Bubble key={m.id} mine={m.direction === "outbound"} body={m.body} at={m.at} />
                ))}
              </div>

              <footer className="border-line border-t p-3">
                {err && <p className="text-danger mb-2 text-[12px] font-bold">{err}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    rows={1}
                    placeholder="כתוב תשובה… (התגובה נשלחת רק לאחר אישור)"
                    className="border-line bg-card text-ink max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-brand-light"
                  />
                  <button onClick={() => void send()} disabled={sending || !reply.trim()} className="btn-zono-primary zono-focus-ring inline-flex h-[42px] items-center gap-1.5 rounded-xl px-4 text-[13px] font-black text-white disabled:opacity-50">
                    {sending ? <Spinner size={15} /> : <Icon name="Send" size={15} />} שלח
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {modalOpen && <NewChatModal onClose={() => setModalOpen(false)} onStarted={onStarted} seed={prefillSeed} />}
    </div>
  );
}

// ── List primitives ─────────────────────────────────────────────────────────

function ListLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-muted bg-line/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide">{children}</p>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted px-3 py-6 text-center text-[12px] font-bold">{children}</p>;
}

function ConvRow({ active, title, sub, at, onClick, action }: {
  active: boolean; title: string; sub: string | null; at: string | null; onClick: () => void; action?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-2.5 text-right transition ${active ? "bg-brand-soft/60" : "hover:bg-line/40"}`}>
      <span className="bg-brand-soft text-brand grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-black">{title.trim().charAt(0) || "?"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-ink truncate text-[13px] font-black">{title}</span>
          {at && <span className="text-muted shrink-0 text-[10px] font-semibold">{fmtTime(at)}</span>}
        </span>
        <span className="text-muted block truncate text-[12px]">{sub || "—"}</span>
      </span>
      {action}
    </button>
  );
}

function Bubble({ mine, body, at }: { mine: boolean; body: string; at: string | null }) {
  return (
    <div className={`flex ${mine ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm ${mine ? "bg-brand text-white" : "bg-card border-line text-ink border"}`}>
        <p className="whitespace-pre-wrap break-words">{body || "—"}</p>
        {at && <p className={`mt-0.5 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>{fmtTime(at)}</p>}
      </div>
    </div>
  );
}

// ── New chat modal (contacts picker + manual fallback) ───────────────────────

function NewChatModal({ onClose, onStarted, seed }: {
  onClose: () => void;
  onStarted: (phone: string, name: string | null) => void;
  seed: { phone: string; name: string | null } | null;
}) {
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [phone, setPhone] = useState(seed?.phone ?? "");
  const [name, setName] = useState<string | null>(seed?.name ?? null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazily load the account's contacts when the modal opens (spinner while busy).
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const c = await waContactsAction(); if (alive) setContacts(c); }
      catch { if (alive) setContacts([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts.slice(0, 100);
    return contacts.filter((c) => (c.name ?? "").toLowerCase().includes(needle) || c.phone.includes(needle)).slice(0, 100);
  }, [contacts, q]);

  const start = async () => {
    if (!phone.trim() || !text.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await waChatStartAction(phone.trim(), text.trim());
      if (!r.ok) { setErr(r.error ?? "שליחה נכשלה."); return; }
      onStarted(phone.trim(), name);
    } catch { setErr("שליחה נכשלה."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card border-line w-full max-w-md rounded-[22px] border p-4 shadow-[var(--shadow-lift)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-ink text-base font-black">שיחה חדשה</h3>
          <button onClick={onClose} className="text-muted hover:text-ink rounded-lg p-1"><Icon name="X" size={18} /></button>
        </div>

        {/* Contacts picker (above the manual phone fallback) */}
        <label className="text-muted mb-1 block text-[11px] font-black">בחר איש קשר</label>
        <div className="border-line mb-1 flex items-center gap-2 rounded-xl border px-2.5">
          <Icon name="Search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש לפי שם או מספר…" className="text-ink h-9 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <div className="border-line mb-3 max-h-44 overflow-y-auto rounded-xl border">
          {loading ? (
            <div className="text-muted flex items-center justify-center gap-2 py-6 text-[12px] font-bold"><Spinner size={15} /> טוען אנשי קשר…</div>
          ) : filtered.length === 0 ? (
            <p className="text-muted py-6 text-center text-[12px] font-bold">{contacts.length === 0 ? "אין אנשי קשר זמינים" : "לא נמצאו תוצאות"}</p>
          ) : filtered.map((c) => {
            const picked = phone.trim() === c.phone;
            return (
              <button key={c.phone} onClick={() => { setPhone(c.phone); setName(c.name); }} className={`flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-2 text-right transition ${picked ? "bg-brand-soft/60" : "hover:bg-line/40"}`}>
                <span className="bg-brand-soft text-brand grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-black">{(c.name || c.phone).charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[13px] font-bold">{c.name || c.phone}</span>
                  <span className="text-muted block truncate text-[11px]">{c.phone}</span>
                </span>
                {picked && <Icon name="Check" size={15} />}
              </button>
            );
          })}
        </div>

        {/* Manual phone fallback */}
        <label className="text-muted mb-1 block text-[11px] font-black">או הזן מספר ידנית</label>
        <input value={phone} onChange={(e) => { setPhone(e.target.value); setName(null); }} inputMode="tel" placeholder="מספר טלפון (למשל 0501234567)" className="border-line bg-card text-ink mb-3 h-10 w-full rounded-xl border px-3 text-sm outline-none focus:border-brand-light" />

        <label className="text-muted mb-1 block text-[11px] font-black">הודעה ראשונה</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="כתוב את ההודעה…" className="border-line bg-card text-ink mb-1 w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand-light" />

        {err && <p className="text-danger mb-2 text-[12px] font-bold">{err}</p>}
        <div className="mt-2 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-muted text-[13px] font-bold">ביטול</button>
          <button onClick={() => void start()} disabled={busy || !phone.trim() || !text.trim()} className="btn-zono-primary zono-focus-ring inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-black text-white disabled:opacity-50">
            {busy ? <Spinner size={15} /> : <Icon name="Send" size={15} />} שלח והתחל
          </button>
        </div>
      </div>
    </div>
  );
}
