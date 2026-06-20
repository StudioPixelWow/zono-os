import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { getMatchCommandCenter } from "@/lib/matching-intelligence/service";
import { MatchCommandCenter } from "./MatchCommandCenter";
import { CommunicationSection } from "@/components/communication/CommunicationSection";
import { MatchForecastSection } from "@/components/forecast/MatchForecastSection";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getMatchCommandCenter(id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/matches" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
        <Icon name="ChevronRight" size={16} />
        חזרה להתאמות
      </Link>
      <MatchForecastSection matchId={id} />
      <MatchCommandCenter data={data} />
      <CommunicationSection entityType="match" entityId={id} />
    </div>
  );
}
