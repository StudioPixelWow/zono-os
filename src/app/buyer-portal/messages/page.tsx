// ============================================================================
// 🛒 ZONO — Buyer Portal — MESSAGES. 32.3. Conversation history (public-safe).
// Nothing is auto-sent; drafts are prepared with the broker.
// ============================================================================
import { getBuyerMessages } from "@/lib/buyer-portal";
import { PortalNav, Glass, AuthGate, EmptyState } from "@/components/buyer-portal/ui";
import AskBuyer from "@/components/buyer-portal/AskBuyer";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = { call: "📞", whatsapp: "💬", email: "✉️", sms: "📱", meeting: "🤝", viewing: "🔑" };

export default async function MessagesPage() {
  const r = await getBuyerMessages();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const { conversations } = r.data;

  return (
    <>
      <PortalNav active="/buyer-portal/messages" />
      <h1 className="text-2xl font-black text-slate-900">ההודעות שלי</h1>
      <p className="mt-1 text-[13px] text-slate-600">היסטוריית התקשורת עם הברוקר. הודעות נשלחות רק לאחר אישורכם.</p>

      <section className="mt-6">
        {conversations.length === 0 ? <EmptyState title="אין עדיין הודעות" body="כאן תוצג התכתובת שלכם עם הברוקר, כולל תזכורות ושאלות." /> : (
          <Glass className="p-4"><ul className="space-y-2">{conversations.map((c, i) => (
            <li key={i} className={`rounded-2xl px-3 py-2 text-[13px] ${c.fromBroker ? "bg-white/70" : "bg-violet-50"}`}>
              <div className="text-slate-800">{KIND_ICON[c.kind] ?? "•"} {c.summary}</div>
              <div className="text-[11px] text-slate-400">{c.fromBroker ? "מהברוקר" : "מכם"} · {new Date(c.at).toLocaleString("he-IL")}</div>
            </li>
          ))}</ul></Glass>
        )}
      </section>

      <section className="mt-8"><AskBuyer suggestions={["מה השלב הבא שלי?", "יש נכסים חדשים בשבילי?", "איך מתאמים צפייה?"]} /></section>
    </>
  );
}
