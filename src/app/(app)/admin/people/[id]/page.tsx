import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { loadPerson } from "@/lib/admin-data";
import { AdminPerson } from "@/components/admin-person";

export const metadata = { title: "Person · Admin" };
export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if ((await entitlements.planOf(user.id)) !== "admin") notFound();
  const p = await loadPerson((await params).id);
  if (!p) notFound();
  return <AdminPerson p={p} />;
}
