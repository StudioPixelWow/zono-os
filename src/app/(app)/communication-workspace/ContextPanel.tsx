// ============================================================================
// 💬 RIGHT — CRM Context. READ ONLY. It shows the conversation's canonical CRM
// REFERENCES (from Conversation.crmLinks) as deep links into the EXISTING
// surfaces — Journey, related Property/Deal, Broker Intelligence, Quick Actions.
// No CRM/Journey logic is imported or computed here; nothing is written. It
// consumes only the Communication Provider (loadConversation).
// ============================================================================
import Link from "next/link";
import { loadConversation } from "@/lib/communication-workspace/providers";
import type { CrmLink } from "@/lib/communication-os/types";
import { Unavailable } from "./ui";

function Ref({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-3 py-2 hover:bg-[var(--surface-2,#f7f7fa)]">
      <span className="text-ink text-[12px] font-bold">{label}</span>
      <span className="text-brand shrink-0 text-[11px] font-bold">פתח →</span>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-muted text-[10px] font-black">{title}</h4>
      {children}
    </div>
  );
}

const CRM_REF: { key: keyof CrmLink; label: string; href: (id: string) => string }[] = [
  { key: "buyer", label: "קונה", href: (id) => `/buyers/${id}` },
  { key: "seller", label: "מוכר", href: (id) => `/sellers/${id}` },
  { key: "lead", label: "ליד", href: (id) => `/leads/${id}` },
  { key: "property", label: "נכס", href: (id) => `/properties/${id}` },
  { key: "deal", label: "עסקה", href: (id) => `/deals/${id}` },
];

export async function ContextPanel({ id }: { id?: string }) {
  if (!id) {
    return (
      <div dir="rtl" className="flex h-full items-center justify-center">
        <p className="text-muted text-center text-[12px]">בחר שיחה כדי לראות הקשר CRM.</p>
      </div>
    );
  }
  const conv = await loadConversation(id).catch(() => null);
  if (!conv) return <Unavailable note="לא ניתן לטעון את ההקשר" />;

  const crm = conv.crmLinks;
  const crmRefs = CRM_REF.filter((r) => crm[r.key]);
  const firstEntity = crmRefs[0] ? crmRefs[0].href(crm[crmRefs[0].key]!) : null;

  return (
    <div dir="rtl" className="flex h-full flex-col gap-4 overflow-y-auto">
      <p className="text-muted text-[10px] font-bold">קריאה בלבד · הפניות למערכות הקיימות</p>

      <Section title="הפניות CRM">
        {crmRefs.length === 0 ? (
          <p className="text-muted text-[11px]">אין הפניות CRM לשיחה זו.</p>
        ) : (
          crmRefs.map((r) => <Ref key={r.key} label={r.label} href={r.href(crm[r.key]!)} />)
        )}
      </Section>

      <Section title="מסע לקוח">
        <Ref label="מרכז המסעות" href={crm.journey ? `/journeys?j=${crm.journey}` : "/journeys"} />
      </Section>

      {crm.property ? (
        <Section title="נכס קשור"><Ref label="כרטיס הנכס" href={`/properties/${crm.property}`} /></Section>
      ) : null}
      {crm.deal ? (
        <Section title="עסקה קשורה"><Ref label="כרטיס העסקה" href={`/deals/${crm.deal}`} /></Section>
      ) : null}

      <Section title="מודיעין מתווכים">
        <Ref label="פתח מודיעין מתווכים" href="/broker-intelligence" />
      </Section>

      <Section title="פעולות מהירות">
        {firstEntity ? <Ref label="פתח כרטיס לקוח" href={firstEntity} /> : null}
        <Ref label="פתח מרכז תקשורת" href="/communication-workspace" />
      </Section>
    </div>
  );
}
