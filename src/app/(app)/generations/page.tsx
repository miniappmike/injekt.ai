import { Card, CardContent } from "@/components/ui/card";
import { ExpiryBadge } from "@/components/expiry-badge";
import { RetentionNotice } from "@/components/retention-notice";
import { GenerationPoller } from "@/components/generation-poller";
import { requireUser } from "@/lib/auth";
import { collectPending } from "@/lib/generation";
import { timeLeft } from "@/lib/retention";

const BUCKET = "generations";

// Finishing a job downloads and stores the image.
export const maxDuration = 60;

export default async function GenerationsPage() {
  const { supabase, user } = await requireUser();
  // Pick up anything that finished while you were away, before listing.
  await collectPending(supabase, user);
  const { data: rows } = await supabase
    .from("generations")
    .select("id, kind, status, model, prompt, error, output_path, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Only files that have not expired get links, and links stop working when the file does.
  const live = (rows ?? []).filter((r) => r.output_path && r.expires_at && !timeLeft(r.expires_at).expired);
  const ttl = (expiresAt: string) => Math.max(60, Math.min(3600, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  const previews = new Map<string, string>();
  const downloads = new Map<string, string>();
  for (const r of live) {
    const path = r.output_path as string;
    const [view, save] = await Promise.all([
      supabase.storage.from(BUCKET).createSignedUrl(path, ttl(r.expires_at as string)),
      supabase.storage.from(BUCKET).createSignedUrl(path, ttl(r.expires_at as string), { download: true }),
    ]);
    if (view.data) previews.set(r.id, view.data.signedUrl);
    if (save.data) downloads.set(r.id, save.data.signedUrl);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Generations</h1>
      <div className="mt-4"><RetentionNotice /></div>
      <GenerationPoller ids={(rows ?? []).filter((r) => r.status === "pending" || r.status === "processing").map((r) => r.id)} />

      {!rows?.length ? (
        <p className="mt-6 text-neutral-400">No generations yet. Image generation is coming soon, and everything you generate will appear here.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex gap-3 pt-5">
                {previews.get(r.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews.get(r.id)} alt="" className="h-24 w-24 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-500">
                    {r.output_path ? "Unavailable" : r.status === "complete" ? "Expired" : r.status === "failed" ? "Failed" : "Generating..."}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium capitalize">{r.kind.replace("_", " ")}{r.model ? ` · ${r.model}` : ""}</span>
                    {r.status === "complete" && <ExpiryBadge expiresAt={r.expires_at} />}
                  </div>
                  {r.prompt && <p className="mt-1 line-clamp-2 text-neutral-400">{r.prompt}</p>}
                  {r.error && <p className="mt-1 text-red-400">{r.error}</p>}
                  {downloads.get(r.id) && (
                    <a href={downloads.get(r.id)} className="mt-2 inline-block text-neutral-200 underline">Download</a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
