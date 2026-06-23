import { getDistributionBoard, getDailyWorkspace, type DistributionBoard, type DailyWorkspace } from "@/lib/distribution/service";
import { createClient } from "@/lib/supabase/server";
import { DistributionCenterView } from "./_center/DistributionCenterView";
import type { PropertyLite } from "./_center/variations";

export const dynamic = "force-dynamic";

const ACTIVE = ["active", "published", "ready", "under_offer", "in_contract"];

export default async function DistributionPage() {
  let board: DistributionBoard = { communities: [], reviewQueue: [], approved: [], opportunities: [], plans: [] };
  let daily: DailyWorkspace = { batch: null, items: [] };
  let properties: PropertyLite[] = [];

  try {
    board = await getDistributionBoard();
  } catch (e) {
    console.error("[distribution] board load failed:", e);
  }
  try {
    daily = await getDailyWorkspace();
  } catch (e) {
    console.error("[distribution] daily load failed:", e);
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("properties")
      .select("id,title,city,neighborhood,type,price,rooms,size_sqm,primary_image_url,status")
      .in("status", ACTIVE as never)
      .order("updated_at", { ascending: false })
      .limit(60);
    properties = (data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      city: p.city,
      neighborhood: p.neighborhood,
      type: p.type as string | null,
      price: p.price,
      rooms: p.rooms,
      sqm: p.size_sqm,
      imageUrl: p.primary_image_url,
    }));
  } catch (e) {
    console.error("[distribution] properties load failed:", e);
  }

  return <DistributionCenterView board={board} daily={daily} properties={properties} />;
}
