// ZONO — Platform · cross-org Users directory (P5.3). Real directory via the
// audited platform DAL (bounded single query, no N+1, no PII). Read-only here;
// per-user actions live in the org Customer 360 Users tab (capability-gated).
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listPlatformUsers } from "@/lib/platform-admin/server/user-admin";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader } from "@/components/platform-admin/ui";
import { PlatformUsersDirectory } from "@/components/platform-admin/PlatformUsersDirectory";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const operator = await authorizePlatform("platform.users.read");
  if (!operator) return <PlatformDenied />;
  const rows = await listPlatformUsers({ limit: 300 });

  return (
    <div>
      <PageHeader eyebrow="לקוחות" title="משתמשים" icon="Users" description="מדריך משתמשים חוצה-ארגונים. בחר ארגון לניהול משתמשים. ללא חשיפת אימייל או טלפון." />
      <PlatformUsersDirectory rows={rows} />
    </div>
  );
}
