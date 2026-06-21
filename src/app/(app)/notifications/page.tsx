import { getNotificationFeed } from "@/lib/notifications/service";
import { NotificationsView } from "./NotificationsView";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const feed = await getNotificationFeed(category);
  return <NotificationsView feed={feed} active={category ?? ""} />;
}
