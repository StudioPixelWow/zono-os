// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="מערכת"
      title="הגדרות"
      icon="Settings"
      description="הגדרות מרחב הניהול של הפלטפורמה והעדפות כלליות."
      willContain={["העדפות תצוגה", "הגדרות התראות", "אזורי זמן", "מיתוג פלטפורמה", ]}
    />
  );
}
