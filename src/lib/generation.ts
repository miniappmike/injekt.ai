import { loadGenerationState } from "@/lib/generation-access";
import "server-only";
import { after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { adminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/ratelimit";
import { safeFetchBytes } from "@/lib/ssrf";
import { NO_SPEND, spendCredits, spendHandle, type CreditSpend } from "@/lib/credits";
import { canUseOwnKeys, useDaily, type DailySlot } from "@/lib/daily-limits";
import { getAppConfig } from "@/lib/app-config";
import { IMAGE_CREDITS } from "@/lib/plans";
import { ApiKeyRequiredError, UserFacingError } from "@/lib/errors";
import { getUserImageConfig, resolveUserImageKey } from "@/lib/ai/image-setup";
import { getImageProvider } from "@/lib/ai/providers/registry";
import { IMAGE_ASPECT_RATIOS, IMAGE_RESOLUTIONS, type ImageJobInput, type ImageResolution } from "@/lib/ai/providers/types";
import { buildJob, fitPrompt, GEN_PREFIX, SERVER_PROMPT_KINDS } from "@/lib/generation-job";
import { injectMetaSchema } from "@/lib/inject-meta";
import { MEDIA_BUCKET } from "@/lib/images";
import { GENERATION_RETENTION_HOURS, generationExpiry } from "@/lib/retention";
import { recordLedgerEntry } from "@/lib/ledger";
import { settleSoon } from "@/lib/ledger-settle";

export const GENERATION_KINDS = ["inject", "direct_swap", "edit", "variant", "carousel", "face_fix", "likeness_fix", "reference_sheet", "group_photo", "art_to_real"] as const;
export const GENERATIONS_BUCKET = "generations";
/** How long the image provider has to fetch the pictures we hand it. */
export const INPUT_URL_SECONDS = 1800;
export const FREE_IMAGE_RESOLUTION: ImageResolution = "1k";
export const MAX_INPUT_IMAGES = 10;

const requestSchema = z.object({
  kind: z.enum(GENERATION_KINDS),
  characterId: z.string().uuid("That character couldn't be found.").nullish(),
  /** Pictures that follow the character's references, in the order the prompt refers to them. */
  extraPaths: z.array(z.string()).max(MAX_INPUT_IMAGES).default([]),
  prompt: z.string().trim().min(1, "Write a prompt first.").max(5000, "That prompt is too long (5,000 characters at most)."),
  resolution: z.enum(IMAGE_RESOLUTIONS),
  aspectRatio: z.enum(IMAGE_ASPECT_RATIOS),
  outputFormat: z.enum(["jpeg", "png"]),
  /** Inject only: what the server needs to frame the prompt for the image model (see generation-job). */
  meta: injectMetaSchema.optional(),
  /** The History prompt this image was made from, so History can show it again ("Preview generation"). */
  historyId: z.string().uuid().nullish(),
  /** A random id from the browser for this press, so a phone that lost the answer can find the job it started. */
  clientRef: z.string().uuid().optional(),
  /** A one-off image model for this generation (the page's model box); without it, the one in Settings. */
  model: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*){1,3}$/i, "That model ID doesn't look right. It looks like bytedance/seedream-5.5/edit.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type GenerationRequest = z.infer<typeof requestSchema>;

export function parseGenerationRequest(raw: unknown): GenerationRequest {
  // The server writes the prompt for fixes; what the browser sends is only a label for it.
  if (raw && typeof raw === "object" && (SERVER_PROMPT_KINDS as readonly string[]).includes((raw as { kind?: string }).kind ?? "") && (raw as { meta?: unknown }).meta) {
    const r = raw as { prompt?: unknown };
    if (typeof r.prompt !== "string" || !r.prompt.trim()) raw = { ...r, prompt: "Fix" };
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "That request wasn't valid.");
  return parsed.data;
}

export interface Actor {
  id: string;
  email_confirmed_at?: string | null;
}

interface Access {
  source: "byok" | "server";
  apiKey: string;
  model: string;
  /** Always false now (the old one-off free image); kept for the client's result shape. */
  free: boolean;
}

// Decides whose key pays. Pro accounts with their own Image key use it (nothing is charged here). Everyone else uses
// the platform's key and pays in credits (IMAGE_CREDITS by size), with a daily image cap on the free plan.
async function resolveAccess(supabase: SupabaseClient, user: Actor): Promise<Access> {
  const [state, cfg, own] = await Promise.all([loadGenerationState(supabase, user.id), getUserImageConfig(supabase, user.id), canUseOwnKeys(user.id)]);
  if (!state.enabled) throw new UserFacingError("Image generation is off. Turn it on in Settings to generate here.");
  if (own && cfg) return { source: "byok", apiKey: await resolveUserImageKey(user.id, cfg), model: cfg.model, free: false };
  if (!env.SPICY_API_KEY) throw new UserFacingError("Image generation isn't available right now. Try again later.");
  return { source: "server", apiKey: env.SPICY_API_KEY, model: (await getAppConfig()).serverImageModel, free: false };
}

/** The page's one-off model, when it set one, in place of the person's Settings model (own key only). */
const withModel = (access: Access, model?: string): Access => (model && access.source === "byok" ? { ...access, model } : access);

// The prompt to send and signed links to its images, in prompt order.
async function prepareInput(
  supabase: SupabaseClient,
  userId: string,
  request: GenerationRequest,
  model: string,
  { forQuote = false } = {},
): Promise<{ prompt: string; imageUrls: string[]; photoEdit: boolean }> {
  const job = await buildJob(supabase, userId, request, { model, max: MAX_INPUT_IMAGES, forQuote });
  const paths = job.paths;
  if (!paths.length) throw new UserFacingError("Add at least one image.");
  if (paths.length > MAX_INPUT_IMAGES) throw new UserFacingError(`That's too many images (${MAX_INPUT_IMAGES} at most).`);

  // Character media and generated images (used as the image to fix) live in different buckets.
  const media = paths.filter((p) => !p.startsWith(GEN_PREFIX));
  const gens = paths.filter((p) => p.startsWith(GEN_PREFIX)).map((p) => p.slice(GEN_PREFIX.length));
  const sign = async (bucket: string, list: string[]) =>
    list.length ? supabase.storage.from(bucket).createSignedUrls(list, INPUT_URL_SECONDS) : { data: [] as { path: string | null; signedUrl: string }[], error: null };
  const [m, g] = await Promise.all([sign(MEDIA_BUCKET, media), sign(GENERATIONS_BUCKET, gens)]);
  const byPath = new Map([...(m.data ?? []).map((d) => [d.path, d.signedUrl] as const), ...(g.data ?? []).map((d) => [GEN_PREFIX + d.path, d.signedUrl] as const)]);
  const urls = paths.map((p) => byPath.get(p));
  if (m.error || g.error || urls.some((u) => !u)) throw new UserFacingError("Couldn't load one of the images. Try again.");
  const prompt = await fitPrompt(supabase, userId, job.prompt, paths.length, { forQuote });
  return { prompt, imageUrls: urls as string[], photoEdit: job.photoEdit };
}

const toInput = (request: GenerationRequest, prepared: { prompt: string; imageUrls: string[] }, resolution: ImageResolution): ImageJobInput => ({
  prompt: prepared.prompt,
  imageUrls: prepared.imageUrls,
  resolution,
  aspectRatio: request.aspectRatio,
  outputFormat: request.outputFormat,
});

export type StartResult = { generationId: string; free: boolean };

export async function startGeneration(supabase: SupabaseClient, user: Actor, raw: unknown): Promise<StartResult> {
  const request = parseGenerationRequest(raw);
  // 12 a minute leaves room for "Generate all" on the largest carousel (7 slides) or variant set (8).
  await enforceRateLimit(user.id, "image", 12, 60);

  const access = withModel(await resolveAccess(supabase, user), request.model);
  let submitted = false;
  let generationId: string | undefined;
  let spend: CreditSpend = NO_SPEND;
  let slot: DailySlot | null = null;
  const db = adminClient();
  try {
    const resolution = request.resolution;
    const prepared = await prepareInput(supabase, user.id, request, access.model);
    // Credits (and the free plan's daily image cap) are taken only once the request is known to be good.
    if (access.source === "server") {
      slot = await useDaily(supabase, user.id, "images");
      spend = await spendCredits(user.id, IMAGE_CREDITS[resolution], `image:${request.kind}`);
    }

    // The row comes first: its id is the idempotency key, so a retry can never start (or charge) a second job.
    const { data: row, error } = await db
      .from("generations")
      .insert({
        user_id: user.id,
        character_id: request.characterId ?? null,
        kind: request.kind,
        status: "pending",
        provider: "spicyapi",
        model: access.model,
        // Director's prompt is written here and never shown: the row keeps the person's own direction instead.
        prompt: request.meta?.direct ? request.prompt : prepared.prompt,
        params: {
          resolution,
          aspect_ratio: request.aspectRatio,
          output_format: request.outputFormat,
          key_source: access.source,
          free: access.free,
          ...(spend.id ? { credit_spend: spend.id, credits: IMAGE_CREDITS[resolution] } : {}),
          image_count: prepared.imageUrls.length,
          ...(prepared.photoEdit ? { photo_edit: true } : {}),
          ...(request.historyId ? { history_id: request.historyId } : {}),
          ...(request.kind === "group_photo" && request.meta?.group ? { group_ids: request.meta.group } : {}),
          ...(request.clientRef ? { client_ref: request.clientRef } : {}),
        },
      })
      .select("id")
      .single();
    if (error || !row) throw new Error("Couldn't start the generation. Try again.");
    generationId = row.id as string;

    const provider = getImageProvider("spicyapi");
    try {
      const job = await provider.submit({
        apiKey: access.apiKey,
        model: access.model,
        input: toInput(request, prepared, resolution),
        idempotencyKey: generationId,
        // The provider keeps the files no longer than we do.
        retentionSeconds: GENERATION_RETENTION_HOURS * 3600,
      });
      submitted = true;
      // The job is running and charged, so make sure we can find it again: one retry if saving its id fails.
      const link = () =>
        db.from("generations").update({ provider_job_id: job.jobId, status: "processing", cost_usd: job.estimatedCost ?? null }).eq("id", generationId as string);
      if ((await link()).error) await link();
    } catch (e) {
      await db
        .from("generations")
        .update({ status: "failed", error: e instanceof Error ? e.message : "Couldn't start the generation.", completed_at: new Date().toISOString() })
        .eq("id", generationId);
      throw e;
    }
    return { generationId, free: access.free };
  } catch (e) {
    // Credits are only used up when a job really started.
    if (!submitted) {
      await spend.refund().catch(() => {});
      await slot?.release().catch(() => {});
    }
    throw e;
  }
}

/** The price of a generation, or null when none applies (the free image has no price to show). */
export async function quoteGeneration(supabase: SupabaseClient, user: Actor, raw: unknown): Promise<{ estimatedCost: string } | null> {
  const request = parseGenerationRequest(raw);
  await enforceRateLimit(user.id, "image-quote", 30, 60);
  const access = withModel(await resolveAccess(supabase, user), request.model);
  // Credits have a fixed price per size, shown on the button; only an own key gets a dollar quote.
  if (access.source === "server") return null;
  const prepared = await prepareInput(supabase, user.id, request, access.model, { forQuote: true });
  return getImageProvider("spicyapi").quote({ apiKey: access.apiKey, model: access.model, input: toInput(request, prepared, request.resolution) });
}

export type CollectResult =
  | { state: "pending" | "processing" }
  | { state: "complete"; url: string; downloadUrl: string; expiresAt: string }
  | { state: "failed"; error: string };

type Row = {
  id: string;
  kind: string;
  model: string | null;
  status: string;
  provider_job_id: string | null;
  params: { key_source?: string; free?: boolean; output_url?: string; output_mime?: string; credit_spend?: string } | null;
  output_path: string | null;
  error: string | null;
  expires_at: string | null;
};

async function view(supabase: SupabaseClient, row: Row): Promise<CollectResult> {
  if (row.status === "failed") return { state: "failed", error: row.error ?? "The image couldn't be generated." };
  if (row.status !== "complete" || !row.expires_at) return { state: "processing" };
  // Finished, and our copy is still being saved: show the provider's own link meanwhile.
  if (!row.output_path) {
    const direct = row.params?.output_url;
    return direct ? { state: "complete", url: direct, downloadUrl: direct, expiresAt: row.expires_at } : { state: "failed", error: "This image has expired." };
  }
  const ttl = Math.max(60, Math.min(3600, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000)));
  const storage = supabase.storage.from(GENERATIONS_BUCKET);
  const [shown, saved] = await Promise.all([storage.createSignedUrl(row.output_path, ttl), storage.createSignedUrl(row.output_path, ttl, { download: true })]);
  if (!shown.data || !saved.data) return { state: "failed", error: "This image has expired." };
  return { state: "complete", url: shown.data.signedUrl, downloadUrl: saved.data.signedUrl, expiresAt: row.expires_at };
}

const extensionFor = (mime?: string) => (mime?.includes("png") ? "png" : mime?.includes("webp") ? "webp" : "jpg");
// Looks at a job once. When it has finished, copies the image into our storage, stamps its expiry and records the cost.
export async function collectGeneration(supabase: SupabaseClient, user: Actor, generationId: string): Promise<CollectResult> {
  const columns = "id, kind, model, status, provider_job_id, params, output_path, error, expires_at";
  const { data } = await supabase.from("generations").select(columns).eq("id", generationId).maybeSingle();
  const row = data as Row | null;
  if (!row) throw new UserFacingError("Generation not found.");
  if (row.status === "complete" && !row.output_path && row.params?.output_url) {
    // Our copy wasn't saved yet (or saving failed): try again now.
    const path = await storeOutput(adminClient(), user.id, row.id, row.params.output_url, row.params.output_mime).catch(() => null);
    return view(supabase, path ? { ...row, output_path: path } : row);
  }
  if (row.status === "complete" || row.status === "failed") return view(supabase, row);
  if (!row.provider_job_id) return { state: "pending" };

  // Whoever started the job pays for it, so poll with the same kind of key.
  let apiKey: string;
  if (row.params?.key_source === "server") {
    if (!env.SPICY_API_KEY) throw new UserFacingError("Couldn't check on this image right now. Try again later.");
    apiKey = env.SPICY_API_KEY;
  } else {
    const cfg = await getUserImageConfig(supabase, user.id);
    if (!cfg) throw new ApiKeyRequiredError("image");
    apiKey = await resolveUserImageKey(user.id, cfg);
  }

  const job = await getImageProvider("spicyapi").poll({ apiKey, jobId: row.provider_job_id });
  if (job.status === "pending" || job.status === "processing") return { state: job.status };

  const db = adminClient();
  const keySource = row.params?.key_source === "server" ? "server" : "byok";
  // What the provider says the job cost (while it is still unsettled this is the held amount, the most it can charge).
  const reported = job.cost !== undefined && Number.isFinite(Number(job.cost)) ? Number(job.cost) : null;
  // Only the request that moves the row out of pending/processing writes the ledger or hands anything back, so two
  // tabs checking the same job can never record it twice.
  const finish = async (status: "succeeded" | "failed", patch: Record<string, unknown>) => {
    const { data: won } = await db
      .from("generations")
      .update({ ...patch, completed_at: new Date().toISOString(), ...(reported !== null ? { cost_usd: reported } : {}) })
      .eq("id", row.id)
      .in("status", ["pending", "processing"])
      .select("id");
    if (!won?.length) return false;
    // Every finished generation goes on the ledger, including a failed one (it usually costs nothing, but a refusal can be charged).
    const settled = job.settled === true && reported !== null;
    const ledgerId = await recordLedgerEntry(db, {
      userId: user.id,
      platform: "spicyapi",
      job: "image",
      feature: `image:${row.kind}`,
      model: row.model,
      keySource,
      status,
      costUsd: reported,
      costSource: reported !== null ? "provider" : null,
      generationId: row.id,
      providerTaskIds: [row.provider_job_id as string],
      costSettled: settled,
    });
    // Until it settles, the cost is the amount held (the most it can charge): look up the final charge shortly.
    if (ledgerId !== null && !settled) settleSoon(db, ledgerId, apiKey, [row.provider_job_id as string]);
    return true;
  };

  if (job.status === "failed") {
    const won = await finish("failed", { status: "failed", error: job.error ?? "The image couldn't be generated." });
    // A failed image costs nothing: its credits go back.
    if (won && row.params?.credit_spend) await spendHandle(row.params.credit_spend).refund().catch(() => {});
    return { state: "failed", error: job.error ?? "The image couldn't be generated." };
  }

  // Shown at once from the provider's link; our own copy is saved right after the answer goes out (and again on the
  // next check if that fails), so nobody waits for the download and upload.
  const outputUrl = job.outputUrl as string;
  const params = { ...(row.params ?? {}), output_url: outputUrl, ...(job.mime ? { output_mime: job.mime } : {}) };
  const won = await finish("succeeded", { status: "complete", params, expires_at: generationExpiry().toISOString() });
  if (won) {
    const save = () => storeOutput(db, user.id, row.id, outputUrl, job.mime).catch(() => null);
    try {
      after(save);
    } catch {
      await save(); // Outside a request (tests): save it now.
    }
  }

  const { data: fresh } = await supabase.from("generations").select(columns).eq("id", row.id).maybeSingle();
  return view(supabase, (fresh as Row | null) ?? row);
}

/** Copies a finished image from the provider into our storage and points the row at it. Returns the stored path. */
export async function storeOutput(db: SupabaseClient, userId: string, generationId: string, outputUrl: string, mime?: string): Promise<string> {
  const { bytes, contentType } = await safeFetchBytes(outputUrl);
  const path = `${userId}/${generationId}.${extensionFor(mime ?? contentType)}`;
  const up = await db.storage.from(GENERATIONS_BUCKET).upload(path, bytes, { contentType: mime ?? contentType, upsert: true });
  if (up.error) throw new Error("Couldn't save the finished image.");
  const { error } = await db.from("generations").update({ output_path: path }).eq("id", generationId);
  if (error) throw new Error("Couldn't save the finished image.");
  return path;
}

/** Checks the newest unfinished generations, so a page can show their result when the user comes back. */
export async function collectPending(supabase: SupabaseClient, user: Actor, limit = 5): Promise<void> {
  const [{ data }, { data: unsaved }] = await Promise.all([
    supabase
      .from("generations")
      .select("id")
      .in("status", ["pending", "processing"])
      .not("provider_job_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit),
    // Finished, but our copy of the image wasn't saved yet.
    supabase
      .from("generations")
      .select("id")
      .eq("status", "complete")
      .is("output_path", null)
      .not("params->>output_url", "is", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  for (const r of [...(data ?? []), ...(unsaved ?? [])]) {
    try {
      await collectGeneration(supabase, user, r.id as string);
    } catch {
      // One stuck job shouldn't stop the page; it is checked again next time.
    }
  }
}
