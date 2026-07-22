// ============================================================================
// 💬 LEFT — Unified Inbox. Uses ONLY CommunicationProvider.listConversations()
// (+ listPeople for identity). Grouped by CANONICAL PERSON, never by channel —
// one customer, one inbox, multiple channels. Search runs over the provider's
// output (provider search, no SQL); filters read state flags. No adapter,
// no WhatsApp/Calendar/Gmail import.
// ============================================================================
import Link from "next/link";
import { listConversations, listPeople } from "@/lib/communication-workspace/providers";
import { filterConversations, groupByPerson, wsHref, INBOX_FILTERS, type InboxFilter } from "@/lib/communication-workspace/filters";
import type { Channel } from "@/lib/communication-os/types";
import { SearchBox, Unavailable } from "./ui";

const FILTER_HE: Record<InboxFilter, string> = { all: "הכל", unread: "לא נקראו", waiting: "ממתינות", pinned: "נעוצות", resolved: "טופלו" };
const CHANNEL_HE: Record<string, string> = { all: "כל הערוצים", whatsapp: "וואטסאפ", gmail: "Gmail", calendar: "יומן" };
const CHANNEL_ICON: Record<Channel, string> = { whatsapp: "💬", gmail: "✉️", calendar: "📅", messenger: "💬", instagram: "📷", sms: "✉️" };
const CHANNELS: (Channel | "all")[] = ["all", "whatsapp", "gmail", "calendar"];

export async function InboxPanel({ params }: { params: Record<string, string | undefined> }) {
  const [convs, people] = await Promise.all([
    listConversations().catch(() => null),
    listPeople().catch(() => []),
  ]);
  if (convs === null) return <Unavailable note="לא ניתן לטעון את תיבת הדואר" />;

  const filter = (params.filter as InboxFilter) ?? "all";
  const channel = (params.channel as Channel | "all") ?? "all";
  const filtered = filterConversations(convs, { filter, channel, q: params.q });
  const groups = groupByPerson(filtered, people);
  const selected = params.c;

  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? "bg-brand text-white" : "text-muted border border-[var(--line)]"}`;

  return (
    <div dir="rtl" className="flex h-full flex-col gap-3">
      <SearchBox params={params} />
      <div className="flex flex-wrap gap-1.5">
        {INBOX_FILTERS.map((f) => (
          <Link key={f} href={wsHref(params, { filter: f === "all" ? null : f })} className={chip(filter === f)}>{FILTER_HE[f]}</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map((ch) => (
          <Link key={ch} href={wsHref(params, { channel: ch === "all" ? null : ch })} className={chip(channel === ch)}>{CHANNEL_HE[ch]}</Link>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="text-muted p-4 text-center text-[12px]">אין שיחות תואמות.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {groups.map((g) => (
              <li key={g.person.personId} className="flex flex-col gap-1">
                {g.conversations.map((c) => {
                  const isSel = c.id === selected;
                  return (
                    <Link
                      key={c.id}
                      href={wsHref(params, { c: c.id })}
                      className={`flex flex-col gap-0.5 rounded-[12px] border p-3 ${isSel ? "border-brand bg-[var(--brand-soft,#f0eefe)]" : "border-[var(--line)] hover:bg-[var(--surface-2,#f7f7fa)]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink truncate text-[13px] font-black">{CHANNEL_ICON[c.channel]} {g.person.displayName}</span>
                        {c.unreadCount > 0 ? <span className="bg-brand shrink-0 rounded-full px-1.5 text-[10px] font-black text-white">{c.unreadCount}</span> : null}
                      </div>
                      <div className="text-muted truncate text-[11px]">{c.summary.latestMessagePreview ?? "—"}</div>
                      <div className="flex gap-1">
                        {c.state.flags.filter((f) => f !== "unread").map((f) => (
                          <span key={f} className="text-muted/80 rounded bg-[var(--surface-2,#f0f0f4)] px-1 text-[9px] font-bold">{FILTER_HE[f as InboxFilter] ?? f}</span>
                        ))}
                      </div>
                    </Link>
                  );
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
