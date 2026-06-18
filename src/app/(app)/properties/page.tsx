import { listProperties, type PropertyRow } from "@/lib/properties/repository";
import { listJourneyBoard, type JourneyBoard } from "@/lib/journey/repository";
import type { PropertyStatus, PropertyType } from "@/lib/supabase/types";
import { PropertiesListView } from "./PropertiesListView";
import { JourneyBoardWidgets } from "./JourneyBoardWidgets";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const filters = {
    city: str("city"),
    type: str("type") as PropertyType | undefined,
    status: str("status") as PropertyStatus | undefined,
    minPrice: num(str("minPrice")),
    maxPrice: num(str("maxPrice")),
    minRooms: num(str("minRooms")),
    maxRooms: num(str("maxRooms")),
  };

  let rows: PropertyRow[] = [];
  let error = false;
  try {
    rows = await listProperties(filters);
  } catch (e) {
    console.error("[properties] list failed:", e);
    error = true;
  }

  let board: JourneyBoard | null = null;
  try {
    board = await listJourneyBoard();
  } catch (e) {
    console.error("[journey] board failed:", e);
  }

  return (
    <div className="flex flex-col gap-6">
      {board && <JourneyBoardWidgets board={board} />}
      <PropertiesListView properties={rows} filters={filters} error={error} />
    </div>
  );
}
