"use client";

// ============================================================================
// 💬 ZONO WhatsApp — In-app Conversation Center (client).
// A two-pane WhatsApp-style center: a searchable conversation list + a live
// thread with a composer, a "new conversation" modal, and an "add as lead"
// modal that reuses the full BuyerForm prefilled with the contact's name/phone.
// In-memory state only. All sends are real (human-in-the-loop personalSend).
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import {
  waChatListAction,
  waChatThreadAction,
  waChatSendReplyAction,
  waChatStartAction,
  type WaChatConv,
} from "@/lib/whatsapp/chat-actions";
import { BuyerForm } from "@/app/(app)/buyers/BuyerForm";
import { createBuyerAction } from "@/lib/buyers/actions";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";

const WA_GREEN = "#25D366";
const WA_TEAL = "#128C7E";

type ThreadMsg = { id: string; direction: string; body: string; at: string | null };

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} ד׳`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `לפני ${hr} ש׳`;
  const day = Math.round(hr / 24);
  if (day < 7) return `לפני ${day} ימים`;
  return new Date(t).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function Avatar() {
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white"
      style={{ background: `linear-gradient(135deg, ${WA_GREEN}, ${WA_TEAL})` }}
    >
      <Icon name="MessageCircle" size={20} />
    </span>
  );
}

export function WhatsappChat({ initial }: { initial: WaChatConv[] }) {
  const [convos, setConvos] = useState<WaChatConv[]>(initial);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Thread state
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [threadPhone, setThreadPhone] = useState<string | null>(null);
  const [threadName, setThreadName] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  // New-conversation modal
  const [showNew, setShowNew] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newText, setNewText] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [startingNew, startNew] = useTransition();

  // Lead modal
  const [leadFor, setLeadFor] = useState<{ name: string; phone: string } | null>(null);

  const [, startRefresh] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convos;
    return convos.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.lastMessage ?? "").toLowerCase().includes(q),
    );
  }, [convos, query]);

  const activeConv = convos.find((c) => c.id === activeId) ?? null;

  async function loadThread(id: string) {
    setThreadLoading(true);
    setReplyError(null);
    const r = await waChatThreadAction(id);
    setMessages(r.messages);
    setThreadPhone(r.phone);
    setThreadName(r.name);
    setThreadLoading(false);
    return r;
  }

  function openConversation(id: string) {
    setActiveId(id);
    setReplyText("");
    setMessages([]);
    setThreadPhone(null);
    setThreadName(null);
    void loadThread(id);
  }

  function refreshList() {
    startRefresh(async () => {
      const list = await waChatListAction();
      setConvos(list);
    });
  }

  function sendReply() {
    if (!activeId) return;
    const text = replyText.trim();
    if (!text) return;
    setReplyError(null);
    startSending(async () => {
      const r = await waChatSendReplyAction(activeId, text);
      if (r.ok) {
        setMessages((cur) => [
          ...cur,
          { id: `local-${Date.now()}`, direction: "outbound", body: text, at: new Date().toISOString() },
        ]);
        setReplyText("");
        void loadThread(activeId);
        refreshList();
      } else {
        setReplyError(r.error ?? "השליחה נכשלה");
      }
    });
  }

  function startConversation() {
    setNewError(null);
    startNew(async () => {
      const r = await waChatStartAction(newPhone, newText);
      if (!r.ok) {
        setNewError(r.error ?? "השליחה נכשלה");
        return;
      }
      const digits = newPhone.replace(/\D/g, "");
      setShowNew(false);
      setNewPhone("");
      setNewText("");
      const list = await waChatListAction();
      setConvos(list);
      // Try to open the conversation whose phone matches (best-effort).
      let matchId: string | null = null;
      for (const c of list) {
        const t = await waChatThreadAction(c.id);
        if (t.phone && t.phone.replace(/\D/g, "").endsWith(digits.slice(-9))) {
          matchId = c.id;
          break;
        }
      }
      if (matchId) openConversation(matchId);
    });
  }

  // Open the lead modal for a conversation, resolving its phone on demand.
  function openLeadForConversation(conv: WaChatConv) {
    if (activeId === conv.id && (threadPhone || threadName)) {
      setLeadFor({ name: threadName ?? conv.name, phone: threadPhone ?? "" });
      return;
    }
    startRefresh(async () => {
      const t = await waChatThreadAction(conv.id);
      setLeadFor({ name: t.name ?? conv.name, phone: t.phone ?? "" });
    });
  }

  return (
    <div dir="rtl" className="h-full">
      <div className="bg-card border-line grid h-[calc(100vh-8rem)] grid-cols-1 overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)] md:grid-cols-[360px_1fr]">
        {/* Conversation list (right side in RTL) */}
        <aside
          className={`border-line flex min-h-0 flex-col md:border-l ${activeId ? "hidden md:flex" : "flex"}`}
        >
          <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-ink text-lg font-bold">שיחות</h2>
            <Button
              size="sm"
              leadingIcon={<Icon name="Plus" size={16} />}
              onClick={() => {
                setShowNew(true);
                setNewError(null);
              }}
            >
              שיחה חדשה
            </Button>
          </div>
          <div className="border-line border-b px-3 py-2">
            <div className="bg-surface border-line flex items-center gap-2 rounded-xl border px-3">
              <Icon name="Search" size={16} className="text-muted" />
              <input
                className="text-ink h-9 w-full bg-transparent text-sm outline-none"
                placeholder="חיפוש שיחה"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-muted p-6 text-center text-sm">אין עדיין שיחות</p>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.id}
                  className={`group border-line hover:bg-surface flex cursor-pointer items-center gap-3 border-b px-3 py-3 transition ${
                    activeId === c.id ? "bg-surface" : ""
                  }`}
                  onClick={() => openConversation(c.id)}
                >
                  <Avatar />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink truncate font-bold">{c.name}</span>
                      <span className="text-muted shrink-0 text-xs">{relativeTime(c.lastAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted truncate text-sm">{c.lastMessage ?? "—"}</span>
                      {c.unread && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: WA_GREEN }}
                          aria-label="לא נקרא"
                        />
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    title="הוסף כליד"
                    aria-label="הוסף כליד"
                    className="text-muted hover:text-brand-strong hover:bg-brand-soft grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-0 transition group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLeadForConversation(c);
                    }}
                  >
                    <Icon name="UserPlus" size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Thread pane (left/main in RTL) */}
        <section className={`flex min-h-0 flex-col ${activeId ? "flex" : "hidden md:flex"}`}>
          {!activeConv ? (
            <div className="text-muted flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Icon name="MessageCircle" size={40} className="text-muted" />
              <p className="text-sm">בחר שיחה כדי להתחיל</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-muted hover:text-ink md:hidden"
                    aria-label="חזרה"
                    onClick={() => setActiveId(null)}
                  >
                    <Icon name="ArrowRight" size={20} />
                  </button>
                  <Avatar />
                  <div className="min-w-0">
                    <div className="text-ink truncate font-bold">{threadName ?? activeConv.name}</div>
                    {threadPhone && <div className="text-muted text-xs" dir="ltr">{threadPhone}</div>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={<Icon name="UserPlus" size={16} />}
                  onClick={() => setLeadFor({ name: threadName ?? activeConv.name, phone: threadPhone ?? "" })}
                >
                  הוסף כליד
                </Button>
              </div>

              {/* Messages */}
              <div className="bg-surface/40 min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {threadLoading ? (
                  <div className="text-muted flex h-full items-center justify-center">
                    <Spinner size={22} />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-muted py-8 text-center text-sm">אין עדיין הודעות בשיחה זו</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {messages.map((m) => {
                      const outbound = m.direction === "outbound";
                      return (
                        <div
                          key={m.id}
                          className={`flex ${outbound ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                              outbound ? "text-white" : "bg-card text-ink border-line border"
                            }`}
                            style={outbound ? { background: WA_GREEN } : undefined}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <div
                              className={`mt-0.5 text-left text-[10px] ${outbound ? "text-white/80" : "text-muted"}`}
                              dir="ltr"
                            >
                              {timeLabel(m.at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-line border-t px-4 py-3">
                {threadPhone === null && !threadLoading ? (
                  <p className="bg-surface text-muted rounded-xl px-3 py-2 text-center text-sm">
                    לא נמצא מספר טלפון להשבה בשיחה זו
                  </p>
                ) : (
                  <>
                    {replyError && (
                      <p className="bg-danger-soft text-danger mb-2 rounded-xl px-3 py-2 text-sm font-semibold">
                        {replyError}
                      </p>
                    )}
                    <div className="flex items-end gap-2">
                      <textarea
                        className="bg-surface border-line text-ink focus:border-brand-light h-11 max-h-32 min-h-11 w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
                        placeholder="הקלד הודעה…"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendReply();
                          }
                        }}
                        disabled={sending || threadLoading}
                      />
                      <button
                        type="button"
                        onClick={sendReply}
                        disabled={sending || threadLoading || !replyText.trim()}
                        aria-label="שלח"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-50"
                        style={{ background: WA_GREEN }}
                      >
                        {sending ? <Spinner size={18} /> : <Icon name="Send" size={18} />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* New-conversation modal */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowNew(false)}
        >
          <div
            dir="rtl"
            className="bg-card border-line w-full max-w-md rounded-[22px] border p-5 shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-ink text-lg font-bold">שיחה חדשה</h3>
              <button
                type="button"
                className="text-muted hover:text-ink"
                aria-label="סגירה"
                onClick={() => setShowNew(false)}
              >
                <Icon name="X" size={20} />
              </button>
            </div>
            <label className="mb-3 block">
              <span className="text-ink text-sm font-bold">מספר טלפון</span>
              <input
                className="bg-surface border-line text-ink focus:border-brand-light mt-1 h-11 w-full rounded-xl border px-3 text-sm outline-none"
                dir="ltr"
                placeholder="05X-XXXXXXX"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </label>
            <label className="mb-3 block">
              <span className="text-ink text-sm font-bold">הודעה</span>
              <textarea
                className="bg-surface border-line text-ink focus:border-brand-light mt-1 h-24 w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
                placeholder="תוכן ההודעה…"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
            </label>
            {newError && (
              <p className="bg-danger-soft text-danger mb-3 rounded-xl px-3 py-2 text-sm font-semibold">
                {newError}
              </p>
            )}
            <button
              type="button"
              onClick={startConversation}
              disabled={startingNew || !newPhone.trim() || !newText.trim()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white transition disabled:opacity-50"
              style={{ background: WA_GREEN }}
            >
              {startingNew ? <Spinner size={18} /> : <Icon name="Send" size={18} />}
              שלח והתחל שיחה
            </button>
          </div>
        </div>
      )}

      {/* Add-as-lead modal */}
      {leadFor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setLeadFor(null)}
        >
          <div
            dir="rtl"
            className="my-8 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">הוסף כליד</h3>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="סגירה"
                onClick={() => setLeadFor(null)}
              >
                <Icon name="X" size={20} />
              </button>
            </div>
            <BuyerForm
              initial={{ fullName: leadFor.name, phone: leadFor.phone || "" }}
              submitLabel="צור ליד"
              cancelHref="/whatsapp"
              onSubmit={createBuyerAction}
            />
          </div>
        </div>
      )}
    </div>
  );
}
