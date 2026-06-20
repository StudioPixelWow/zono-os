import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { transactionsEnvStatus } from "@/lib/transactions/providers";
import { madlanEnvStatus } from "@/lib/transactions/madlan";
import { DebugView } from "./DebugView";

export const dynamic = "force-dynamic";

export default async function TransactionsDebugPage() {
  const { profile } = await getSessionContext();
  if (!profile) redirect("/login");
  const env = transactionsEnvStatus();
  const madlan = madlanEnvStatus();
  return <DebugView env={env} madlan={madlan} />;
}
