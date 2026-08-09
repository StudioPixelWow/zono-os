// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.admins.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="אבטחה"
      title="מנהלי פלטפורמה"
      icon="Fingerprint"
      description="רשימת מנהלי הפלטפורמה, תפקידים וסטטוס. ניהול הרשאות זמין ל-Super Admin בלבד."
      willContain={["מנהלים פעילים", "תפקידי פלטפורמה", "סטטוס וחסימות", "היסטוריית שינויים", ]}
    />
  );
}
