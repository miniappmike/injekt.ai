import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { getAppConfig } from "@/lib/app-config";
import { loadAdminStats } from "@/lib/admin-data";
import { AdminConsole } from "@/components/admin-console";
import { adminClient } from "@/lib/supabase/admin";
import { AdminOrders, type AdminOrder } from "@/components/admin-orders";
import { AdminPayments } from "@/components/admin-payments";

// The latest orders with the buyer's email, for the Orders panel. Empty before migration 0023.
async function loadRecentOrders(): Promise<AdminOrder[] | null> {
  const db = adminClient();
  const { data, error } = await db.from("orders").select("id, user_id, kind, pack_id, credits, amount_cents, first_month_bonus, status, created_at, paid_at, provider, provider_status, renews_order_id").order("created_at", { ascending: false }).limit(25);
  if (error) return null;
  const emails = new Map<string, string>();
  await Promise.all(
    [...new Set((data ?? []).map((o) => o.user_id as string))].map(async (id) => {
      const { data: u } = await db.auth.admin.getUserById(id);
      if (u.user?.email) emails.set(id, u.user.email);
    }),
  );
  return (data ?? []).map((o) => ({ ...(o as Omit<AdminOrder, "email">), email: emails.get(o.user_id as string) ?? null }));
}

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function AdminPage() {
  const { user } = await requireUser();
  // Anyone else sees a plain 404, so the page's existence isn't advertised.
  if ((await entitlements.planOf(user.id)) !== "admin") notFound();
  const [config, { stats, finance, financeWithAdmins, usageMissing }, orders] = await Promise.all([getAppConfig(), loadAdminStats(), loadRecentOrders()]);
  return (
    <div>
      <h1 className="page-title">Admin</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400">
        What your AI key is costing, who is using it, and the limits. Only admins can see this page.
      </p>
      <AdminConsole config={config} stats={stats} finance={finance} financeWithAdmins={financeWithAdmins} usageMissing={usageMissing} />
      <AdminPayments />
      <AdminOrders orders={orders} />
    </div>
  );
}
