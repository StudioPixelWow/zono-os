"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { advanceDealStageAction } from "@/lib/deals/actions";
import { createCommissionAction } from "@/lib/commissions/actions";
import { createDocumentManualAction } from "@/lib/documents/actions";
import { DEAL_STAGE_OPTIONS } from "@/lib/deals/options";
import { OFFER_STATUS_HE, COMMISSION_STATUS_HE } from "@/lib/i18n/labels";
import type { DealDetail } from "@/lib/deals/detail";
import type { NoteDTO } from "@/lib/notes/service";
import type { DealStage } from "@/lib/deals/engine";

const STAGE_LABEL: Record<string, string> = {
  new: "חדשה", qualified: "מוסמכת", negotiation: "משא ומתן", agreement: "הסכמה", contract: "חוזה", closing: "סגירה",
};
const ils = (n: number | null | undefined) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);

export function DealDetailView({ deal, notes }: { deal: DealDetail; notes: NoteDTO[] }) {
  const r = useActionRunner();
  const router = useRouter();
  const [stage, setStage] = useState(deal.stage);
  const [gross, setGross] = useState("");
  const [showComm, setShowComm] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [showDoc, setShowDoc] = useState(false);

  const advance = () =>
    r.run(async () => {
      await advanceDealStageAction(deal.id, stage as DealStage);
      router.refresh();
      return { message: "השלב עודכן" };
    }, { id: "adv", pendingMessage: "מעדכן שלב...", success: (x) => x.message ?? null });

  const addComm = () =>
    r.run(async () => {
      const res = await createCommissionAction({ dealId: deal.id, grossAmount: gross ? Number(gross) : 0 });
      if (res.error) throw new Error(res.error);
      setGross(""); setShowComm(false); router.refresh();
      return res;
    }, { id: "comm", pendingMessage: "יוצר עמלה...", success: () => "עמלה נוצרה ✓" });

  const addDoc = () =>
    r.run(async () => {
      const res = await createDocumentManualAction({ title: docTitle, docCategory: "custom", deal_id: deal.id });
      if (res.error) throw new Error(res.error);
      setDocTitle(""); setShowDoc(false); router.refresh();
      return res;
    }, { id: "doc", pendingMessage: "יוצר מסמך...", success: () => "מסמך נוצר ✓" });

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <Link href="/deals" className="text-muted hover:text-ink text-[12px] font-bold">← כל העסקאות</Link>

      <header className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-ink text-2xl font-black">{deal.title}</h1>
          <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{STAGE_LABEL[deal.stage] ?? deal.stage}</span>
          <span className="text-muted text-[12px]">{deal.status === "open" ? "פתוחה" : deal.status}</span>
        </div>
        <p className="text-ink text-[13px] font-bold">{ils(deal.value)}{deal.expected_close_date ? ` · צפי סגירה ${new Date(deal.expected_close_date).toLocaleDateString("he-IL")}` : ""}{deal.probability != null ? ` · ${deal.probability}%` : ""}</p>
        <p className="text-muted text-[12px]">
          {deal.buyerName ? `קונה: ${deal.buyerName}` : ""}{deal.sellerName ? ` · מוכר: ${deal.sellerName}` : ""}{deal.propertyTitle ? ` · נכס: ${deal.propertyTitle}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="bg-surface border-line text-ink h-9 rounded-xl border px-3 text-sm outline-none">
            {DEAL_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>)}
          </select>
          <Button size="sm" loading={r.busyId === "adv"} onClick={advance}>עדכן שלב</Button>
          {deal.property_id && <Link href={`/properties/${deal.property_id}`} className="text-brand-strong text-[12px] font-bold">נכס ↗</Link>}
        </div>
        <ActionFeedback runner={r} />
      </header>

      {/* offers */}
      <Section title="הצעות מקושרות" extra={<Link href="/offers" className="text-brand-strong text-[12px] font-bold">כל ההצעות ↗</Link>}>
        {deal.offers.length === 0 ? <Empty text="אין הצעות מקושרות" /> : deal.offers.map((o) => (
          <Row key={o.id} main={ils(o.amount)} sub={OFFER_STATUS_HE[o.status] ?? o.status} />
        ))}
      </Section>

      {/* commissions */}
      <Section title="עמלות וגבייה" extra={<button onClick={() => setShowComm((s) => !s)} className="text-brand-strong text-[12px] font-bold">+ עמלה לעסקה</button>}>
        {showComm && (
          <div className="mb-2 flex items-center gap-2">
            <input value={gross} onChange={(e) => setGross(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="ברוטו ₪" className="bg-surface border-line text-ink h-9 max-w-[160px] rounded-xl border px-3 text-sm outline-none" />
            <Button size="sm" loading={r.busyId === "comm"} onClick={addComm}>צור</Button>
            <Link href="/commissions" className="text-muted text-[12px] font-bold">למסך העמלות ↗</Link>
          </div>
        )}
        {deal.commissions.length === 0 ? <Empty text="אין עמלות לעסקה זו" /> : deal.commissions.map((c) => (
          <Row key={c.id} main={`ברוטו ${ils(c.gross_amount)} · נטו ${ils(c.net_amount)}`} sub={`${COMMISSION_STATUS_HE[c.status] ?? c.status} · נגבה ${ils(c.totalCollected)}/${ils(c.totalDue)}`} />
        ))}
      </Section>

      {/* documents */}
      <Section title="מסמכים" extra={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDoc((s) => !s)} className="text-brand-strong text-[12px] font-bold">+ מסמך לעסקה</button>
          <Link href="/documents" className="text-brand-strong text-[12px] font-bold">כל המסמכים ↗</Link>
        </div>
      }>
        {showDoc && (
          <div className="mb-2 flex items-center gap-2">
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="כותרת מסמך" className="bg-surface border-line text-ink h-9 max-w-[220px] rounded-xl border px-3 text-sm outline-none" />
            <Button size="sm" loading={r.busyId === "doc"} onClick={addDoc}>צור</Button>
          </div>
        )}
        {deal.documents.length === 0 ? <Empty text="אין מסמכים מקושרים" /> : deal.documents.map((d) => (
          <Row key={d.id} main={d.title} sub={d.signature_status} />
        ))}
      </Section>

      {/* timeline */}
      <Section title="היסטוריה וציר זמן">
        {deal.journeys.length === 0 && deal.timeline.length === 0 ? <Empty text="אין היסטוריה" /> : (
          <ol className="flex flex-col gap-1">
            {deal.journeys.map((j, i) => <li key={`j${i}`} className="text-muted text-[12px]">• {new Date(j.created_at).toLocaleString("he-IL")} — שלב {STAGE_LABEL[j.stage ?? ""] ?? j.stage}{j.note ? ` · ${j.note}` : ""}</li>)}
            {deal.timeline.map((t, i) => <li key={`t${i}`} className="text-muted text-[12px]">• {new Date(t.occurred_at).toLocaleString("he-IL")} — {t.title || t.event_type}</li>)}
          </ol>
        )}
      </Section>

      <NotesPanel entity={{ type: "deal", id: deal.id }} notes={notes} title="הערות" />
    </main>
  );
}

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2"><h2 className="text-ink text-base font-black">{title}</h2>{extra}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
function Row({ main, sub }: { main: string; sub: string }) {
  return (
    <div className="bg-card border-line flex items-center justify-between gap-2 rounded-2xl border p-3 shadow-sm">
      <span className="text-ink text-[13px] font-bold">{main}</span>
      <span className="text-muted text-[12px]">{sub}</span>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="bg-surface text-muted rounded-2xl px-4 py-4 text-center text-[13px]">{text}</div>;
}
