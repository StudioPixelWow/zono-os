// ============================================================================
// 💬 CENTER — Conversation. Uses ONLY the provider capabilities: loadConversation
// / loadMessages / participants / attachments / summary / conversationState.
// Messages are rendered verbatim; the summary is the canonical Communication
// Summary (composition-only). No reply generation, no invented summaries.
// ============================================================================
import { loadConversation, loadMessages } from "@/lib/communication-workspace/providers";
import type { Channel } from "@/lib/communication-os/types";
import { Unavailable } from "./ui";

const CHANNEL_HE: Record<Channel, string> = { whatsapp: "וואטסאפ", gmail: "Gmail", calendar: "יומן", messenger: "Messenger", instagram: "Instagram", sms: "SMS" };
const time = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export async function ConversationPanel({ id }: { id?: string }) {
  if (!id) {
    return (
      <div dir="rtl" className="flex h-full items-center justify-center">
        <p className="text-muted text-[13px]">בחר שיחה מהרשימה כדי לצפות בהודעות.</p>
      </div>
    );
  }
  const [conv, messages] = await Promise.all([loadConversation(id).catch(() => null), loadMessages(id).catch(() => [])]);
  if (!conv) return <Unavailable note="לא ניתן לטעון את השיחה" />;

  const s = conv.summary;
  const attachments = messages.flatMap((m) => m.attachments);
  const ordered = [...messages].sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0));

  return (
    <div dir="rtl" className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="border-line flex items-start justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-ink text-base font-black">{conv.title}</h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-brand rounded-full bg-[var(--brand-soft,#f0eefe)] px-2 py-0.5 text-[10px] font-bold">{CHANNEL_HE[conv.channel]}</span>
            {conv.state.flags.map((f) => <span key={f} className="text-muted rounded-full bg-[var(--surface-2,#f0f0f4)] px-2 py-0.5 text-[10px] font-bold">{f}</span>)}
          </div>
        </div>
      </div>

      {/* Canonical summary (composition-only — never an AI summary) */}
      <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 rounded-[12px] border border-[var(--line)] p-3 text-[11px]">
        <span>לא נקראו: <b className="text-ink">{s.unread}</b></span>
        <span>ממתין: <b className="text-ink">{s.waiting ? "כן" : "לא"}</b></span>
        {s.lastReplyAt ? <span>תשובה אחרונה: <b className="text-ink">{time(s.lastReplyAt)}</b></span> : null}
        <span>משתתפים: <b className="text-ink">{conv.participants.map((p) => p.displayName).join(" · ")}</b></span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {ordered.length === 0 ? (
          <p className="text-muted p-4 text-center text-[12px]">אין הודעות בשיחה זו.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordered.map((m) => (
              <li key={m.id} className={`flex ${m.direction === "outbound" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-[14px] px-3 py-2 ${m.direction === "outbound" ? "bg-[var(--brand-soft,#f0eefe)]" : "bg-[var(--surface-2,#f4f4f7)]"}`}>
                  <div className="text-ink text-[12px]">{m.preview}</div>
                  <div className="text-muted mt-0.5 text-[9px]">{time(m.sentAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {attachments.length > 0 ? (
        <div className="border-line border-t pt-2 text-[11px]">
          <span className="text-muted font-bold">קבצים מצורפים ({attachments.length})</span>
        </div>
      ) : null}
    </div>
  );
}
