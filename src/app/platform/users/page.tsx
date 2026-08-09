// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.users.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="לקוחות"
      title="משתמשים"
      icon="Users"
      description="ניהול חוצה-ארגונים של משתמשי הפלטפורמה: חיפוש, סטטוס וחיבור אחרון — ללא חשיפת אימייל או טלפון."
      willContain={["חיפוש משתמשים גלובלי", "סטטוס וחיבור אחרון", "שיוך לארגון", "תצוגת תפקידים", ]}
    />
  );
}
