import Link from "next/link";
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
import { parseRange, rangeStart, summarizeRevenue } from "@/lib/admin-revenue";
import { cn } from "@/lib/utils";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TABS = [
  { id: "orders", label: "Orders" },
  { id: "people", label: "People" },
  { id: "limits", label: "Limits" },
  { id: "costs", label: "Costs" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// Orders in the range with the buyer's email, newest first. Null before migration 0023.
async function loadOrders(since: Date | null): Promise<AdminOrder[] | null> {
  const db = adminClient();
  let q = db.from("orders").select("id, user_id, kind, pack_id, credits, amount_cents, first_month_bonus, status, created_at, paid_at, provider, provider_status, renews_order_id");
  if (since) q = q.gte("created_at", since.toISOString());
  const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  if (error) return null;
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
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "orders";
  const range = parseRange(sp.range);

  return (
    <div>
      <h1 className="page-title">Admin</h1>
      {/* Each tab loads only what it shows. */}
      <nav aria-label="Admin sections" className="mt-4 flex gap-1 overflow-x-auto border-b border-neutral-800">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              t.id === tab ? "border-brand-500 text-neutral-50" : "border-transparent text-neutral-400 hover:text-neutral-100",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6 flex flex-col gap-6">
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
