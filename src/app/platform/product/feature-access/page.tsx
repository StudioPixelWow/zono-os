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
      title="גישת יכולות"
      icon="ShieldCheck"
      description="בקרת גישה ליכולות מוצר לכל ארגון — מי מקבל מה."
      willContain={["מטריצת גישה", "הפעלה לפי ארגון", "חבילות יכולות", "היסטוריית שינויים", ]}
    />
  );
}
