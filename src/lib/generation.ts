import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { adminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/ratelimit";
import { safeFetchBytes } from "@/lib/ssrf";
import { entitlements } from "@/lib/entitlements";
import { isEmailVerified, type Allowance } from "@/lib/entitlements-core";
import { ApiKeyRequiredError, UserFacingError } from "@/lib/errors";
import { resolveApiKey } from "@/lib/keys";
import { keyResolverDeps } from "@/lib/key-store";
import { getUserImageConfig, resolveUserImageKey } from "@/lib/ai/image-setup";
import { getImageProvider } from "@/lib/ai/providers/registry";
import { SPICY_IMAGE_MODEL } from "@/lib/ai/providers/spicyapi";
import { IMAGE_ASPECT_RATIOS, IMAGE_RESOLUTIONS, type ImageJobInput, type ImageResolution } from "@/lib/ai/providers/types";
import { buildJob, fitPrompt, GEN_PREFIX, SERVER_PROMPT_KINDS } from "@/lib/generation-job";
import { injectMetaSchema } from "@/lib/inject-meta";
import { MEDIA_BUCKET } from "@/lib/images";
import { GENERATION_RETENTION_HOURS, generationExpiry } from "@/lib/retention";
import { recordLedgerEntry } from "@/lib/ledger";

export const GENERATION_KINDS = ["inject", "direct_swap", "edit", "variant", "carousel", "face_fix", "likeness_fix", "reference_sheet"] as const;
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
  /** Uses the one-off free image, paid for by the platform. */
  free: boolean;
  allowance?: Allowance;
}

// Decides whose key pays. Pro and admin accounts use their own Image key (admins may fall back to the server key).
// Free accounts get one image on the platform's key, with a confirmed email.
async function resolveAccess(supabase: SupabaseClient, user: Actor, { forQuote = false } = {}): Promise<Access> {
  if (await entitlements.isUnlimited(user.id)) {
    const cfg = await getUserImageConfig(supabase, user.id);
    if (cfg) return { source: "byok", apiKey: await resolveUserImageKey(user.id, cfg), model: cfg.model, free: false };
    try {
      const { key, source } = await resolveApiKey(keyResolverDeps, user.id, "spicyapi", "image");
      return { source, apiKey: key, model: SPICY_IMAGE_MODEL, free: false };
    } catch (e) {
      if (e instanceof ApiKeyRequiredError) throw new ApiKeyRequiredError("image");
      throw e;
    }
  }

  if (!isEmailVerified(user)) throw new UserFacingError("Confirm your email address to use your free image.");
  if (!env.SPICY_API_KEY) throw new UserFacingError("The free image isn't available right now. Check back soon.");
  // A price check never uses up the free image.
  const allowance = forQuote ? undefined : await entitlements.useAllowance(user.id, "free_images");
  return { source: "server", apiKey: env.SPICY_API_KEY, model: SPICY_IMAGE_MODEL, free: true, allowance };
}

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

  const access = await resolveAccess(supabase, user);
  let submitted = false;
  let generationId: string | undefined;
  const db = adminClient();
  try {
    const resolution = access.free ? FREE_IMAGE_RESOLUTION : request.resolution;
    const prepared = await prepareInput(supabase, user.id, request, access.model);

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
        prompt: prepared.prompt,
        params: {
          resolution,
          aspect_ratio: request.aspectRatio,
          output_format: request.outputFormat,
          key_source: access.source,
          free: access.free,
          image_count: prepared.imageUrls.length,
          ...(prepared.photoEdit ? { photo_edit: true } : {}),
          ...(request.historyId ? { history_id: request.historyId } : {}),
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
    // The free image is only used up when a job really started.
    if (!submitted) await access.allowance?.release();
    throw e;
  }
}

/** The price of a generation, or null when none applies (the free image has no price to show). */
export async function quoteGeneration(supabase: SupabaseClient, user: Actor, raw: unknown): Promise<{ estimatedCost: string } | null> {
  const request = parseGenerationRequest(raw);
  await enforceRateLimit(user.id, "image-quote", 30, 60);
  const access = await resolveAccess(supabase, user, { forQuote: true });
  if (access.free) return null;
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
  params: { key_source?: string; free?: boolean } | null;
  output_path: string | null;
  error: string | null;
  expires_at: string | null;
};

async function view(supabase: SupabaseClient, row: Row): Promise<CollectResult> {
  if (row.status === "failed") return { state: "failed", error: row.error ?? "The image couldn't be generated." };
  if (row.status !== "complete" || !row.output_path || !row.expires_at) return { state: "processing" };
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
    await recordLedgerEntry(db, {
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
    });
    return true;
  };

  if (job.status === "failed") {
    const won = await finish("failed", { status: "failed", error: job.error ?? "The image couldn't be generated." });
    if (won && row.params?.free) await entitlements.releaseAllowance(user.id, "free_images");
    return { state: "failed", error: job.error ?? "The image couldn't be generated." };
  }

  const { bytes, contentType } = await safeFetchBytes(job.outputUrl as string);
  const path = `${user.id}/${row.id}.${extensionFor(job.mime ?? contentType)}`;
  const up = await db.storage.from(GENERATIONS_BUCKET).upload(path, bytes, { contentType: job.mime ?? contentType, upsert: true });
  if (up.error) throw new UserFacingError("Couldn't save the finished image. Try again in a moment.");
  await finish("succeeded", { status: "complete", output_path: path, expires_at: generationExpiry().toISOString() });

  const { data: fresh } = await supabase.from("generations").select(columns).eq("id", row.id).maybeSingle();
  return view(supabase, (fresh as Row | null) ?? row);
}

/** Checks the newest unfinished generations, so a page can show their result when the user comes back. */
export async function collectPending(supabase: SupabaseClient, user: Actor, limit = 5): Promise<void> {
  const { data } = await supabase
    .from("generations")
    .select("id")
    .in("status", ["pending", "processing"])
    .not("provider_job_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const r of data ?? []) {
    try {
      await collectGeneration(supabase, user, r.id as string);
    } catch {
      // One stuck job shouldn't stop the page; it is checked again next time.
    }
  }
}
