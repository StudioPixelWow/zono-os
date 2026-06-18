import { listBuyers, listBuyerBoard, type BuyerRow } from "@/lib/buyers/repository";
import type { BuyerBoard } from "@/lib/buyers/repository";
import type { BuyerFilters } from "@/lib/buyers/types";
import type { BuyerTemperature, LeadSource, PropertyType } from "@/lib/supabase/types";
import { BuyersListView } from "./BuyersListView";
import { BuyerBoardWidgets } from "./BuyerBoardWidgets";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const filters: BuyerFilters = {
    locality: str("locality"),
    type: str("type") as PropertyType | undefined,
    status: str("status") as BuyerTemperature | undefined,
    source: str("source") as LeadSource | undefined,
    minBudget: num(str("minBudget")),
    maxBudget: num(str("maxBudget")),
    roomsMin: num(str("roomsMin")),
  };

  let rows: BuyerRow[] = [];
  let error = false;
  try {
    rows = await listBuyers(filters);
  } catch (e) {
    console.error("[buyers] list failed:", e);
    error = true;
  }

  let board: BuyerBoard | null = null;
  try {
    board = await listBuyerBoard();
  } catch (e) {
    console.error("[buyers] board failed:", e);
  }

  return (
    <div className="flex flex-col gap-6">
      {board && <BuyerBoardWidgets board={board} />}
      <BuyersListView buyers={rows} filters={filters} error={error} />
    </div>
  );
}
