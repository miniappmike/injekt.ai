import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { getAppConfig } from "@/lib/app-config";
import { loadAdminStats, loadPaidOrders, loadPeopleExtras } from "@/lib/admin-data";
import { AdminConsole, CapsForm } from "@/components/admin-console";
import { adminClient } from "@/lib/supabase/admin";
import { AdminOrders, type AdminOrder } from "@/components/admin-orders";
import { AdminPayments } from "@/components/admin-payments";
import { AdminPeople } from "@/components/admin-people";
import { AdminRevenue } from "@/components/admin-revenue";
import { AdminTabs, parseTab } from "@/components/admin-tabs";
import { parseRange, rangeStart, summarizeRevenue } from "@/lib/admin-revenue";
import { showOrder } from "@/lib/cleanup";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Orders in the range with the buyer's email, newest first. Null before migration 0023.
async function loadOrders(since: Date | null): Promise<AdminOrder[] | null> {
  const db = adminClient();
  let q = db.from("orders").select("id, user_id, kind, pack_id, credits, amount_cents, first_month_bonus, status, created_at, paid_at, provider, provider_status, renews_order_id");
  if (since) q = q.gte("created_at", since.toISOString());
  let { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  if (error) return null;
  // Cancelled and failed orders drop off after 24 hours (the nightly cleanup then deletes them).
  data = (data ?? []).filter((o) => showOrder(o as { status: string; created_at: string }));
  const emails = new Map<string, string>();
  await Promise.all(
    [...new Set((data ?? []).map((o) => o.user_id as string | null).filter((x): x is string => !!x))].map(async (id) => {
      const { data: u } = await db.auth.admin.getUserById(id);
      if (u.user?.email) emails.set(id, u.user.email);
    }),
  );
  return (data ?? []).map((o) => ({ ...(o as Omit<AdminOrder, "email">), email: o.user_id ? (emails.get(o.user_id as string) ?? null) : null }));
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string }> }) {
  const { user } = await requireUser();
  // Anyone else sees a plain 404, so the page's existence isn't advertised.
  if ((await entitlements.planOf(user.id)) !== "admin") notFound();
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const range = parseRange(sp.range);

  return (
    <div>
      <h1 className="page-title">Admin</h1>
      {/* Each tab loads only what it shows. */}
      <AdminTabs tab={tab} />
      <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-6">
        {tab === "orders" && <OrdersTab range={range} />}
        {tab === "people" && <PeopleTab />}
        {tab === "limits" && <LimitsTab />}
        {tab === "costs" && <CostsTab />}
      </div>
    </div>
  );
}

async function OrdersTab({ range }: { range: ReturnType<typeof parseRange> }) {
  const since = rangeStart(range);
  const [paid, orders] = await Promise.all([loadPaidOrders(since), loadOrders(since)]);
  return (
    <>
      <AdminRevenue r={summarizeRevenue(paid, range)} />
      <AdminOrders orders={orders} />
      <AdminPayments />
    </>
  );
}

async function PeopleTab() {
  const [{ stats }, extras, config] = await Promise.all([loadAdminStats(), loadPeopleExtras(), getAppConfig()]);
  return <AdminPeople users={stats.users} extras={extras} freeRunCap={config.caps.free.runs} />;
}

async function LimitsTab() {
  return <CapsForm config={await getAppConfig()} />;
}

async function CostsTab() {
  const [config, { stats, finance, financeWithAdmins, usageMissing }] = await Promise.all([getAppConfig(), loadAdminStats()]);
  return <AdminConsole config={config} stats={stats} finance={finance} financeWithAdmins={financeWithAdmins} usageMissing={usageMissing} />;
}
