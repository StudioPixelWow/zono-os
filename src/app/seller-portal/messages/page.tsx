// ============================================================================
// 🏷️ ZONO — Seller Portal — MESSAGES. 32.4. Conversation history (public-safe).
// Broker updates + price discussion; nothing is auto-sent.
// ============================================================================
import { getSellerMessages } from "@/lib/seller-portal";
import { PortalNav, Glass, AuthGate, EmptyState } from "@/components/seller-portal/ui";
import AskSeller from "@/components/seller-portal/AskSeller";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = { call: "📞", whatsapp: "💬", email: "✉️", sms: "📱", meeting: "🤝", viewing: "🔑" };

export default async function MessagesPage() {
  const r = await getSellerMessages();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const { conversations } = r.data;

  return (
    <>
      <PortalNav active="/seller-portal/messages" />
      <h1 className="text-2xl font-black text-slate-900">ההודעות שלי</h1>
      <p className="mt-1 text-[13px] text-slate-600">עדכונים ותקשורת עם הברוקר. הודעות נשלחות רק לאחר אישורכם.</p>

      <section className="mt-6">
        {conversations.length === 0 ? <EmptyState title="אין עדיין הודעות" body="כאן תוצג התכתובת שלכם עם הברוקר, כולל עדכונים ודיוני מחיר." /> : (
          <Glass className="p-4"><ul className="space-y-2">{conversations.map((c, i) => (
            <li key={i} className={`rounded-2xl px-3 py-2 text-[13px] ${c.fromBroker ? "bg-white/70" : "bg-teal-50"}`}>
              <div className="text-slate-800">{KIND_ICON[c.kind] ?? "•"} {c.summary}</div>
              <div className="text-[11px] text-slate-400">{c.fromBroker ? "מהברוקר" : "מכם"} · {new Date(c.at).toLocaleString("he-IL")}</div>
            </li>
          ))}</ul></Glass>
        )}
      </section>

      <section className="mt-8"><AskSeller suggestions={["מה מצב הנכס שלי?", "האם יש פניות חדשות?", "האם כדאי לעדכן מחיר?"]} /></section>
    </>
  );
}
