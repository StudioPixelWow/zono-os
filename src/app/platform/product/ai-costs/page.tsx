// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.ai.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="מוצר"
      title="עלויות AI"
      icon="Sparkles"
      description="מעקב עלויות ותצרוכת בינה מלאכותית ברמת הפלטפורמה."
      willContain={["עלות לפי ארגון", "צריכת טוקנים", "מגמות עלות", "בקרת תקציב", ]}
    />
  );
}
