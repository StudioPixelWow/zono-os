import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { listSellers, sellerPropertyCounts, type SellerRow } from "@/lib/sellers/repository";
import { listSellerBoard, type SellerBoard } from "@/lib/seller-intelligence/service";
import { sellerIntelligenceRepository } from "@/lib/seller-intelligence/repository";
import { SellerBoardWidgets } from "./SellerBoardWidgets";

export const dynamic = "force-dynamic";

export default async function SellersPage() {
  let sellers: SellerRow[] = [];
  let error = false;
  try {
    sellers = await listSellers();
  } catch (e) {
    console.error("[sellers] list failed:", e);
    error = true;
  }

  let board: SellerBoard | null = null;
  let counts = new Map<string, number>();
  let profiles = new Map<string, number>();
  try {
    const [b, c, p] = await Promise.all([
      listSellerBoard(),
      sellerPropertyCounts(),
      sellerIntelligenceRepository.listForOrg(),
    ]);
    board = b;
    counts = c;
    profiles = new Map(p.map((x) => [x.seller_id, x.seller_churn_risk_score]));
  } catch (e) {
    console.error("[sellers] board failed:", e);
  }

  return (
    <div className="flex flex-col gap-6">
      {board && <SellerBoardWidgets board={board} />}

      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-brand text-xs font-bold tracking-wide">Seller Intelligence OS</p>
            <h1 className="text-ink text-2xl font-black">המוכרים שלך</h1>
          </div>
          <Link href="/sellers/new">
            <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>מוכר חדש</Button>
          </Link>
        </div>

        {error ? (
          <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">לא ניתן לטעון את המוכרים כעת.</div>
        ) : sellers.length === 0 ? (
          <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
            <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="UserCheck" size={26} /></span>
            <p className="text-ink text-lg font-extrabold">אין מוכרים עדיין</p>
            <p className="text-muted max-w-sm text-sm">הוסף מוכר כדי ש-ZONO יבנה לו תאום דיגיטלי עם ציוני אמון, סיכון נטישה ופעולות מומלצות.</p>
            <Link href="/sellers/new"><Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>הוסף מוכר ראשון</Button></Link>
          </div>
        ) : (
          <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
            <table className="w-full min-w-[560px] text-start text-sm">
              <thead className="text-muted border-line border-b text-xs">
                <tr>{["שם", "טלפון", "נכסים", "סיכון נטישה"].map((h) => <th key={h} className="px-4 py-3 text-start font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {sellers.map((s) => {
                  const churn = profiles.get(s.id);
                  return (
                    <tr key={s.id} className="border-line hover:bg-surface border-b last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/sellers/${s.id}`} className="text-ink font-bold hover:text-brand">{s.full_name}</Link>
                      </td>
                      <td className="text-muted px-4 py-3">{s.phone ?? "—"}</td>
                      <td className="text-muted px-4 py-3">{counts.get(s.id) ?? 0}</td>
                      <td className={churn != null && churn >= 60 ? "text-danger px-4 py-3 font-bold" : "text-muted px-4 py-3"}>
                        {churn ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
