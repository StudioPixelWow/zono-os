import { notFound } from "next/navigation";
import { getBrokerProfileDetail } from "@/lib/broker/service";
import { BrokerProfileView } from "./BrokerProfileView";

export const dynamic = "force-dynamic";

export default async function BrokerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail = null;
  try {
    detail = await getBrokerProfileDetail(id);
  } catch (e) {
    console.error("[broker] profile load failed:", e);
  }
  if (!detail) notFound();
  return <BrokerProfileView detail={detail} />;
}
