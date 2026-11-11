import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleKeyForm, type SavedRole, type ShareSource } from "@/components/key-form";
import { requireUser } from "@/lib/auth";
import { GenerationToggle } from "@/components/generation-toggle";
import { GetKeyCard } from "@/components/get-key-card";
import { generationState } from "@/lib/generation-access";
import { PROVIDER_LABELS } from "@/lib/ai/providers/detect";
import { effectiveRole, isShared, providerSupports, readRoles, ROLES, type RoleId } from "@/lib/ai/roles";
import { SPICY_IMAGE_MODEL } from "@/lib/ai/providers/detect";
import { priceFor } from "@/lib/pricing";

// What turns this job's tokens into dollars, and whose number it is.
function textPrice(roles: ReturnType<typeof readRoles>, id: RoleId) {
  const chosen = effectiveRole(roles, id);
  if (!chosen) return {};
  const { price, source } = priceFor(chosen.cfg);
  return { price, priceSource: source };
}

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
      <h1 className="page-title">Settings</h1>
      {wanted && <p className="mt-3 text-amber-400">Add a key below to continue.</p>}

      <section className="mt-6 flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold text-neutral-50">Your own AI keys <span className="text-sm font-normal text-neutral-500">(optional)</span></h2>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          You don&apos;t need any keys: prompts are written for you on our AI, within your daily allowance. Add your own key and your prompts run on it instead,{" "}
          <b className="text-neutral-200">with no daily limit</b>. Paste a key and we work out the provider. Keys are encrypted, and only the last 4 characters are ever shown.
        </p>
      </section>
      {/* Until they have a key that can make images: where to get one. */}
      {!generationState(settings?.prefs).hasImageKey && <GetKeyCard className="mt-4" />}
      <div className="mt-4 flex flex-col gap-4">
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
                  // SpicyAPI keys get each call's real charge on the ledger, so they need no price.
                  realCosts: providerSupports(own, "image"),
                  ...(r.id !== "image" ? textPrice(roles, r.id) : {}),
                }
              : undefined;

          // Offer to reuse another job's key when that job has a key of its own that can do this job too.
          const shareSources: ShareSource[] = ROLES.filter((o) => o.id !== r.id).flatMap((o) => {
            const c = roles[o.id];
            if (!c || isShared(c) || !last4(c.provider, o.id) || !providerSupports(c, r.id)) return [];
            return [{ id: o.id, label: o.label, providerLabel: PROVIDER_LABELS[c.provider] ?? c.provider, model: c.model, imageModel: SPICY_IMAGE_MODEL }];
          });
          return (
            <Card key={r.id} className={wanted === r.id ? "border-amber-500" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {r.label}
                  {"optional" in r && r.optional && (
                    <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-semibold text-neutral-400 ring-1 ring-neutral-700">Optional</span>
                  )}
                </CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <RoleKeyForm role={r.id} saved={saved} shareSources={shareSources} />
              </CardContent>
            </Card>
          );
        })}
        <p className="text-sm text-neutral-500">
          If you leave Vision or Text empty, it uses the other one. A SpicyAPI key can serve all three jobs: paste it once and reuse it on the others.
        </p>
        <GenerationToggle {...generationState(settings?.prefs)} />
      </div>
    </div>
  );
}
