import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { getAppConfig } from "@/lib/app-config";
import { loadAdminStats } from "@/lib/admin-data";
import { AdminConsole } from "@/components/admin-console";
import { settlePendingLedger } from "@/lib/ledger-sweep";
import { adminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function AdminPage() {
  const { user } = await requireUser();
  // Anyone else sees a plain 404, so the page's existence isn't advertised.
  if ((await entitlements.planOf(user.id)) !== "admin") notFound();
  // Fetch SpicyAPI's final charge for calls still showing an estimate first, so the numbers below are real ones.
  const sweep = await settlePendingLedger(adminClient(), { limit: 150, budgetMs: 8000 }).catch(() => null);
  const [config, { stats, finance, financeWithAdmins, usageMissing }] = await Promise.all([getAppConfig(), loadAdminStats()]);
  return (
    <div>
      <h1 className="page-title">Admin</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400">
        What your AI key is costing, who is using it, and the limits. Only admins can see this page.
      </p>
      <AdminConsole config={config} stats={stats} finance={finance} financeWithAdmins={financeWithAdmins} sweep={sweep} usageMissing={usageMissing} />
    </div>
  );
}
