import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyForm } from "@/components/key-form";
import { requireUser } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ai/providers/catalog";
import { deleteKey, makeDefault } from "./actions";

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const { provider: wanted } = await searchParams;
  const { supabase, user } = await requireUser();

  const [{ data: keys }, { data: settings }] = await Promise.all([
    supabase.rpc("list_my_api_keys"),
    supabase.from("user_settings").select("default_llm_provider, prefs").eq("user_id", user.id).maybeSingle(),
  ]);
  const saved = new Map<string, { last4: string }>((keys ?? []).map((k: { provider: string; last4: string }) => [k.provider, k]));
  const models = (settings?.prefs as { models?: Record<string, string> } | null)?.models ?? {};

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">API keys</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Bring your own keys. They are encrypted before storage and only the last 4 characters are ever shown back.
      </p>
      {wanted && saved.size === 0 && <p className="mt-3 text-amber-400">Add a key below to continue.</p>}
      <div className="mt-6 flex flex-col gap-4">
        {PROVIDERS.map((p) => {
          const k = saved.get(p.id);
          const isDefault = p.kind === "llm" && settings?.default_llm_provider === p.id && !!k;
          return (
            <Card key={p.id} className={wanted === p.id ? "border-amber-500" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {p.label}
                  {k && <span className="text-xs font-normal text-neutral-400">key ending {k.last4}</span>}
                  {isDefault && <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-xs font-normal text-emerald-300">default</span>}
                </CardTitle>
                <CardDescription>
                  {p.note}{" "}
                  {p.keyUrl && (
                    <a href={p.keyUrl} target="_blank" rel="noreferrer" className="underline">Get a key</a>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <KeyForm provider={p} currentModel={models[p.id]} hasKey={!!k} />
                {k && (
                  <div className="flex gap-2">
                    {p.kind === "llm" && !isDefault && (
                      <form action={makeDefault}>
                        <input type="hidden" name="provider" value={p.id} />
                        <Button type="submit" size="sm" variant="secondary">Use this one</Button>
                      </form>
                    )}
                    <form action={deleteKey}>
                      <input type="hidden" name="provider" value={p.id} />
                      <Button type="submit" size="sm" variant="ghost">Remove key</Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
