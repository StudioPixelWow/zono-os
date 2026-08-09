// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.flags.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="מוצר"
      title="דגלי יכולות"
      icon="Flag"
      description="ניהול דגלי פיצ'רים והשקה מבוקרת חוצת-ארגונים."
      willContain={["דגלים פעילים", "השקה הדרגתית", "טירגוט לפי ארגון", "מצב הערכה", ]}
    />
  );
}
