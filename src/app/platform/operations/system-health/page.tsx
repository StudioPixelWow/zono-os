// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.ops.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="תפעול"
      title="בריאות מערכת"
      icon="Activity"
      description="תמונת בריאות תשתיתית ותפעולית של הפלטפורמה."
      willContain={["זמינות שירותים", "זמני תגובה", "שיעורי שגיאה", "התראות פעילות", ]}
    />
  );
}
