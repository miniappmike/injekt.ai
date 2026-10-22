import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleKeyForm, type SavedRole, type ShareSource } from "@/components/key-form";
import { requireUser } from "@/lib/auth";
import { PROVIDER_LABELS } from "@/lib/ai/providers/detect";
import { isShared, readRoles, ROLES, type RoleId } from "@/lib/ai/roles";

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const { provider: wanted } = await searchParams;
  const { supabase, user } = await requireUser();

  const [{ data: keys }, { data: settings }] = await Promise.all([
    supabase.rpc("list_my_api_keys"),
    supabase.from("user_settings").select("prefs").eq("user_id", user.id).maybeSingle(),
  ]);
  const roles = readRoles(settings?.prefs);
  const last4 = (provider: string, kind: string) =>
    (keys ?? []).find((k: { provider: string; kind: string; last4: string }) => k.provider === provider && k.kind === kind)?.last4;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">API keys</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Bring your own keys. Paste one and we work out the provider. Keys are encrypted before storage and only the last 4 characters are shown back.
      </p>
      {wanted && <p className="mt-3 text-amber-400">Add a key below to continue.</p>}
      <div className="mt-6 flex flex-col gap-4">
        {ROLES.map((r) => {
          const cfg = roles[r.id];
          const labelOf = (id: RoleId) => ROLES.find((x) => x.id === id)!.label;
          const source = cfg && isShared(cfg) ? roles[cfg.keyFrom] : undefined;
          const own = cfg && !isShared(cfg) ? cfg : source && !isShared(source) ? source : undefined;
          const tail = cfg && !isShared(cfg) ? last4(cfg.provider, r.id) : undefined;
          const usedBy = ROLES.filter((x) => x.id !== r.id && roles[x.id] && isShared(roles[x.id]!) && (roles[x.id] as { keyFrom: RoleId }).keyFrom === r.id).map((x) => x.label);

          const saved: SavedRole | undefined =
            cfg && own && (isShared(cfg) || tail)
              ? {
                  providerLabel: PROVIDER_LABELS[own.provider] ?? own.provider,
                  model: cfg.model,
                  baseUrl: own.baseUrl,
                  last4: tail,
                  sharedFrom: isShared(cfg) ? labelOf(cfg.keyFrom) : undefined,
                  usedBy,
                }
              : undefined;

          // Offer to reuse the other job's key when that job has a key of its own.
          const other = ROLES.find((x) => x.id !== r.id)!;
          const otherCfg = roles[other.id];
          const shareSource: ShareSource | undefined =
            otherCfg && !isShared(otherCfg) && last4(otherCfg.provider, other.id)
              ? { id: other.id, label: other.label, providerLabel: PROVIDER_LABELS[otherCfg.provider] ?? otherCfg.provider, model: otherCfg.model }
              : undefined;
          return (
            <Card key={r.id} className={wanted === r.id ? "border-amber-500" : undefined}>
              <CardHeader>
                <CardTitle>{r.label}</CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <RoleKeyForm role={r.id} saved={saved} shareSource={shareSource} />
              </CardContent>
            </Card>
          );
        })}
        <Card className="opacity-60">
          <CardHeader>
            <CardTitle>Image</CardTitle>
            <CardDescription>Generates images. Coming soon.</CardDescription>
          </CardHeader>
        </Card>
        <p className="text-sm text-neutral-500">
          If you leave Vision or Text empty, it uses the other one. One key is enough to start.
        </p>
      </div>
    </div>
  );
}
