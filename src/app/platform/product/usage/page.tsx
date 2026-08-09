// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.usage.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="מוצר"
      title="שימוש"
      icon="Activity"
      description="מדדי שימוש חוצי-ארגונים בליבת המוצר לאורך זמן."
      willContain={["שימוש לפי מודול", "מגמות אימוץ", "ארגונים פעילים", "שיא עומסים", ]}
    />
  );
}
